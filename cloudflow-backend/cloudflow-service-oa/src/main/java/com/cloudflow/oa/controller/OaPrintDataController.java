package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.printing.PrintData;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.domain.BizPurchaseRequest;
import com.cloudflow.oa.mapper.BizPurchaseRequestMapper;
import com.cloudflow.oa.service.IExpenseClaimService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/oa/print")
@RequiredArgsConstructor
public class OaPrintDataController {
    private static final TypeReference<LinkedHashMap<String, Object>> MAP = new TypeReference<>() { };
    private final IExpenseClaimService expenses;
    private final BizPurchaseRequestMapper purchases;
    private final ObjectMapper json;

    @GetMapping("/EXPENSE_CLAIM/{id}")
    @Inner(allowedServices = "cloudflow-auth")
    @SaCheckPermission("oa:expense:list")
    @RepeatSubmit.Disabled
    @SysLog(value = "读取报销单打印数据", logParams = false)
    public R<PrintData> expense(@PathVariable Long id) {
        context();
        BizExpenseClaim claim = expenses.getClaimWithItems(id);
        if (claim == null || !Objects.equals(UserContext.getTenantId(), claim.getTenantId())
                || !Integer.valueOf(0).equals(claim.getDeleted())) throw new ServiceException("报销单不存在或无权访问", 403);
        return R.ok(new PrintData(claim.getTenantId(), "EXPENSE_CLAIM", id.toString(), claim.getInstanceId(), "expense_claim:" + id, values(claim)));
    }

    @GetMapping("/PURCHASE_ORDER/{id}")
    @Inner(allowedServices = "cloudflow-auth")
    @SaCheckPermission("oa:purchase:list")
    @RepeatSubmit.Disabled
    @SysLog(value = "读取采购单打印数据", logParams = false)
    public R<PrintData> purchase(@PathVariable Long id) {
        context();
        BizPurchaseRequest purchase = purchases.selectPrintableWithItems(id, UserContext.getTenantId(), DataScopeUtils.listScope());
        if (purchase == null || !Objects.equals(UserContext.getTenantId(), purchase.getTenantId())
                || !Integer.valueOf(0).equals(purchase.getDeleted())) throw new ServiceException("采购单不存在或无权访问", 403);
        return R.ok(new PrintData(purchase.getTenantId(), "PURCHASE_ORDER", id.toString(), purchase.getInstanceId(), "purchase_request:" + id, values(purchase)));
    }

    private Map<String, Object> values(Object entity) {
        Map<String, Object> values = json.convertValue(entity, MAP);
        values.keySet().removeAll(java.util.Set.of("tenantId", "deleted", "instanceId", "attachmentUrl"));
        return values;
    }
    private void context() {
        if (UserContext.getTenantId() == null || UserContext.getUserId() == null) throw new ServiceException("缺少当前用户或租户", 403);
    }
}
