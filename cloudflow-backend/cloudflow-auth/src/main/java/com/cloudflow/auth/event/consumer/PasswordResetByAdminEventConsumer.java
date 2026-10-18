package com.cloudflow.auth.event.consumer;

import com.cloudflow.common.core.event.PasswordResetByAdminEvent;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class PasswordResetByAdminEventConsumer implements BusinessEventConsumer {

    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;
    private final MessageSender messageSender;

    @Override
    public String eventType() {
        return "PASSWORD_RESET_BY_ADMIN";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        PasswordResetByAdminEvent event = objectMapper.readValue(envelope.getPayload(), PasswordResetByAdminEvent.class);
        if (event.getUserId() == null) {
            log.warn("skip password reset notice, missing userId, eventId={}", envelope.getEventId());
            return;
        }

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("senderId", event.getOperatorId());
        params.put("senderName", event.getOperatorName());
        messageSender.send(MessageSendRequest.builder()
                .channelTypes(List.of(MessageChannelType.INTERNAL))
                .receivers(List.of(MessageReceiver.ofUser(event.getUserId())))
                .params(params)
                .category(MessageCategory.SYSTEM)
                .bizType("PASSWORD_RESET_BY_ADMIN")
                .bizId(String.valueOf(event.getUserId()))
                .forceSend(true)
                .title("密码已被管理员重置")
                .content(buildContent(event))
                .build());
    }

    private String buildContent(PasswordResetByAdminEvent event) {
        String operatorName = event.getOperatorName() == null ? "system" : event.getOperatorName();
        String operatorIp = event.getOperatorIp() == null ? "unknown" : event.getOperatorIp();
        return "您的账号密码已被管理员重置。操作人：" + operatorName
                + "，操作IP：" + operatorIp
                + "。系统已强制您下次登录修改密码，如非本人知悉请立即联系管理员。";
    }
}
