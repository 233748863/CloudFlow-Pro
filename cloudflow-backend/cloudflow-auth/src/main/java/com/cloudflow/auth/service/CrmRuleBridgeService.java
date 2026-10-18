package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.BusinessRule;
import com.cloudflow.auth.domain.BusinessRuleHitRecord;
import com.cloudflow.auth.mapper.BusinessRuleHitRecordMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.redis.lock.DistributedLock;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class CrmRuleBridgeService {
    private static final Set<String> CODES = Set.of("crm.credit.limit", "crm.credit.overdue", "crm.lead.qualify.required");
    private final IBusinessRuleService rules;
    private final BusinessRuleHitRecordMapper hitMapper;

    public BusinessRule effective(String code) {
        if (!CODES.contains(code)) throw new IllegalArgumentException("不允许访问此规则");
        if (UserContext.getTenantId() == null) throw new IllegalArgumentException("租户上下文缺失");
        Long tenantId = UserContext.getTenantId();
        return com.cloudflow.common.tenant.TenantBroker.applyWithoutTenant(ignored -> rules.list(new LambdaQueryWrapper<BusinessRule>()
                .eq(BusinessRule::getRuleCode, code).in(BusinessRule::getTenantId, tenantId, 100000L, 0L)))
                .stream().min(java.util.Comparator.comparingInt((BusinessRule rule) -> tenantId.equals(rule.getTenantId()) ? 0 : Long.valueOf(100000L).equals(rule.getTenantId()) ? 1 : 2)
                        .thenComparing(rule -> rule.getPriority() == null ? Integer.MAX_VALUE : rule.getPriority())
                        .thenComparing(BusinessRule::getId)).orElse(null);
    }

    @Transactional(rollbackFor = Exception.class)
    @DistributedLock(key = "'crm:rulehit:' + T(com.cloudflow.common.core.context.UserContext).getTenantId() + ':' + #record.ruleCode + ':' + #record.businessType + ':' + #record.businessId")
    public void record(BusinessRuleHitRecord record) {
        if (record == null || !CODES.contains(record.getRuleCode()) || UserContext.getTenantId() == null
                || record.getBusinessId() == null || record.getBusinessType() == null || !record.getBusinessType().startsWith("CRM_")) {
            throw new IllegalArgumentException("CRM规则命中记录无效");
        }
        if (!Set.of("BLOCK", "WARN", "PASS").contains(record.getEffect())
                || !Set.of("BLOCK", "WARN", "PASS", "BYPASSED").contains(record.getHitResult())) throw new IllegalArgumentException("规则效果无效");
        record.setId(null); record.setTenantId(UserContext.getTenantId());
        record.setThresholdValue(record.getThresholdValue() == null ? BigDecimal.ZERO : record.getThresholdValue());
        record.setActualValue(record.getActualValue() == null ? BigDecimal.ZERO : record.getActualValue());
        LambdaQueryWrapper<BusinessRuleHitRecord> document = new LambdaQueryWrapper<BusinessRuleHitRecord>()
                .eq(BusinessRuleHitRecord::getTenantId, record.getTenantId()).eq(BusinessRuleHitRecord::getRuleCode, record.getRuleCode())
                .eq(BusinessRuleHitRecord::getBusinessType, record.getBusinessType()).eq(BusinessRuleHitRecord::getBusinessId, record.getBusinessId())
                .orderByDesc(BusinessRuleHitRecord::getCreatedTime).orderByDesc(BusinessRuleHitRecord::getId);
        List<BusinessRuleHitRecord> recent = hitMapper.selectPage(new Page<BusinessRuleHitRecord>(1, 1, false), document).getRecords();
        if (!recent.isEmpty()) {
            BusinessRuleHitRecord latest = recent.get(0);
            if (record.getEffect().equals(latest.getEffect()) && record.getHitResult().equals(latest.getHitResult())
                    && latest.getThresholdValue() != null && record.getThresholdValue().compareTo(latest.getThresholdValue()) == 0
                    && latest.getActualValue() != null && record.getActualValue().compareTo(latest.getActualValue()) == 0) return;
        }
        if (!rules.recordHit(record)) throw new IllegalStateException("规则命中记录保存失败");
    }
}
