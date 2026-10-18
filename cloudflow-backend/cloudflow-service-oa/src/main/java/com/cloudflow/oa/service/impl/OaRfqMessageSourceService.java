package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.message.api.MessageAttachment;
import com.cloudflow.common.message.api.MessageDeliveryResult;
import com.cloudflow.common.message.api.MessageDeliverySnapshot;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSourceCheck;
import com.cloudflow.common.message.api.MessageSourceResult;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.oa.domain.OaPurchaseRfq;
import com.cloudflow.oa.domain.OaPurchaseRfqSupplier;
import com.cloudflow.oa.domain.OaTraceEvent;
import com.cloudflow.oa.domain.SysSupplier;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.OaPurchaseRfqMapper;
import com.cloudflow.oa.mapper.OaPurchaseRfqSupplierMapper;
import com.cloudflow.oa.mapper.SysSupplierMapper;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.cloudflow.oa.service.remote.RemoteMessageDeliveryService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@RequiredArgsConstructor
public class OaRfqMessageSourceService {
    private final OaPurchaseRfqMapper rfqs;
    private final OaPurchaseRfqSupplierMapper invitations;
    private final SysSupplierMapper suppliers;
    private final OaIdentityReferenceMapper identities;
    private final OaSupplierGovernanceService governance;
    private final OaRfqInvitationService invitationService;
    private final OaRfqEmailContent content;
    private final OaPrivateFileStorageService files;
    private final RemoteMessageDeliveryService messages;
    private final IOaTraceEventService trace;
    private final PlatformTransactionManager transactionManager;
    private final ObjectMapper json;

    public MessageSourceResult verify(MessageSourceCheck check) {
        try { validate(check); return new MessageSourceResult(true, null); }
        catch (IllegalArgumentException | ArithmeticException | ServiceException failure) { return new MessageSourceResult(false, "SOURCE_INVALID"); }
    }

    private void validate(MessageSourceCheck check) {
        if (check == null || check.request() == null || check.recordId() == null || check.eventId() == null) throw new IllegalArgumentException("来源无效");
        MessageSendRequest request = check.request();
        OaPurchaseRfqSupplier invitation = OaRecordSupport.active(invitations.selectById(identifier(request.getBizId())));
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectById(invitation.getRfqId()));
        Long operatorId = identifier(request.safeParams().get("operatorId"));
        Integer revision = Math.toIntExact(identifier(request.safeParams().get("inviteRevision"), true));
        if (identities.user(rfq.getOwnerId(), OaRecordSupport.tenantId()) == null
                || !identities.mayInviteRfq(operatorId, rfq.getOwnerId(), OaRecordSupport.tenantId())) throw new IllegalArgumentException("业务发起人权限已失效");
        boolean award = "RFQ_EMAIL_AWARD".equals(request.getBizType());
        boolean reminder = "RFQ_EMAIL_REMINDER".equals(request.getBizType());
        if (award) {
            if (!"AWARDED".equals(rfq.getStatus()) || !OaRfqInvitationService.reached(invitation)) throw new IllegalArgumentException("尚未定标或供应商未被邀请");
        } else {
            if (!Set.of("DRAFT", "SENT", "QUOTING").contains(rfq.getStatus()) || rfq.getQuoteDeadline().isBefore(LocalDate.now())
                    || !"EMAIL".equals(invitation.getInviteChannel()) || !"INVITED".equals(invitation.getQuoteStatus())) throw new IllegalArgumentException("询价或邀请已失效");
            if (reminder) {
                if (!OaRfqInvitationService.reached(invitation)) throw new IllegalArgumentException("不能提醒尚未发出邀请的供应商");
            } else if (!"RFQ_EMAIL_INVITE".equals(request.getBizType()) || !matchesCurrentInvite(invitation, request, revision)) {
                throw new IllegalArgumentException("邀请来源版本已变化");
            }
        }
        governance.assertSupplierAllowed(invitation.getSupplierId(), "RFQ");
        SysSupplier supplier = OaRecordSupport.active(suppliers.selectById(invitation.getSupplierId()));
        if (!Objects.equals(OaRfqEmailContent.address(supplier.getContactEmail()), OaRfqEmailContent.address(invitation.getContactEmail()))) throw new IllegalArgumentException("供应商联系邮箱已变化");
        MessageSendRequest expected = content.request(rfq, invitation, invitationService.items(rfq.getRfqId()), request.getBizType(), operatorId, revision);
        if (!Objects.equals(request.getTemplateCode(), expected.getTemplateCode()) || !Objects.equals(request.getTitle(), expected.getTitle())
                || !Objects.equals(request.getContent(), expected.getContent()) || !Objects.equals(request.getCategory(), expected.getCategory())
                || !Boolean.TRUE.equals(request.getRenderedContent()) || !List.of(MessageChannelType.EMAIL).equals(request.safeChannelTypes())
                || request.safeReceivers().size() != 1 || request.safeReceivers().get(0).getReceiverId() != null
                || !"EMAIL".equals(request.safeReceivers().get(0).getReceiverType())
                || !Objects.equals(request.safeReceivers().get(0).getReceiverAddress(), expected.safeReceivers().get(0).getReceiverAddress())
                || !com.cloudflow.common.message.security.MessagePayloadCodec.digest(json.valueToTree(request.safeParams()), json)
                        .equals(com.cloudflow.common.message.security.MessagePayloadCodec.digest(json.valueToTree(expected.safeParams()), json))) throw new IllegalArgumentException("消息内容与本询价不一致");
    }

    private boolean matchesCurrentInvite(OaPurchaseRfqSupplier invitation, MessageSendRequest request, Integer revision) {
        if (request.getResendFromId() != null) return "FAILED".equals(invitation.getInviteDeliveryStatus())
                && Objects.equals(request.getResendFromId(), invitation.getInviteMessageRecordId());
        return "QUEUED".equals(invitation.getInviteDeliveryStatus()) && Objects.equals(revision, invitation.getVersion());
    }

    public List<MessageAttachment> attachments(MessageSourceCheck check) {
        validate(check);
        Object references = check.request().safeParams().get("attachmentIds");
        if (references == null) return List.of();
        if (!(references instanceof List<?> values) || values.size() != 1) throw new IllegalArgumentException("询价附件来源无效");
        Long fileId = identifier(((List<?>) references).get(0));
        ResponseEntity<byte[]> response = files.download(OaPrivateFileStorageService.Kind.RFQ_INVITATION, "oa-file:RFQ_INVITATION:" + fileId);
        String filename = response.getHeaders().getContentDisposition().getFilename();
        if (filename == null || response.getBody() == null) throw new IllegalArgumentException("询价附件不可用");
        String suffix = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        String type = switch (suffix) { case "pdf" -> "application/pdf"; case "png" -> "image/png"; case "jpg", "jpeg" -> "image/jpeg"; default -> throw new IllegalArgumentException("询价附件类型无效"); };
        return List.of(new MessageAttachment(fileId, filename, type, response.getBody()));
    }

    public void deliveryEvent(BusinessEventEnvelope envelope) throws Exception {
        if (!"cloudflow-auth".equals(envelope.getSourceModule()) || !Objects.equals(envelope.getTenantId(), OaRecordSupport.tenantId())) throw new ServiceException("投递结果来源无效", 403);
        MessageDeliveryResult announced = json.readValue(envelope.getPayload(), MessageDeliveryResult.class);
        if (!Set.of("RFQ_EMAIL_INVITE", "RFQ_EMAIL_REMINDER", "RFQ_EMAIL_AWARD").contains(announced.businessType() == null ? "" : announced.businessType())) return;
        if (!Objects.equals(announced.tenantId(), envelope.getTenantId()) || announced.recordId() == null) throw new ServiceException("投递结果租户不一致", 403);
        R<MessageDeliverySnapshot> response = messages.snapshot(announced.recordId());
        if (response == null || !response.isSuccess() || response.getData() == null) throw new IllegalStateException("无法核实当前投递结果");
        MessageDeliverySnapshot snapshot = response.getData();
        MessageDeliveryResult actual = snapshot.result();
        if (actual == null || snapshot.request() == null || !Objects.equals(actual.tenantId(), envelope.getTenantId())
                || !Objects.equals(actual.recordId(), announced.recordId()) || !Objects.equals(actual.deliveryId(), announced.deliveryId())
                || !Objects.equals(actual.outboxEventId(), announced.outboxEventId()) || !Objects.equals(actual.businessId(), announced.businessId())
                || !Objects.equals(actual.businessType(), announced.businessType())) throw new ServiceException("投递结果关联不一致", 409);
        if (!Set.of("SENT", "FAILED", "UNKNOWN", "SKIPPED", "CANCELLED").contains(actual.status())) return;
        new TransactionTemplate(transactionManager).execute(status -> { applyResult(snapshot); return null; });
    }

    private void applyResult(MessageDeliverySnapshot snapshot) {
        MessageDeliveryResult result = snapshot.result();
        OaPurchaseRfqSupplier reference = invitations.selectById(identifier(result.businessId()));
        if (reference == null || !Objects.equals(reference.getTenantId(), OaRecordSupport.tenantId())) return;
        OaPurchaseRfq rfq = rfqs.selectForUpdate(reference.getRfqId(), OaRecordSupport.tenantId());
        if (rfq == null) return;
        OaPurchaseRfqSupplier invitation = invitations.selectForUpdate(reference.getRfqSupplierId(), OaRecordSupport.tenantId());
        String fingerprint = result.deliveryId() + ":" + result.version() + ":" + result.status();
        if (trace.count(new LambdaQueryWrapper<OaTraceEvent>().eq(OaTraceEvent::getTenantId, OaRecordSupport.tenantId())
                .eq(OaTraceEvent::getBusinessType, "RFQ").eq(OaTraceEvent::getBusinessId, rfq.getRfqId())
                .eq(OaTraceEvent::getEventType, "RFQ_EMAIL_RESULT").eq(OaTraceEvent::getEventContent, fingerprint)) > 0) return;
        if ("RFQ_EMAIL_INVITE".equals(result.businessType())) {
            Integer revision = Math.toIntExact(identifier(snapshot.request().safeParams().get("inviteRevision"), true));
            boolean currentRecord = Objects.equals(invitation.getInviteMessageRecordId(), result.recordId());
            if (!"EMAIL".equals(invitation.getInviteChannel()) || !currentRecord && !matchesCurrentInvite(invitation, snapshot.request(), revision)) return;
            String outcome = switch (result.status()) { case "SENT" -> "SENT"; case "UNKNOWN" -> "UNKNOWN"; default -> "FAILED"; };
            if ("SENT".equals(outcome) && snapshot.acceptedTime() == null) throw new IllegalStateException("投递接纳时间缺失");
            invitation.setInviteDeliveryStatus(outcome);
            invitation.setInviteMessageRecordId(result.recordId());
            invitation.setInviteSentTime(snapshot.acceptedTime());
            OaRecordSupport.touch(invitation);
            OaRecordSupport.saved(invitations.updateById(invitation));
            invitationService.refreshReached(rfq);
        }
        trace.record(OaRecordSupport.tenantId(), "RFQ", rfq.getRfqId(), "MESSAGE_DELIVERY", result.deliveryId(), "RFQ_EMAIL_RESULT",
                "询价邮件真实结果：" + result.status(), fingerprint, null, "system", null);
    }

    private Long identifier(Object value) { return identifier(value, false); }

    private Long identifier(Object value, boolean zeroAllowed) {
        if (value == null || !String.valueOf(value).matches(zeroAllowed ? "[0-9]{1,19}" : "[1-9][0-9]{0,18}")) throw new IllegalArgumentException("业务来源标识无效");
        try { return Long.valueOf(String.valueOf(value)); }
        catch (NumberFormatException failure) { throw new IllegalArgumentException("业务来源标识无效"); }
    }
}
