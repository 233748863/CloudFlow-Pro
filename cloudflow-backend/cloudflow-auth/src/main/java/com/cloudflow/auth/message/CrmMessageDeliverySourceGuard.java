package com.cloudflow.auth.message;

import com.cloudflow.auth.service.remote.RemoteCrmMessageSourceService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.message.api.MessageSourceCheck;
import com.cloudflow.common.message.api.MessageAttachment;
import com.cloudflow.common.message.api.MessageSourceResult;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class CrmMessageDeliverySourceGuard implements MessageDeliverySourceGuard {
    private final RemoteCrmMessageSourceService source;
    private final ObjectMapper json;

    @Override
    public boolean supports(String sourceModule, String businessType) {
        return "cloudflow-service-crm".equals(sourceModule) && ("CRM_MASS_EMAIL".equals(businessType) || "CRM_OPPORTUNITY_STAGE_NOTICE".equals(businessType) || "CRM_EMAIL_ARCHIVE".equals(businessType) || "CRM_ACTIVITY".equals(businessType));
    }

    @Override
    public boolean verifyAtSendBoundary() { return true; }

    @Override
    public String rejectionCode(MessageDeliveryPayload payload) {
        MessageSourceCheck check = new MessageSourceCheck(payload.eventId(), payload.context().getRecordId(), payload.request());
        R<MessageSourceResult> response = source.verify(MessagePayloadCodec.internalTree(check, json));
        if (response == null || !response.isSuccess() || response.getData() == null) return "SOURCE_UNAVAILABLE";
        return response.getData().allowed() ? null : response.getData().reason() == null ? "SOURCE_INVALID" : response.getData().reason();
    }

    @Override
    public java.util.List<MessageAttachment> attachments(MessageDeliveryPayload payload) {
        if (!"CRM_EMAIL_ARCHIVE".equals(payload.request().getBizType()) || !payload.request().safeParams().containsKey("attachmentIds")) return java.util.List.of();
        R<List<MessageAttachment>> response = source.attachments(MessagePayloadCodec.internalTree(new MessageSourceCheck(payload.eventId(), payload.context().getRecordId(), payload.request()), json));
        if (response == null || !response.isSuccess() || response.getData() == null) throw new IllegalStateException("客户邮件附件来源暂不可用");
        return response.getData();
    }
}
