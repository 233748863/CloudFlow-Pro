package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.exception.CrmBusinessException;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.service.remote.CrmBusinessRuleClient;
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
public class CrmRuleService {
    public static final String WARNINGS_ATTRIBUTE = "crm.rule.warnings";
    private final CrmBusinessRuleClient client;
    private final CrmAuditTrail auditTrail;

    public String evaluate(String code, String defaultEffect, String businessType, Long businessId,
            BigDecimal actual, BigDecimal threshold, boolean bypass, String message) {
        R<CrmBusinessRuleClient.Rule> response = client.effective(code);
        if (response == null || !response.isSuccess()) throw new IllegalStateException("业务规则服务暂不可用，本次操作未放行");
        CrmBusinessRuleClient.Rule rule = response.getData();
        String configured = rule == null ? defaultEffect : Integer.valueOf(0).equals(rule.getEnabled()) ? "PASS" : rule.getEffect();
        if ("ALERT".equals(configured)) configured = "WARN";
        if (!Set.of("BLOCK", "WARN", "PASS").contains(configured)) throw new IllegalStateException("业务规则效果配置无效");
        BigDecimal boundary = threshold == null ? rule == null ? BigDecimal.ZERO : rule.getThresholdValue() : threshold;
        String effect = actual.compareTo(boundary) > 0 ? configured : "PASS";
        if (bypass) effect = "PASS";
        CrmBusinessRuleClient.Hit hit = new CrmBusinessRuleClient.Hit();
        hit.setTenantId(CrmRecordSupport.tenantId()); hit.setRuleCode(code); hit.setBusinessType(businessType); hit.setBusinessId(businessId);
        hit.setActualValue(actual); hit.setThresholdValue(boundary); hit.setEffect(effect); hit.setHitResult(bypass ? "BYPASSED" : effect);
        R<Void> recorded = client.recordHit(hit);
        if (recorded == null || !recorded.isSuccess()) throw new IllegalStateException("规则命中记录保存失败，本次操作未放行");
        if (bypass || "BLOCK".equals(effect)) auditTrail.recordAttempt(code + ":" + hit.getHitResult(),
                businessType + ":" + businessId, "实际值=" + actual + ",阈值=" + boundary, true);
        if ("BLOCK".equals(effect)) throw new CrmBusinessException(message);
        if ("WARN".equals(effect)) addWarning(message);
        return effect;
    }

    private void addWarning(String message) {
        RequestAttributes request = RequestContextHolder.getRequestAttributes();
        if (request == null) return;
        Object stored = request.getAttribute(WARNINGS_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST);
        List<String> warnings = new ArrayList<>();
        if (stored instanceof List<?> values) values.forEach(value -> warnings.add(String.valueOf(value)));
        if (!warnings.contains(message)) warnings.add(message);
        request.setAttribute(WARNINGS_ATTRIBUTE, warnings, RequestAttributes.SCOPE_REQUEST);
    }
}
