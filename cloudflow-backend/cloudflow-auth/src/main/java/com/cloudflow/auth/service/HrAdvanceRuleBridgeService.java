package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.BusinessRule;
import com.cloudflow.auth.domain.BusinessRuleVersion;
import com.cloudflow.auth.mapper.BusinessRuleVersionMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantBroker;
import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Published advance limits, read together without inventing a default financial policy. */
@Service
@RequiredArgsConstructor
public class HrAdvanceRuleBridgeService {
    private final IBusinessRuleService rules;
    private final BusinessRuleVersionMapper versions;

    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public List<PublishedRule> policy(boolean payrollDeduction) {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null || tenantId <= 0) throw new IllegalArgumentException("缺少可信租户");
        List<String> codes = payrollDeduction ? List.of("hr.advance.salary.multiplier", "hr.advance.payroll.maximumNetRatio", "hr.advance.payroll.minimumNetAmount")
                : List.of("hr.advance.salary.multiplier");
        return codes.stream().map(code -> published(tenantId, code)).toList();
    }

    private PublishedRule published(Long tenantId, String code) {
        BusinessRule rule = TenantBroker.applyWithoutTenant(ignored -> rules.list(new LambdaQueryWrapper<BusinessRule>()
                .eq(BusinessRule::getRuleCode, code).eq(BusinessRule::getModule, "hr")
                .in(BusinessRule::getTenantId, java.util.stream.Stream.of(tenantId, 100000L, 0L).distinct().toList())))
                .stream().filter(candidate -> code.equals(candidate.getRuleCode()) && "hr".equalsIgnoreCase(candidate.getModule())
                        && candidate.getTenantId() != null && (tenantId.equals(candidate.getTenantId()) || candidate.getTenantId() == 100000L || candidate.getTenantId() == 0L))
                .min(Comparator.comparingInt((BusinessRule candidate) -> tenantId.equals(candidate.getTenantId()) ? 0 : candidate.getTenantId() == 100000L ? 1 : 2)
                        .thenComparing(candidate -> Objects.requireNonNullElse(candidate.getPriority(), Integer.MAX_VALUE))
                        .thenComparing(candidate -> Objects.requireNonNullElse(candidate.getId(), Long.MAX_VALUE))).orElse(null);
        if (rule == null || rule.getId() == null || !Integer.valueOf(1).equals(rule.getEnabled())
                || !"BLOCK".equals(rule.getEffect()) || rule.getThresholdValue() == null) throw new IllegalArgumentException("借款规则尚未核定并启用：" + code);
        List<BusinessRuleVersion> published = TenantBroker.applyWithoutTenant(ignored -> versions.selectList(new LambdaQueryWrapper<BusinessRuleVersion>()
                .eq(BusinessRuleVersion::getTenantId, rule.getTenantId()).eq(BusinessRuleVersion::getRuleId, rule.getId())
                .eq(BusinessRuleVersion::getStatus, "PUBLISHED")));
        if (published.size() != 1) throw new IllegalArgumentException("借款规则缺少唯一已发布版本：" + code);
        BusinessRuleVersion version = published.get(0);
        if (!Objects.equals(version.getTenantId(), rule.getTenantId()) || !Objects.equals(version.getRuleId(), rule.getId())
                || !code.equals(version.getRuleCode()) || !"PUBLISHED".equals(version.getStatus())
                || version.getVersionNo() == null || version.getVersionNo() < 1 || version.getPublishedTime() == null
                || !Objects.equals(rule.getEnabled(), version.getEnabled()) || !Objects.equals(rule.getEffect(), version.getEffect())
                || version.getThresholdValue() == null || rule.getThresholdValue().compareTo(version.getThresholdValue()) != 0) {
            throw new IllegalArgumentException("借款规则与已发布版本不一致：" + code);
        }
        return new PublishedRule(rule.getId(), rule.getTenantId(), code, version.getVersionNo(), rule.getThresholdValue());
    }

    public record PublishedRule(Long ruleId, Long ruleTenantId, String ruleCode, Integer ruleVersion, BigDecimal value) { }
}
