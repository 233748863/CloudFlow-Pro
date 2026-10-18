package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.dto.BusinessRuleDTO;
import com.cloudflow.oa.domain.dto.BusinessRuleHitRecordDTO;
import com.cloudflow.oa.service.remote.RemoteConsumableRuleService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.math.BigDecimal;

@Service
@RequiredArgsConstructor
public class ConsumableRuleExecutor {
    private final RemoteConsumableRuleService rules;

    public record Decision(String effect, boolean approval) { }

    public BusinessRuleDTO effective(String code) {
        outsideTransaction();
        try {
            R<BusinessRuleDTO> response = rules.getEffectiveRule(code);
            if (response == null || !response.isSuccess() || response.getData() == null) throw new IllegalStateException();
            return response.getData();
        } catch (RuntimeException exception) {
            throw new IllegalStateException("RULE_UNAVAILABLE: 规则中心不可用");
        }
    }

    public static Decision decide(BusinessRuleDTO rule, String mode, BigDecimal total, BigDecimal actual) {
        boolean hit = actual != null && actual.compareTo(rule.getThresholdValue()) > 0;
        String effect = hit ? rule.getEffect() : total == null ? "WARN" : "PASS";
        return new Decision(effect, "ALWAYS".equals(mode) || total == null || hit && !"PASS".equals(effect));
    }

    public void record(Long id, BusinessRuleDTO rule, BigDecimal actual, String effect) {
        outsideTransaction();
        BusinessRuleHitRecordDTO record = new BusinessRuleHitRecordDTO();
        record.setTenantId(OaRecordSupport.tenantId());
        record.setRuleCode(rule.getRuleCode());
        record.setBusinessType(ConsumableOperationSupport.BUSINESS_TYPE);
        record.setBusinessId(id);
        record.setActualValue(actual);
        record.setThresholdValue(rule.getThresholdValue());
        record.setEffect(effect);
        record.setHitResult(effect);
        try {
            R<Void> response = rules.recordHit(record);
            if (response == null || !response.isSuccess()) throw new IllegalStateException();
        } catch (RuntimeException exception) {
            throw new IllegalStateException("RULE_AUDIT_FAILED: 规则命中记录保存失败");
        }
    }

    private void outsideTransaction() {
        if (TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("规则中心调用必须位于库存事务外");
    }
}
