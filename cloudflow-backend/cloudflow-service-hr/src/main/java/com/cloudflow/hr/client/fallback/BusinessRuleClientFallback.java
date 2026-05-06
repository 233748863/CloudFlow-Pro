package com.cloudflow.hr.client.fallback;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.BusinessRuleClient;
import com.cloudflow.hr.client.dto.BusinessRuleDTO;
import com.cloudflow.hr.client.dto.BusinessRuleHitRecordDTO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 业务规则客户端降级。
 */
@Slf4j
@Component
public class BusinessRuleClientFallback implements BusinessRuleClient {

    @Override
    public R<BusinessRuleDTO> getEffectiveRule(String ruleCode) {
        log.warn("业务规则服务不可用，ruleCode={}", ruleCode);
        return R.ok(null);
    }

    @Override
    public R<Void> recordHit(BusinessRuleHitRecordDTO record) {
        log.warn("业务规则命中记录服务不可用，ruleCode={}", record == null ? null : record.getRuleCode());
        return R.ok();
    }
}
