package com.cloudflow.common.message.channel;

import lombok.Builder;
import lombok.Data;

/**
 * 渠道测试结果。
 */
@Data
@Builder
public class ChannelTestResult {
    private boolean success;
    private String message;

    public static ChannelTestResult notImplemented() {
        return builder().success(false).message("渠道未实现").build();
    }
}
