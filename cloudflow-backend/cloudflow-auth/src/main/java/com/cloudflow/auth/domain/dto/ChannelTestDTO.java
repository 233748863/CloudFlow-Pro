package com.cloudflow.auth.domain.dto;

import lombok.Data;

/**
 * 渠道测试请求。
 */
@Data
public class ChannelTestDTO {
    private String target;
    private String content;
}
