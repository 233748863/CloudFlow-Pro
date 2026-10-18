package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.BusinessRule;
import com.cloudflow.auth.domain.BusinessRuleHitRecord;
import com.cloudflow.auth.mapper.BusinessRuleHitRecordMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.redis.lock.DistributedLock;
import com.cloudflow.common.tenant.TenantBroker;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class HrRuleBridgeService {
    private static final String CODE = "hr.overtime.hours.limit";
    private final IBusinessRuleService rules;
    private final BusinessRuleHitRecordMapper hitMapper;

    public BusinessRule effective(String code) {
        Long tenantId = requireTenant();
        if (!CODE.equals(code)) throw new IllegalArgumentException("不允许访问此规则");
        return TenantBroker.applyWithoutTenant(ignored -> rules.list(new LambdaQueryWrapper<BusinessRule>()
                        .eq(BusinessRule::getRuleCode, CODE).eq(BusinessRule::getModule, "hr")
                        .in(BusinessRule::getTenantId, tenantId, 100000L, 0L)))
                .stream().filter(rule -> CODE.equals(rule.getRuleCode()) && "hr".equalsIgnoreCase(rule.getModule())
                        && rule.getTenantId() != null && (Objects.equals(tenantId, rule.getTenantId())
                        || rule.getTenantId() == 100000L || rule.getTenantId() == 0L))
                .min(Comparator.comparingInt((BusinessRule rule) -> Objects.equals(tenantId, rule.getTenantId())
                                ? 0 : rule.getTenantId() == 100000L ? 1 : 2)
                        .thenComparing(rule -> Objects.requireNonNullElse(rule.getPriority(), Integer.MAX_VALUE))
                        .thenComparing(rule -> Objects.requireNonNullElse(rule.getId(), Long.MAX_VALUE)))
                .orElse(null);
    }

    @Transactional(rollbackFor = Exception.class)
    @DistributedLock(key = "'hr:rulehit:' + T(com.cloudflow.common.core.context.UserContext).getTenantId() + ':' + #record.ruleCode + ':' + #record.businessType + ':' + #record.businessId")
    public void record(BusinessRuleHitRecord record) {
        Long tenantId = requireTenant();
        if (record == null || !CODE.equals(record.getRuleCode()) || record.getBusinessId() == null
                || record.getBusinessId() <= 0 || record.getBusinessType() == null
                || !Set.of("HR_OVERTIME_DAY", "HR_OVERTIME_MONTH").contains(record.getBusinessType())
                || record.getTenantId() != null && !Objects.equals(tenantId, record.getTenantId())
                || record.getEffect() == null || !Set.of("BLOCK", "WARN").contains(record.getEffect())
                || !Objects.equals(record.getEffect(), record.getHitResult())
                || record.getThresholdValue() == null || record.getThresholdValue().signum() <= 0
                || record.getActualValue() == null || record.getActualValue().compareTo(record.getThresholdValue()) < 0) {
            throw new IllegalArgumentException("加班规则命中记录无效");
        }
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
            throw new IllegalStateException("加班规则命中记录保存失败");
        }
    }

    private Long requireTenant() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) throw new IllegalArgumentException("租户上下文缺失");
        return tenantId;
    }
}
