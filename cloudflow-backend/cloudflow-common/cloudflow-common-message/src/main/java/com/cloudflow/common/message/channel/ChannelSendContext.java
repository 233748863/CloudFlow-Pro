package com.cloudflow.common.message.channel;

import com.cloudflow.common.message.api.MessageReceiver;
import lombok.Builder;
import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * 渠道发送上下文。
 */
@Data
@Builder(toBuilder = true)
@NoArgsConstructor
@AllArgsConstructor
public class ChannelSendContext {
    private Long deliveryId;
    /** 已落库的消息记录 ID，供实时推送适配器关联前端消息。 */
    private Long recordId;
    /** 实际选中的渠道配置 ID，便于同类型多渠道降级实现选择凭据。 */
    private Long channelId;
    private Long tenantId;
    private String messageCategory;
    private String title;
    private String content;
    private MessageReceiver receiver;
    @lombok.ToString.Exclude
    @com.fasterxml.jackson.databind.annotation.JsonSerialize(using = com.cloudflow.common.message.security.MessageParamsSerializer.class)
    private Map<String, Object> params;
    private String linkUrl;
    @com.fasterxml.jackson.annotation.JsonIgnore
    private java.util.List<com.cloudflow.common.message.api.MessageAttachment> attachments;
}
