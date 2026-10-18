package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.BusinessRule;
import com.cloudflow.auth.domain.BusinessRuleHitRecord;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantBroker;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ProjectRuleBridgeService {
    private static final String DAILY_HOURS = "oa.timesheet.daily-hours";
    private static final String DEPENDENCY = "oa.project.dependency.unsatisfied";
    private static final Set<String> CODES = Set.of(DAILY_HOURS, DEPENDENCY);
    private final IBusinessRuleService rules;

    public BusinessRule effective(String code) {
        Long tenantId = requireTenant();
        if (code == null || !CODES.contains(code)) throw new IllegalArgumentException("不允许访问此项目工时规则");
        return TenantBroker.applyWithoutTenant(ignored -> rules.list(new LambdaQueryWrapper<BusinessRule>()
                        .eq(BusinessRule::getRuleCode, code).eq(BusinessRule::getModule, "oa")
                        .eq(BusinessRule::getEnabled, 1).in(BusinessRule::getTenantId, tenantId, 100000L, 0L)))
                .stream().filter(rule -> code.equals(rule.getRuleCode()) && "oa".equalsIgnoreCase(rule.getModule())
                        && Integer.valueOf(1).equals(rule.getEnabled()) && rule.getTenantId() != null
                        && (Objects.equals(tenantId, rule.getTenantId()) || rule.getTenantId() == 100000L || rule.getTenantId() == 0L))
                .min(Comparator.comparingInt((BusinessRule rule) -> Objects.equals(tenantId, rule.getTenantId())
                                ? 0 : rule.getTenantId() == 100000L ? 1 : 2)
                        .thenComparing(rule -> Objects.requireNonNullElse(rule.getPriority(), Integer.MAX_VALUE))
                        .thenComparing(rule -> Objects.requireNonNullElse(rule.getId(), Long.MAX_VALUE)))
                .orElse(null);
    }

    @Transactional(rollbackFor = Exception.class)
    public void record(BusinessRuleHitRecord record) {
        Long tenantId = requireTenant();
        if (record == null || record.getRuleCode() == null || !CODES.contains(record.getRuleCode())
                || record.getTenantId() != null && !Objects.equals(tenantId, record.getTenantId())
                || record.getEffect() == null || !Set.of("BLOCK", "WARN", "PASS").contains(record.getEffect())
                || !Objects.equals(record.getEffect(), record.getHitResult()) || !validBusiness(record)) {
            throw new IllegalArgumentException("项目工时规则记录无效");
        }
        record.setId(null);
        record.setTenantId(tenantId);
        record.setCreatedTime(null);
        if (!rules.recordHit(record)) throw new IllegalStateException("项目工时规则记录保存失败");
    }

    private static boolean validBusiness(BusinessRuleHitRecord record) {
        BigDecimal threshold = record.getThresholdValue();
        BigDecimal actual = record.getActualValue();
        if (threshold == null || actual == null || threshold.signum() < 0 || actual.signum() < 0
                || record.getBusinessId() != null && record.getBusinessId() <= 0) return false;
        return switch (record.getRuleCode()) {
            case DAILY_HOURS -> "TIMESHEET".equals(record.getBusinessType());
            case DEPENDENCY -> "PROJECT_TASK".equals(record.getBusinessType()) && record.getBusinessId() != null
                    && threshold.signum() == 0 && actual.compareTo(BigDecimal.ONE) == 0;
            default -> false;
        };
    }

    private static Long requireTenant() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null || tenantId <= 0) throw new IllegalArgumentException("租户上下文缺失");
        return tenantId;
    }
}
