package com.cloudflow.auth.domain.dto;

import lombok.Data;

import java.util.Map;

/**
 * 消息模板预览请求。
 */
@Data
public class MessageTemplatePreviewDTO {
    private String templateCode;
    private String channelType;
    private Map<String, Object> params;
}
