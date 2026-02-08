package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.config.NotificationWebSocketHandler;
import com.cloudflow.workflow.service.ISysNoticeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;

/**
 * 系统通知服务实现
 * 通过 WebSocket 实时推送通知，同时记录日志
 * 
 * @author CloudFlow
 */
@Service
public class SysNoticeServiceImpl implements ISysNoticeService {

    private static final Logger log = LoggerFactory.getLogger(SysNoticeServiceImpl.class);

    @Autowired
    private NotificationWebSocketHandler webSocketHandler;

    @Override
    @Async
    public void sendNotice(Long userId, String title, String content,
                          String type, Long senderId, String senderName) {
        if (userId == null) {
            log.warn("[sendNotice] 接收用户ID为空，跳过通知发送");
            return;
        }

        log.info("[sendNotice] 发送通知: userId={}, title={}, type={}, senderId={}",
                userId, title, type, senderId);

        try {
            // 构建通知消息体
            Map<String, Object> message = new HashMap<>();
            message.put("type", "NOTIFICATION");
            message.put("noticeType", type);
            message.put("title", title);
            message.put("content", content);
            message.put("senderId", senderId);
            message.put("senderName", senderName);
            message.put("timestamp", new Date());

            // 通过 WebSocket 实时推送
            webSocketHandler.sendMessage(userId, message);

            log.debug("[sendNotice] 通知推送成功: userId={}, title={}", userId, title);
        } catch (Exception e) {
            // 通知发送失败不应影响主流程，仅记录警告日志
            log.warn("[sendNotice] 通知推送失败: userId={}, title={}, error={}",
                    userId, title, e.getMessage());
        }
    }
}
