package com.cloudflow.hr.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * 业务规则服务降级配置。
 */
@Data
@Component
@ConfigurationProperties(prefix = "cloudflow.business-rule")
public class BusinessRuleProperties {

    private Map<String, RuleFallbackPolicy> fallbackPolicy = new HashMap<>();

    public RuleFallbackPolicy resolvePolicy(String ruleCode) {
        RuleFallbackPolicy policy = fallbackPolicy.get(ruleCode);
        if (policy != null) {
            return policy;
        }
        RuleFallbackPolicy defaultPolicy = fallbackPolicy.get("default");
        return defaultPolicy != null ? defaultPolicy : RuleFallbackPolicy.WARN;
    }
}
