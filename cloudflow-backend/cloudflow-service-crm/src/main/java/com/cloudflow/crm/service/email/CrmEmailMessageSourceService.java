package com.cloudflow.crm.service.email;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.message.api.MessageDeliveryResult;
import com.cloudflow.common.message.api.MessageDeliverySnapshot;
import com.cloudflow.common.message.api.MessageEmailTemplate;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSourceCheck;
import com.cloudflow.common.message.api.MessageSourceResult;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.crm.domain.CrmCampaign;
import com.cloudflow.crm.domain.CrmMassEmail;
import com.cloudflow.crm.domain.CrmMassEmailRecipient;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmCampaignMapper;
import com.cloudflow.crm.mapper.CrmEmailSuppressionMapper;
import com.cloudflow.crm.mapper.CrmMassEmailMapper;
import com.cloudflow.crm.mapper.CrmMassEmailRecipientMapper;
import com.cloudflow.crm.service.impl.CrmAudienceService;
import com.cloudflow.crm.service.impl.CrmCampaignDeliveryService;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.cloudflow.crm.service.remote.CrmMessageDeliveryClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@RequiredArgsConstructor
public class CrmEmailMessageSourceService {
    private final CrmMassEmailRecipientMapper recipients;
    private final CrmMassEmailMapper tasks;
    private final CrmCampaignMapper campaigns;
    private final CrmEmailSuppressionMapper suppressions;
    private final CrmEmailSnapshotService snapshots;
    private final CrmEmailPolicyService policies;
    private final CrmEmailAccessService access;
    private final CrmEmailAudienceService audiences;
    private final CrmEmailStatisticsService statistics;
    private final CrmMessageDeliveryClient messages;
    private final TransactionTemplate transactions;
    private final ObjectMapper json;

    public MessageSourceResult verify(MessageSourceCheck check) {
        try {
            if (check == null || check.request() == null || check.recordId() == null || check.eventId() == null) return denied("SOURCE_INVALID");
            MessageSendRequest request = check.request();
            if (!CrmEmailSnapshotService.BUSINESS_TYPE.equals(request.getBizType())) return denied("SOURCE_INVALID");
            CrmMassEmailRecipient recipient = recipients.selectById(identifier(request.getBizId()));
            if (recipient == null || !Objects.equals(recipient.getTenantId(), CrmRecordSupport.tenantId())) return denied("SOURCE_INVALID");
            if (!matches(recipient, request)) return denied("SOURCE_INVALID");
            boolean current = Objects.equals(recipient.getMessageRecordId(), check.recordId())
                    || recipient.getMessageRecordId() == null && request.getResendFromId() == null;
            if (current ? !Set.of("QUEUED", "UNKNOWN").contains(recipient.getStatus())
                    : !failedResend(recipient, request, parent(request))) return denied("SOURCE_INVALID");
            CrmMassEmail task = tasks.selectById(recipient.getMassEmailId());
            if (task == null || !Integer.valueOf(0).equals(task.getDeleted()) || "CANCELLED".equals(task.getStatus())) return denied("SOURCE_CANCELLED");
            JsonNode document = snapshots.document(recipient);
            CrmEmailAccessService.Actor actor = access.resolve(CrmCampaignDeliveryService.operatorId(document.path("operatorId")));
            CrmCampaign campaign = campaigns.selectAccessible(recipient.getCampaignId(), actor.scope("scope_dept_id", "owner_id"));
            actor.assertSending(campaign);
            if (Integer.valueOf(0).equals(recipient.getTestFlag()) ? !"ACTIVE".equals(campaign.getStatus())
                    : Set.of("COMPLETED", "CANCELLED").contains(campaign.getStatus())) return denied("SOURCE_DISABLED");
            if (suppressions.exists(recipient.getTenantId(), recipient.getEmailHash())) return denied("UNSUBSCRIBED");
            CrmEmailPolicyService.Policy policy = policies.get(recipient.getTenantId());
            if (!policy.sendingEnabled() || !Objects.equals(policy.publicOrigin(), document.path("publicOrigin").asText())
                    || policy.trackingEnabled() != document.path("trackingEnabled").asBoolean()) return denied("SOURCE_DISABLED");
            for (String field : Set.of("destinations", "images")) {
                if (!document.path(field).isArray()) return denied("SOURCE_INVALID");
                for (JsonNode target : document.path(field)) if (!target.isTextual() || !policy.destination(target.textValue()).equals(target.textValue())) return denied("SOURCE_INVALID");
            }
            R<MessageEmailTemplate> response = messages.template(request.getTemplateCode());
            if (response == null || !response.isSuccess() || response.getData() == null) return denied("SOURCE_UNAVAILABLE");
            if (!response.getData().ready() || !snapshots.templateDigest(response.getData()).equals(document.path("templateDigest").asText())) return denied("TEMPLATE_CHANGED");
            if (Integer.valueOf(0).equals(recipient.getTestFlag())) {
                boolean eligible = audiences.collect(recipient.getCampaignId(), actor).recipients().stream().anyMatch(member ->
                        Objects.equals(member.getMemberType(), recipient.getTargetType()) && Objects.equals(member.getMemberRefId(), recipient.getTargetId())
                                && CrmEmailSecurity.emailHash(member.getEmail()).equals(recipient.getEmailHash()));
                if (!eligible) return denied("SOURCE_RECIPIENT_REMOVED");
            }
            return new MessageSourceResult(true, null);
        } catch (CrmBusinessException invalid) { return denied("SOURCE_INVALID"); }
    }

    public void deliveryEvent(BusinessEventEnvelope envelope) throws Exception {
        if (!"cloudflow-auth".equals(envelope.getSourceModule()) || !Objects.equals(envelope.getTenantId(), UserContext.getTenantId())) {
            throw new ServiceException("投递结果来源无效", 403);
        }
        MessageDeliveryResult announced = json.readValue(envelope.getPayload(), MessageDeliveryResult.class);
        if (!CrmEmailSnapshotService.BUSINESS_TYPE.equals(announced.businessType())) return;
        if (!Objects.equals(envelope.getTenantId(), announced.tenantId()) || announced.recordId() == null) throw new ServiceException("投递结果关联无效", 403);
        R<MessageDeliverySnapshot> response = messages.snapshot(announced.recordId());
        if (response == null || !response.isSuccess() || response.getData() == null) throw new IllegalStateException("无法核实营销邮件真实投递结果");
        MessageDeliveryResult actual = response.getData().result();
        if (actual == null || response.getData().request() == null || !Objects.equals(actual.tenantId(), envelope.getTenantId())
                || !Objects.equals(actual.recordId(), announced.recordId()) || !Objects.equals(actual.deliveryId(), announced.deliveryId())
                || !Objects.equals(actual.outboxEventId(), announced.outboxEventId()) || !Objects.equals(actual.businessId(), announced.businessId())
                || !Objects.equals(actual.businessType(), announced.businessType()) || !"EMAIL".equals(actual.channelType())) {
            throw new ServiceException("营销投递结果关联不一致", 409);
        }
        MessageDeliverySnapshot parent = parent(response.getData().request());
        Long campaignId = transactions.execute(status -> applyResult(response.getData(), parent));
        if (campaignId != null) statistics.refreshCampaign(campaignId);
    }

    private Long applyResult(MessageDeliverySnapshot snapshot, MessageDeliverySnapshot parent) {
        MessageDeliveryResult result = snapshot.result();
        CrmMassEmailRecipient reference = recipients.selectById(identifier(result.businessId()));
        if (reference == null) return null;
        CrmMassEmail task = tasks.selectForUpdate(CrmRecordSupport.tenantId(), reference.getMassEmailId());
        if (task == null) return null;
        CrmMassEmailRecipient recipient = recipients.selectForUpdate(CrmRecordSupport.tenantId(), reference.getRecipientId());
        MessageSendRequest compared = Set.of("FAILED", "SKIPPED").contains(result.status())
                ? snapshot.request().toBuilder().forceSend(null).build() : snapshot.request();
        if (!matches(recipient, compared)) throw new ServiceException("营销投递内容与冻结快照不一致", 409);
        boolean current = Objects.equals(recipient.getMessageRecordId(), result.recordId());
        if (!current && recipient.getMessageRecordId() != null && !failedResend(recipient, compared, parent)) return null;
        if (!current && recipient.getMessageRecordId() == null
                && (compared.getResendFromId() != null || !"QUEUED".equals(recipient.getStatus()))) return null;
        if (!snapshots.newerResult(recipient, result)) return recipient.getCampaignId();
        String state = switch (result.status()) {
            case "SENT", "FAILED", "UNKNOWN", "CANCELLED" -> result.status();
            case "SKIPPED" -> "CANCELLED".equals(task.getStatus()) ? "CANCELLED" : "SKIPPED";
            case "PENDING", "CLAIMED", "SENDING", "RETRYABLE" -> "QUEUED";
            default -> throw new ServiceException("营销投递状态无效", 409);
        };
        if ("SENT".equals(recipient.getStatus()) && !"SENT".equals(state)) return recipient.getCampaignId();
        snapshots.projectResult(recipient, result);
        recipient.setMessageRecordId(result.recordId()); recipient.setDeliveryId(result.deliveryId()); recipient.setStatus(state);
        CrmRecordSupport.touch(recipient); CrmRecordSupport.saved(recipients.updateById(recipient));
        if ("SENT".equals(state)) {
            if (snapshot.acceptedTime() == null) throw new ServiceException("营销邮件缺少真实接纳时间", 409);
            statistics.event(recipient, "SENT", snapshot.acceptedTime(), null, null, null);
            statistics.event(recipient, "DELIVERED", snapshot.acceptedTime(), null, null, null);
        } else if ("FAILED".equals(state) && result.errorCode() != null && result.errorCode().matches("SMTP_REJECTED_[45][0-9]{2}")) {
            statistics.event(recipient, "BOUNCED", LocalDateTime.now(), null, null, null);
        }
        statistics.refreshTask(task);
        return recipient.getCampaignId();
    }

    private boolean matches(CrmMassEmailRecipient recipient, MessageSendRequest request) {
        if (recipient == null || request == null || Boolean.TRUE.equals(request.getForceSend())) return false;
        MessageSendRequest expected = snapshots.request(recipient);
        MessageSendRequest.MessageSendRequestBuilder builder = request.toBuilder().forceSend(null).retryAttempt(null);
        if (request.getResendFromId() != null) builder.resendFromId(null).deduplicationKey(expected.getDeduplicationKey());
        MessageSendRequest normalized = builder.build();
        return MessagePayloadCodec.digest(MessagePayloadCodec.internalTree(expected, json), json)
                .equals(MessagePayloadCodec.digest(MessagePayloadCodec.internalTree(normalized, json), json));
    }

    private MessageDeliverySnapshot parent(MessageSendRequest request) {
        if (request.getResendFromId() == null) return null;
        R<MessageDeliverySnapshot> response = messages.snapshot(request.getResendFromId());
        if (response == null || !response.isSuccess() || response.getData() == null) throw new IllegalStateException("无法核实营销邮件重发来源");
        return response.getData();
    }

    private boolean failedResend(CrmMassEmailRecipient recipient, MessageSendRequest request, MessageDeliverySnapshot parent) {
        if (request.getResendFromId() == null || parent == null || parent.result() == null || parent.request() == null
                || Set.of("SENT", "CANCELLED").contains(recipient.getStatus())
                || !Objects.equals(recipient.getMessageRecordId(), request.getResendFromId())) return false;
        MessageDeliveryResult result = parent.result();
        return "FAILED".equals(result.status()) && "EMAIL".equals(result.channelType())
                && Objects.equals(result.tenantId(), recipient.getTenantId()) && Objects.equals(result.recordId(), request.getResendFromId())
                && Objects.equals(result.businessType(), CrmEmailSnapshotService.BUSINESS_TYPE)
                && Objects.equals(result.businessId(), String.valueOf(recipient.getRecipientId())) && matches(recipient, parent.request());
    }

    private Long identifier(String value) {
        if (value == null || !value.matches("[1-9][0-9]{0,18}")) throw new CrmBusinessException("邮件来源标识无效");
        try { return Long.valueOf(value); }
        catch (NumberFormatException invalid) { throw new CrmBusinessException("邮件来源标识无效"); }
    }

    private MessageSourceResult denied(String reason) { return new MessageSourceResult(false, reason); }
}
