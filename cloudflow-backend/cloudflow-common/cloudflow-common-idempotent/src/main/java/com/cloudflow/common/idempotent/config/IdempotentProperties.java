package com.cloudflow.common.idempotent.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 幂等全局配置。
 */
@Data
@ConfigurationProperties(prefix = "cloudflow.idempotent")
public class IdempotentProperties {

    private boolean enabled = true;

    private long minIntervalMillis = 1000L;

    private String keyPrefix = "cloudflow:repeat_submit:";
}
