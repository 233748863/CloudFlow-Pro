package com.cloudflow.common.message.api;

import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.time.LocalDateTime;

/**
 * 统一消息发送请求。业务服务只依赖该对象，不直接访问消息表。
 */
@Data
@Builder(toBuilder = true)
@NoArgsConstructor
@AllArgsConstructor
public class MessageSendRequest {
    private String templateCode;
    private List<MessageChannelType> channelTypes;
    private List<MessageReceiver> receivers;
    @lombok.ToString.Exclude
    @com.fasterxml.jackson.databind.annotation.JsonSerialize(using = com.cloudflow.common.message.security.MessageParamsSerializer.class)
    private Map<String, Object> params;
    private MessageCategory category;
    private String bizType;
    private String bizId;
    private String linkUrl;
    private String traceId;
    private String deduplicationKey;
    private Boolean forceSend;
    /** 重发时关联的原消息记录 ID；普通发送为空。 */
    private Long resendFromId;
    /** 指定投递时间；为空或不晚于当前时间时立即进入 outbox 扫描。 */
    private LocalDateTime scheduleTime;
    /** 渠道自动重试序号；仅由消息中心维护，业务方不应设置。 */
    private Integer retryAttempt;
    /** 运维重发时直接使用原记录的已渲染正文，避免再次依赖原模板参数。 */
    private Boolean renderedContent;
    /** 兼容旧通知调用；模板缺失时由消费侧使用这两个字段。 */
    private String title;
    private String content;

    public List<MessageChannelType> safeChannelTypes() {
        if (channelTypes == null || channelTypes.isEmpty()) {
            return List.of(MessageChannelType.INTERNAL);
        }
        List<MessageChannelType> normalized = channelTypes.stream()
                .filter(java.util.Objects::nonNull).distinct().toList();
        return normalized.isEmpty() ? List.of(MessageChannelType.INTERNAL) : normalized;
    }

    public List<MessageReceiver> safeReceivers() {
        return receivers == null ? List.of() : receivers.stream()
                .filter(java.util.Objects::nonNull).toList();
    }

    public Map<String, Object> safeParams() {
        return params == null ? Map.of() : java.util.Collections.unmodifiableMap(new LinkedHashMap<>(params));
    }

    public static MessageSendRequest legacy(Long userId, String title, String content,
                                            String type, Long senderId, String senderName) {
        String normalizedType = type == null ? "" : type.trim().toUpperCase(java.util.Locale.ROOT);
        MessageCategory category = switch (normalizedType) {
            case "2", "BIZ_REMINDER" -> MessageCategory.BIZ_REMINDER;
            case "3", "SYSTEM" -> MessageCategory.SYSTEM;
            case "CC" -> MessageCategory.CC;
            case "ANNOUNCEMENT" -> MessageCategory.ANNOUNCEMENT;
            default -> MessageCategory.TODO;
        };
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("title", title);
        params.put("content", content);
        params.put("senderId", senderId);
        params.put("senderName", senderName);
        return MessageSendRequest.builder()
                .templateCode("LEGACY_NOTICE_" + (type == null ? "1" : type))
                .channelTypes(new ArrayList<>(List.of(MessageChannelType.INTERNAL)))
                .receivers(userId == null
                        ? new ArrayList<>()
                        : new ArrayList<>(List.of(MessageReceiver.ofUser(userId))))
                .params(params)
                .category(category)
                .bizType("LEGACY_NOTICE")
                .bizId(userId == null ? null : String.valueOf(userId))
                .title(title)
                .content(content)
                .build();
    }
}
