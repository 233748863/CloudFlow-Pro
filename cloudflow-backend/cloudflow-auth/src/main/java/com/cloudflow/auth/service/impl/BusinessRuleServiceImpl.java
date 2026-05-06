package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.auth.domain.BusinessRule;
import com.cloudflow.auth.mapper.BusinessRuleMapper;
import com.cloudflow.auth.service.IBusinessRuleService;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.common.tenant.TenantBroker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

/**
 * 业务规则服务实现。
 */
@Slf4j
@Service
public class BusinessRuleServiceImpl extends ServiceImpl<BusinessRuleMapper, BusinessRule>
        implements IBusinessRuleService {

    private static final Long DEFAULT_TENANT_ID = 100000L;
    private static final Set<String> ALLOWED_EFFECTS = Set.of("BLOCK", "WARN", "PASS");

    @Override
    public Page<BusinessRule> queryPage(String module, String ruleCode, Integer enabled, Integer pageNum, Integer pageSize) {
        LambdaQueryWrapper<BusinessRule> wrapper = new LambdaQueryWrapper<>();
        wrapper.like(StringUtils.hasText(module), BusinessRule::getModule, module)
                .like(StringUtils.hasText(ruleCode), BusinessRule::getRuleCode, ruleCode)
                .eq(enabled != null, BusinessRule::getEnabled, enabled)
                .orderByAsc(BusinessRule::getModule)
                .orderByAsc(BusinessRule::getPriority)
                .orderByAsc(BusinessRule::getId);
        return page(new Page<>(pageNum == null ? 1 : pageNum, pageSize == null ? 10 : pageSize), wrapper);
    }

    @Override
    public BusinessRule getEffectiveRule(String ruleCode) {
        if (!StringUtils.hasText(ruleCode)) {
            return null;
        }
        Long tenantId = resolveTenantId();
        List<BusinessRule> rules = TenantBroker.applyWithoutTenant(ignore -> list(new LambdaQueryWrapper<BusinessRule>()
                .eq(BusinessRule::getRuleCode, ruleCode)
                .eq(BusinessRule::getEnabled, 1)
                .in(BusinessRule::getTenantId, tenantId, DEFAULT_TENANT_ID, 0L)));
        return rules.stream()
                .sorted(Comparator
                        .comparingInt((BusinessRule rule) -> tenantRank(rule.getTenantId(), tenantId))
                        .thenComparing(rule -> rule.getPriority() == null ? Integer.MAX_VALUE : rule.getPriority())
                        .thenComparing(rule -> rule.getId() == null ? Long.MAX_VALUE : rule.getId()))
                .findFirst()
                .orElse(null);
    }

    @Override
    public boolean createRule(BusinessRule rule) {
        normalizeRule(rule, true);
        ensureRuleCodeUnique(rule);
        return save(rule);
    }

    @Override
    public boolean updateRule(BusinessRule rule) {
        if (rule == null || rule.getId() == null) {
            throw new IllegalArgumentException("规则ID不能为空");
        }
        BusinessRule existing = getById(rule.getId());
        if (existing == null) {
            throw new IllegalArgumentException("业务规则不存在");
        }
        if (rule.getTenantId() == null) {
            rule.setTenantId(existing.getTenantId());
        }
        normalizeRule(rule, false);
        ensureRuleCodeUnique(rule);
        rule.setUpdateTime(LocalDateTime.now());
        return updateById(rule);
    }

    @Override
    public boolean setEnabled(Long id, Integer enabled) {
        if (id == null) {
            throw new IllegalArgumentException("规则ID不能为空");
        }
        if (enabled == null || (enabled != 0 && enabled != 1)) {
            throw new IllegalArgumentException("启停状态只能为0或1");
        }
        BusinessRule rule = new BusinessRule();
        rule.setId(id);
        rule.setEnabled(enabled);
        rule.setUpdateBy(resolveUserName());
        rule.setUpdateTime(LocalDateTime.now());
        return updateById(rule);
    }

    private void normalizeRule(BusinessRule rule, boolean created) {
        if (rule == null) {
            throw new IllegalArgumentException("业务规则不能为空");
        }
        if (!StringUtils.hasText(rule.getRuleCode())) {
            throw new IllegalArgumentException("规则编码不能为空");
        }
        if (!StringUtils.hasText(rule.getRuleName())) {
            throw new IllegalArgumentException("规则名称不能为空");
        }
        if (!StringUtils.hasText(rule.getModule())) {
            throw new IllegalArgumentException("所属模块不能为空");
        }
        rule.setRuleCode(rule.getRuleCode().trim());
        rule.setModule(rule.getModule().trim().toUpperCase());
        rule.setEffect(StringUtils.hasText(rule.getEffect()) ? rule.getEffect().trim().toUpperCase() : "WARN");
        if (!ALLOWED_EFFECTS.contains(rule.getEffect())) {
            throw new IllegalArgumentException("规则效果仅支持BLOCK/WARN/PASS");
        }
        if (rule.getEnabled() == null) {
            rule.setEnabled(1);
        }
        if (rule.getEnabled() != 0 && rule.getEnabled() != 1) {
            throw new IllegalArgumentException("启停状态只能为0或1");
        }
        if (rule.getPriority() == null) {
            rule.setPriority(100);
        }
        if (rule.getTenantId() == null) {
            rule.setTenantId(resolveTenantId());
        }
        LocalDateTime now = LocalDateTime.now();
        if (created) {
            rule.setCreateBy(resolveUserName());
            rule.setCreateTime(now);
        }
        rule.setUpdateBy(resolveUserName());
        rule.setUpdateTime(now);
    }

    private void ensureRuleCodeUnique(BusinessRule rule) {
        LambdaQueryWrapper<BusinessRule> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(BusinessRule::getTenantId, rule.getTenantId())
                .eq(BusinessRule::getRuleCode, rule.getRuleCode());
        if (rule.getId() != null) {
            wrapper.ne(BusinessRule::getId, rule.getId());
        }
        Long count = count(wrapper);
        if (count != null && count > 0) {
            throw new IllegalArgumentException("当前租户已存在规则编码：" + rule.getRuleCode());
        }
    }

    private int tenantRank(Long ruleTenantId, Long tenantId) {
        if (ruleTenantId == null) {
            return 3;
        }
        if (ruleTenantId.equals(tenantId)) {
            return 0;
        }
        if (ruleTenantId.equals(DEFAULT_TENANT_ID)) {
            return 1;
        }
        if (ruleTenantId == 0L) {
            return 2;
        }
        return 3;
    }

    private Long resolveTenantId() {
        return SecurityUtils.getTenantId() == null ? DEFAULT_TENANT_ID : SecurityUtils.getTenantId();
    }

    private String resolveUserName() {
        return StringUtils.hasText(SecurityUtils.getUsername()) ? SecurityUtils.getUsername() : "system";
    }
}
