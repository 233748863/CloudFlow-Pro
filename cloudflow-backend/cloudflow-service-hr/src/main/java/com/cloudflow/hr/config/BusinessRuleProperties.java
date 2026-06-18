package com.cloudflow.hr.config;

import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.redis.config.SysConfigKeys;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 业务规则服务降级配置。
 */
@Component
public class BusinessRuleProperties {

    @Autowired(required = false)
    private RuntimeSysConfigService runtimeSysConfigService;

    public RuleFallbackPolicy resolvePolicy(String ruleCode) {
        if (runtimeSysConfigService != null) {
            String configured = runtimeSysConfigService.getString(
                    SysConfigKeys.HR_BUSINESS_RULE_FALLBACK_PREFIX + ruleCode,
                    null);
            if (configured == null || configured.isBlank()) {
                configured = runtimeSysConfigService.getString(
                        SysConfigKeys.HR_BUSINESS_RULE_FALLBACK_PREFIX + "default",
                        null);
            }
            if (configured != null && !configured.isBlank()) {
                try {
                    return RuleFallbackPolicy.valueOf(configured.trim().toUpperCase());
                } catch (IllegalArgumentException ignored) {
                }
            }
        }
        return RuleFallbackPolicy.WARN;
    }
}
