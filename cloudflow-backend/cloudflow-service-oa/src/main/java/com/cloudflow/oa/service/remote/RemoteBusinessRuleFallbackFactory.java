package com.cloudflow.oa.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.dto.BusinessRuleDTO;
import com.cloudflow.oa.domain.dto.BusinessRuleHitRecordDTO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

/**
 * 业务规则服务降级。
 */
@Slf4j
@Component
public class RemoteBusinessRuleFallbackFactory implements FallbackFactory<RemoteBusinessRuleService> {

    @Override
    public RemoteBusinessRuleService create(Throwable cause) {
        return new RemoteBusinessRuleService() {
            @Override
            public R<BusinessRuleDTO> getEffectiveRule(String ruleCode) {
                log.warn("业务规则服务调用失败，ruleCode={}, cause={}", ruleCode, cause.getMessage());
                return R.ok(null);
            }

            @Override
            public R<Void> recordHit(BusinessRuleHitRecordDTO record) {
                log.warn("业务规则命中记录写入失败，ruleCode={}, cause={}",
                        record == null ? null : record.getRuleCode(), cause.getMessage());
                return R.ok();
            }
        };
    }
}
