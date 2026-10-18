package com.cloudflow.oa.service.impl;

import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class OaReminderService {
    private final MessageSender sender;

    public void send(Long recipientId, String businessType, String businessId, String checkpoint, String title, String content) {
        if (recipientId == null) throw new IllegalArgumentException("提醒接收人未配置");
        MessageSendRequest request = MessageSendRequest.legacy(recipientId, title, content, "2", null, "system");
        request.setBizType(businessType); request.setBizId(businessId);
        request.setDeduplicationKey(OaRecordSupport.tenantId() + ":" + businessType + ":" + businessId + ":" + checkpoint + ":" + recipientId);
        sender.send(request);
    }
}
