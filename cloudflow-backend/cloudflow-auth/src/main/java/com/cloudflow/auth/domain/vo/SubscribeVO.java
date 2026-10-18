package com.cloudflow.auth.domain.vo;

import lombok.Data;

import java.time.LocalTime;

/**
 * 订阅展示对象。
 */
@Data
public class SubscribeVO {
    private String messageCategory;
    private String channelType;
    private Integer enabledFlag;
    private LocalTime quietStart;
    private LocalTime quietEnd;
}
