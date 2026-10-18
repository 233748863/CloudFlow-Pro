package com.cloudflow.auth.domain.dto;

import lombok.Data;

/**
 * CRON 校验请求。
 */
@Data
public class CronValidateDTO {
    private String cronExpression;
    private String triggerType;
    private Long intervalMs;
}
