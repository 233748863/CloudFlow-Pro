package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.printing.PrintData;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.hr.service.IHrEssService;
import com.cloudflow.hr.service.impl.HrCertificateServiceImpl;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/hr/print")
@RequiredArgsConstructor
public class HrPrintDataController {
    private static final Set<String> SLIP_FIELDS = Set.of("id", "employeeId", "batchId", "periodMonth", "grossTotal",
            "deductionTotal", "netTotal", "taxAmount", "benefitAmount", "payDate", "status", "employeeConfirmed", "confirmedTime");
    private final IHrEssService ess;
    private final HrTypedCrudService crud;
    private final HrCertificateServiceImpl certificates;

    @GetMapping("/SALARY_SLIP/{id}")
    @Inner(allowedServices = "cloudflow-auth")
    @SaCheckPermission("hr:ess:slip:view")
    @RepeatSubmit.Disabled
    @SysLog(value = "读取本人工资条打印数据", logParams = false)
    public R<PrintData> salary(@PathVariable Long id) {
        requireContext();
        HrSalarySlip slip = ess.getMySalarySlip(id);
        Map<String, Object> values = new LinkedHashMap<>(crud.toMap(slip));
        values.keySet().retainAll(SLIP_FIELDS);
        List<Map<String, Object>> components = new ArrayList<>();
        if (slip.getComponents() != null) for (Map<String, Object> item : slip.getComponents()) {
            if (!Set.of("EARNING", "DEDUCTION").contains(String.valueOf(item.get("type")))) continue;
            Map<String, Object> display = new LinkedHashMap<>(item);
            display.keySet().retainAll(Set.of("type", "name", "salaryComponentName", "amount"));
            components.add(display);
        }
        values.put("components", components);
        return R.ok(new PrintData(UserContext.getTenantId(), "SALARY_SLIP", id.toString(), null, null, values));
    }

    @GetMapping("/CERTIFICATE/{id}")
    @Inner(allowedServices = "cloudflow-auth")
    @SaCheckPermission("hr:ess:cert:view")
    @RepeatSubmit.Disabled
    @SysLog(value = "读取本人证明打印数据", logParams = false)
    public R<PrintData> certificate(@PathVariable Long id) {
        requireContext();
        return R.ok(certificates.printData(id));
    }

    private void requireContext() {
        if (UserContext.getTenantId() == null || UserContext.getUserId() == null) throw new ServiceException("缺少当前用户或租户", 403);
    }
}
