package com.cloudflow.common.message.channel;

import lombok.Builder;
import lombok.Data;

/**
 * 渠道连通性测试上下文。
 */
@Data
@Builder
public class ChannelTestContext {
    private Long channelId;
    private Long tenantId;
    private String target;
    private String content;
}
