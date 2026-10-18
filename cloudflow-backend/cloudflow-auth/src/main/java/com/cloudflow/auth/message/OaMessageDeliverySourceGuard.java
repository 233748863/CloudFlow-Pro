package com.cloudflow.auth.message;

import com.cloudflow.auth.service.remote.RemoteOaMessageSourceService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.message.api.MessageAttachment;
import com.cloudflow.common.message.api.MessageSourceCheck;
import com.cloudflow.common.message.api.MessageSourceResult;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class OaMessageDeliverySourceGuard implements MessageDeliverySourceGuard {
    private final RemoteOaMessageSourceService source;
    private final ObjectMapper json;

    @Override
    public boolean supports(String sourceModule, String businessType) {
        return "cloudflow-service-oa".equals(sourceModule) && List.of("RFQ_EMAIL_INVITE", "RFQ_EMAIL_REMINDER", "RFQ_EMAIL_AWARD", "OA_MEETING_NOTICE").contains(businessType == null ? "" : businessType);
    }

    @Override
    public String rejectionCode(MessageDeliveryPayload payload) {
        R<MessageSourceResult> result = source.verify(check(payload));
        if (result == null || !result.isSuccess() || result.getData() == null) return "SOURCE_UNAVAILABLE";
        return result.getData().allowed() ? null : result.getData().reason() == null ? "SOURCE_INVALID" : result.getData().reason();
    }

    @Override
    public List<MessageAttachment> attachments(MessageDeliveryPayload payload) {
        if (!payload.request().safeParams().containsKey("attachmentIds")) return List.of();
        R<List<MessageAttachment>> result = source.attachments(check(payload));
        if (result == null || !result.isSuccess() || result.getData() == null) throw new IllegalStateException("消息附件来源暂时不可用");
        return result.getData();
    }

    private JsonNode check(MessageDeliveryPayload payload) {
        return MessagePayloadCodec.internalTree(new MessageSourceCheck(payload.eventId(), payload.context().getRecordId(), payload.request()), json);
    }
}
