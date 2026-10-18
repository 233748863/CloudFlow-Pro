package com.cloudflow.auth.domain.dto;

import lombok.Data;

import java.time.LocalTime;

/**
 * 消息订阅设置。
 */
@Data
public class SubscribeDTO {
    private String messageCategory;
    private String channelType;
    private Integer enabledFlag;
    private LocalTime quietStart;
    private LocalTime quietEnd;
}
