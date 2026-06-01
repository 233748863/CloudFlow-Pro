package com.cloudflow.common.statemachine.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 状态机校验配置。
 */
@Data
@ConfigurationProperties(prefix = "cloudflow.statemachine")
public class StateMachineProperties {

    private boolean strictDictBinding = true;
}
