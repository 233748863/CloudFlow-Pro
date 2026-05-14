package com.cloudflow.hr.client.fallback;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.BusinessRuleClient;
import com.cloudflow.hr.client.dto.BusinessRuleDTO;
import com.cloudflow.hr.client.dto.BusinessRuleHitRecordDTO;
import com.cloudflow.hr.config.BusinessRuleProperties;
import com.cloudflow.hr.config.RuleFallbackPolicy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 业务规则客户端降级。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BusinessRuleClientFallback implements BusinessRuleClient {

    private final BusinessRuleProperties businessRuleProperties;

    @Override
    public R<BusinessRuleDTO> getEffectiveRule(String ruleCode) {
        RuleFallbackPolicy policy = businessRuleProperties.resolvePolicy(ruleCode);
        log.warn("业务规则服务不可用，ruleCode={}，policy={}", ruleCode, policy);
        if (policy == RuleFallbackPolicy.DENY) {
            return R.fail("业务规则服务暂时不可用，当前规则已阻断，请稍后重试");
        }
        if (policy == RuleFallbackPolicy.WARN) {
            log.warn("业务规则服务降级放行，ruleCode={}，已按 WARN 策略记录告警", ruleCode);
        }
        return R.ok(null);
    }

    @Override
    public R<Void> recordHit(BusinessRuleHitRecordDTO record) {
        log.warn("业务规则命中记录服务不可用，ruleCode={}", record == null ? null : record.getRuleCode());
        return R.ok();
    }
}
