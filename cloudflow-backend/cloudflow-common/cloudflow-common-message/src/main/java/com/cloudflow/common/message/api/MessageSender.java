package com.cloudflow.common.message.api;

/**
 * 统一消息发送入口。
 */
public interface MessageSender {

    /**
     * 在当前业务事务中写入消息 outbox 事件。
     */
    void send(MessageSendRequest request);

    /**
     * 旧通知的一行替换入口，内部仍走统一 outbox 链路。
     */
    default void send(Long userId, String title, String content, String type,
                      Long senderId, String senderName) {
        if (userId == null) {
            return;
        }
        send(MessageSendRequest.legacy(userId, title, content, type, senderId, senderName));
    }
}
