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

/** 只向经过身份校验的 HR 服务提供六类请假规则与命中登记。 */
@Service
@RequiredArgsConstructor
public class HrLeaveRuleBridgeService {
    private static final Set<String> CODES = Set.of("hr.leave.probation.limit", "hr.leave.continuous.limit",
            "hr.leave.annual.limit", "hr.leave.quota.limit", "hr.leave.attachment.required", "hr.leave.policy.required");
    private final IBusinessRuleService rules;

    public BusinessRule effective(String code) {
        Long tenantId = requireTenant();
        if (code == null || !CODES.contains(code)) throw new IllegalArgumentException("不允许访问此请假规则");
        // 与现有公开查询一致：只选已启用的已发布规则，优先本租户、默认租户、全局。
        return TenantBroker.applyWithoutTenant(ignored -> rules.list(new LambdaQueryWrapper<BusinessRule>()
                        .eq(BusinessRule::getRuleCode, code).eq(BusinessRule::getModule, "hr")
                        .eq(BusinessRule::getEnabled, 1).in(BusinessRule::getTenantId, tenantId, 100000L, 0L)))
                .stream().filter(rule -> code.equals(rule.getRuleCode()) && "hr".equalsIgnoreCase(rule.getModule())
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
                || !"HR_LEAVE".equals(record.getBusinessType()) || record.getBusinessId() == null || record.getBusinessId() <= 0
                || record.getTenantId() != null && !Objects.equals(tenantId, record.getTenantId())
                || record.getEffect() == null || !Set.of("BLOCK", "WARN", "PASS").contains(record.getEffect())
                || !Objects.equals(record.getEffect(), record.getHitResult()) || !violated(record)) {
            throw new IllegalArgumentException("请假规则命中记录无效");
        }
        record.setId(null);
        record.setTenantId(tenantId);
        record.setCreatedTime(null);
        // 命中归属员工；同一员工的不同提交即使数值相同也必须各留一笔。
        if (!rules.recordHit(record)) throw new IllegalStateException("请假规则命中记录保存失败");
    }

    private static boolean violated(BusinessRuleHitRecord record) {
        BigDecimal threshold = record.getThresholdValue();
        BigDecimal actual = record.getActualValue();
        if (threshold == null || actual == null) return false;
        return switch (record.getRuleCode()) {
            case "hr.leave.probation.limit" -> threshold.signum() >= 0 && actual.compareTo(threshold) < 0;
            case "hr.leave.continuous.limit", "hr.leave.annual.limit" -> threshold.signum() >= 0 && actual.compareTo(threshold) > 0;
            case "hr.leave.quota.limit" -> actual.signum() > 0 && actual.compareTo(threshold) > 0;
            case "hr.leave.attachment.required", "hr.leave.policy.required" -> threshold.compareTo(BigDecimal.ONE) == 0 && actual.signum() == 0;
            default -> false;
        };
    }

    private static Long requireTenant() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null || tenantId <= 0) throw new IllegalArgumentException("租户上下文缺失");
        return tenantId;
    }
}
