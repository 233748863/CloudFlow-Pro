package com.cloudflow.crm.service.email.archive;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.message.api.MessageAttachment;
import com.cloudflow.common.message.api.MessageDeliveryResult;
import com.cloudflow.common.message.api.MessageDeliverySnapshot;
import com.cloudflow.common.message.api.MessageEmailTemplate;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSourceCheck;
import com.cloudflow.common.message.api.MessageSourceResult;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.crm.domain.CrmContact;
import com.cloudflow.crm.domain.CrmEmailRecord;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmEmailRecordMapper;
import com.cloudflow.crm.service.email.CrmEmailSecurity;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.cloudflow.crm.service.remote.CrmMessageDeliveryClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@RequiredArgsConstructor
public class CrmEmailArchiveSource {
    private final CrmEmailRecordMapper records;
    private final CrmEmailArchiveAccess access;
    private final CrmEmailArchiveContent content;
    private final CrmEmailArchiveFiles files;
    private final CrmEmailArchiveTracking tracking;
    private final CrmMessageDeliveryClient messages;
    private final TransactionTemplate transactions;
    private final ObjectMapper json;

    public MessageSourceResult verify(MessageSourceCheck check) {
        try { transactions.execute(status -> validate(check)); return new MessageSourceResult(true, null); }
        catch (CrmBusinessException | ArithmeticException invalid) { return new MessageSourceResult(false, "SOURCE_INVALID"); }
    }

    public List<MessageAttachment> attachments(MessageSourceCheck check) {
        CrmEmailRecord record = transactions.execute(status -> validate(check));
        return files.attachments(record.getBizType(), record.getBizId(), record.getSenderUserId(), record.getAttachmentFileIds());
    }

    private CrmEmailRecord validate(MessageSourceCheck check) {
        if (check == null || check.request() == null || check.recordId() == null || check.recordId() <= 0 || check.eventId() == null) throw invalid();
        MessageSendRequest request = check.request();
        CrmEmailRecord record = records.lockById(CrmRecordSupport.tenantId(), identifier(request.getBizId()));
        if (record == null || !"OUTBOUND".equals(record.getDirection()) || !Set.of("QUEUED", "SENDING", "UNKNOWN").contains(record.getSendStatus())
                || record.getMessageRecordId() != null && !Objects.equals(record.getMessageRecordId(), check.recordId()) || !matches(record, request)) throw invalid();
        CrmEmailArchiveAccess.Actor actor = access.resolve(record.getSenderUserId(), "crm:email:send");
        access.record(actor, record.getEmailId());
        CrmEmailArchiveAccess.Business business = access.business(actor, record.getBizType(), record.getBizId());
        CrmContact contact = access.contact(business, record.getContactId(), true);
        if (!Objects.equals(business.customer().getCustomerId(), record.getCustomerId())
                || !record.getToAddresses().equals(List.of(CrmEmailSecurity.address(contact.getEmail())))) throw invalid();
        R<MessageEmailTemplate> response = messages.template(request.getTemplateCode());
        if (response == null || !response.isSuccess() || response.getData() == null) throw new IllegalStateException("客户邮件配置暂不可用");
        content.template(response.getData());
        if (!response.getData().ready() || !Objects.equals(record.getFromAddress(), response.getData().fromAddress())) throw invalid();
        CrmEmailArchiveTracking.Pixel pixel = pixel(request);
        if (pixel != null) tracking.bind(record, pixel);
        if (record.getMessageRecordId() == null) {
            record.setMessageRecordId(check.recordId()); CrmRecordSupport.touch(record); CrmRecordSupport.saved(records.updateById(record));
        }
        return record;
    }

    public void deliveryEvent(BusinessEventEnvelope envelope) throws Exception {
        if (!"cloudflow-auth".equals(envelope.getSourceModule()) || !Objects.equals(envelope.getTenantId(), UserContext.getTenantId())) throw new ServiceException("邮件投递事件来源无效", 403);
        MessageDeliveryResult result = json.readValue(envelope.getPayload(), MessageDeliveryResult.class);
        if (result != null && CrmEmailArchiveService.BUSINESS_TYPE.equals(result.businessType())) delivery(result);
    }

    public void delivery(MessageDeliveryResult announced) {
        if (announced == null || !Objects.equals(announced.tenantId(), CrmRecordSupport.tenantId())
                || !CrmEmailArchiveService.BUSINESS_TYPE.equals(announced.businessType()) || announced.recordId() == null) throw new ServiceException("邮件投递结果关联无效", 403);
        Long emailId = identifier(announced.businessId());
        transactions.execute(status -> {
            CrmEmailRecord record = records.lockById(CrmRecordSupport.tenantId(), emailId);
            if (record == null || !"OUTBOUND".equals(record.getDirection()) || "DRAFT".equals(record.getSendStatus())) throw invalid();
            if (record.getMessageRecordId() != null && !Objects.equals(record.getMessageRecordId(), announced.recordId())) throw invalid();
            R<MessageDeliverySnapshot> response = messages.snapshot(announced.recordId());
            if (response == null || !response.isSuccess() || response.getData() == null) throw new IllegalStateException("无法核实客户邮件真实投递结果");
            apply(record, announced, response.getData());
            return null;
        });
    }

    private void apply(CrmEmailRecord record, MessageDeliveryResult announced, MessageDeliverySnapshot snapshot) {
        MessageDeliveryResult actual = snapshot.result();
        if (actual == null || snapshot.request() == null || !Objects.equals(actual.tenantId(), record.getTenantId())
                || !Objects.equals(actual.recordId(), announced.recordId()) || !Objects.equals(actual.deliveryId(), announced.deliveryId())
                || !Objects.equals(actual.outboxEventId(), announced.outboxEventId()) || !Objects.equals(actual.businessId(), announced.businessId())
                || !CrmEmailArchiveService.BUSINESS_TYPE.equals(actual.businessType()) || !"EMAIL".equals(actual.channelType())) throw invalid();
        MessageSendRequest request = Set.of("FAILED", "SKIPPED").contains(actual.status()) ? snapshot.request().toBuilder().forceSend(null).build() : snapshot.request();
        if (!matches(record, request)) throw new ServiceException("邮件投递快照与归档内容不一致", 409);
        String state = switch (actual.status()) {
            case "PENDING", "CLAIMED", "RETRYABLE" -> "QUEUED";
            case "SENDING", "SENT", "UNKNOWN" -> actual.status();
            case "FAILED", "SKIPPED", "CANCELLED" -> "FAILED";
            default -> throw new ServiceException("邮件投递状态无效", 409);
        };
        if ("SENT".equals(record.getSendStatus()) && !"SENT".equals(state)) return;
        if ("SENT".equals(state) && snapshot.acceptedTime() == null) throw new ServiceException("邮件缺少消息中心真实接纳时间", 409);
        record.setMessageRecordId(actual.recordId()); record.setSendStatus(state);
        if ("SENT".equals(state)) record.setSendTime(snapshot.acceptedTime());
        CrmRecordSupport.touch(record); CrmRecordSupport.saved(records.updateById(record));
    }

    private boolean matches(CrmEmailRecord record, MessageSendRequest request) {
        if (request == null || record == null || request.getResendFromId() != null || Boolean.TRUE.equals(request.getForceSend())
                || request.getTemplateCode() == null || !request.getTemplateCode().matches("[A-Za-z0-9_-]{1,100}")) return false;
        try {
            MessageSendRequest expected = CrmEmailArchiveService.message(record, request.getTemplateCode(), pixel(request));
            MessageSendRequest normalized = request.toBuilder().forceSend(null).retryAttempt(null).build();
            return MessagePayloadCodec.digest(MessagePayloadCodec.internalTree(expected, json), json)
                    .equals(MessagePayloadCodec.digest(MessagePayloadCodec.internalTree(normalized, json), json));
        } catch (CrmBusinessException invalid) { return false; }
    }

    private CrmEmailArchiveTracking.Pixel pixel(MessageSendRequest request) {
        Object token = request.safeParams().get("archiveOpenToken");
        Object origin = request.safeParams().get("archiveOpenOrigin");
        if (token == null && origin == null) return null;
        if (!(token instanceof String tokenValue) || !(origin instanceof String originValue)) throw invalid();
        CrmEmailSecurity.tokenHash(tokenValue);
        if (!originValue.equals(CrmEmailSecurity.publicOrigin(originValue))) throw invalid();
        return new CrmEmailArchiveTracking.Pixel(tokenValue, originValue);
    }

    private static Long identifier(String value) {
        if (value == null || !value.matches("[1-9][0-9]{0,18}")) throw invalid();
        try { return Long.valueOf(value); }
        catch (NumberFormatException invalid) { throw invalid(); }
    }

    private static CrmBusinessException invalid() { return new CrmBusinessException("邮件来源与当前业务归档不一致"); }
}
