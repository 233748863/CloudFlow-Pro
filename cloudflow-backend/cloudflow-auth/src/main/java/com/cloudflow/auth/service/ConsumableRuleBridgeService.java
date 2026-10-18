package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.BusinessRule;
import com.cloudflow.auth.domain.BusinessRuleHitRecord;
import com.cloudflow.auth.mapper.BusinessRuleHitRecordMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.redis.lock.DistributedLock;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ConsumableRuleBridgeService {
    private static final String CODE = "oa.consumable.request.limit";
    private final IBusinessRuleService rules;
    private final BusinessRuleHitRecordMapper hitMapper;

    public BusinessRule effective(String code) {
        Long tenantId = requireTenant();
        if (!CODE.equals(code)) throw new IllegalArgumentException("不允许访问此规则");
        return rules.list(new LambdaQueryWrapper<BusinessRule>()
                        .eq(BusinessRule::getRuleCode, CODE).eq(BusinessRule::getModule, "oa")
                        .eq(BusinessRule::getTenantId, tenantId))
                .stream().filter(rule -> CODE.equals(rule.getRuleCode()) && "oa".equalsIgnoreCase(rule.getModule())
                        && Objects.equals(tenantId, rule.getTenantId()))
                .min(Comparator.comparingInt((BusinessRule rule) -> Objects.requireNonNullElse(rule.getPriority(), Integer.MAX_VALUE))
                        .thenComparing(rule -> Objects.requireNonNullElse(rule.getId(), Long.MAX_VALUE)))
                .orElse(null);
    }

    @Transactional(rollbackFor = Exception.class)
    @DistributedLock(key = "'oa:consumable:rulehit:' + T(com.cloudflow.common.core.context.UserContext).getTenantId() + ':' + #record.businessId")
    public void record(BusinessRuleHitRecord record) {
        Long tenantId = requireTenant();
        if (record == null || !CODE.equals(record.getRuleCode()) || record.getBusinessId() == null || record.getBusinessId() <= 0
                || !"OA_CONSUMABLE_REQUEST".equals(record.getBusinessType())
                || record.getTenantId() != null && !Objects.equals(tenantId, record.getTenantId())
                || record.getEffect() == null || !Set.of("BLOCK", "WARN", "ALERT", "PASS").contains(record.getEffect())
                || !Objects.equals(record.getEffect(), record.getHitResult())
                || record.getThresholdValue() == null || record.getThresholdValue().signum() < 0
                || record.getActualValue() != null && record.getActualValue().signum() < 0) {
            throw new IllegalArgumentException("耗材规则命中记录无效");
        }
        if (record.getActualValue() == null) record.setActualValue(BigDecimal.ZERO);
        record.setId(null);
        record.setTenantId(tenantId);
        record.setCreatedTime(null);
        LambdaQueryWrapper<BusinessRuleHitRecord> identical = new LambdaQueryWrapper<BusinessRuleHitRecord>()
                .eq(BusinessRuleHitRecord::getTenantId, tenantId).eq(BusinessRuleHitRecord::getRuleCode, CODE)
                .eq(BusinessRuleHitRecord::getBusinessType, record.getBusinessType())
                .eq(BusinessRuleHitRecord::getBusinessId, record.getBusinessId())
                .eq(BusinessRuleHitRecord::getEffect, record.getEffect())
                .eq(BusinessRuleHitRecord::getHitResult, record.getHitResult())
                .eq(BusinessRuleHitRecord::getThresholdValue, record.getThresholdValue())
                .eq(BusinessRuleHitRecord::getActualValue, record.getActualValue());
        if (hitMapper.selectCount(identical) == 0 && !rules.recordHit(record)) {
            throw new IllegalStateException("耗材规则命中记录保存失败");
        }
    }

    private Long requireTenant() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) throw new IllegalArgumentException("租户上下文缺失");
        return tenantId;
    }
}
