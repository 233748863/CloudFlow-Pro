package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.dto.BusinessRuleDTO;
import com.cloudflow.oa.domain.dto.BusinessRuleHitRecordDTO;
import com.cloudflow.oa.service.remote.RemoteBusinessRuleService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class OaBusinessRuleService {
    public static final String WARNINGS_ATTRIBUTE = "oa.rule.warnings";
    private static final Set<String> PROJECT_RULES = Set.of("oa.timesheet.daily-hours", "oa.project.dependency.unsatisfied");
    private final RemoteBusinessRuleService client;

    public BusinessRuleDTO effective(String code) {
        R<BusinessRuleDTO> response = PROJECT_RULES.contains(code) ? client.getEffectiveProjectRule(code) : client.getEffectiveRule(code);
        if (response == null || !response.isSuccess() || response.getData() == null) throw new IllegalStateException("业务规则不可用，操作未放行：" + code);
        return response.getData();
    }

    public BigDecimal threshold(String code) {
        return OaRecordSupport.require(effective(code).getThresholdValue(), "规则阈值未配置：" + code);
    }

    public void evaluateBlock(String code, String type, Long id, boolean bypass, String message) {
        evaluate(code, type, id, BigDecimal.ONE, BigDecimal.ZERO, true, bypass, message);
    }

    public void evaluateWarn(String code, String type, Long id, BigDecimal actual, boolean below, String message) {
        BusinessRuleDTO rule = effective(code);
        BigDecimal threshold = OaRecordSupport.require(rule.getThresholdValue(), "规则阈值未配置");
        evaluate(rule, type, id, actual, threshold, below ? actual.compareTo(threshold) < 0 : actual.compareTo(threshold) > 0, false, message);
    }

    private void evaluate(String code, String type, Long id, BigDecimal actual, BigDecimal threshold, boolean hit, boolean bypass, String message) {
        evaluate(effective(code), type, id, actual, threshold, hit, bypass, message);
    }

    private void evaluate(BusinessRuleDTO rule, String type, Long id, BigDecimal actual, BigDecimal threshold, boolean hit, boolean bypass, String message) {
        String effect = hit && !Integer.valueOf(0).equals(rule.getEnabled()) ? rule.getEffect() : "PASS";
        if ("ALERT".equals(effect)) effect = "WARN";
        if (!Set.of("BLOCK", "WARN", "PASS").contains(effect)) throw new IllegalStateException("规则效果无效");
        BusinessRuleHitRecordDTO record = new BusinessRuleHitRecordDTO();
        record.setTenantId(OaRecordSupport.tenantId()); record.setRuleCode(rule.getRuleCode());
        record.setBusinessType(type); record.setBusinessId(id); record.setActualValue(actual); record.setThresholdValue(threshold);
        record.setEffect(bypass ? "PASS" : effect); record.setHitResult(bypass ? "BYPASSED" : effect);
        R<Void> response = PROJECT_RULES.contains(rule.getRuleCode()) ? client.recordProjectHit(record) : client.recordHit(record);
        if (response == null || !response.isSuccess()) throw new IllegalStateException("业务规则命中记录保存失败，操作未放行");
        if (bypass) return;
        if ("BLOCK".equals(effect)) throw new IllegalArgumentException(message);
        if ("WARN".equals(effect)) {
            RequestAttributes request = RequestContextHolder.getRequestAttributes();
            if (request != null) {
                List<String> warnings = new ArrayList<>();
                Object previous = request.getAttribute(WARNINGS_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST);
                if (previous instanceof List<?> values) values.forEach(value -> warnings.add(String.valueOf(value)));
                if (!warnings.contains(message)) warnings.add(message);
                request.setAttribute(WARNINGS_ATTRIBUTE, warnings, RequestAttributes.SCOPE_REQUEST);
            }
        }
    }
}
