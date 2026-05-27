package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.hr.domain.vo.HrDeptSummaryVO;
import com.cloudflow.hr.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.hr.service.IHrIntegrationQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * HR 供 CRM / OA 等微服务内部查询员工和部门的接口。
 * 仅允许经过网关的内部调用（X-Inner-Call + 来源服务白名单）。
 */
@RestController
@RequestMapping("/inner/hr")
@RequiredArgsConstructor
public class HrInnerController {

    private static final String INTERNAL_CALLERS =
            "${cloudflow.security.inner.hr.integration-callers:cloudflow-service-crm,cloudflow-service-oa,cloudflow-service-workflow}";

    private final IHrIntegrationQueryService hrIntegrationQueryService;

    @Inner(allowedServices = {INTERNAL_CALLERS})
    @GetMapping("/employees/{employeeId}")
    public R<HrEmployeeSummaryVO> getEmployee(@PathVariable("employeeId") Long employeeId) {
        return hrIntegrationQueryService.findEmployee(employeeId)
                .map(R::ok)
                .orElseGet(() -> R.ok(null));
    }

    @Inner(allowedServices = {INTERNAL_CALLERS})
    @GetMapping("/employees/by-user/{userId}")
    public R<HrEmployeeSummaryVO> getEmployeeByUserId(@PathVariable("userId") Long userId) {
        return hrIntegrationQueryService.findEmployeeByUserId(userId)
                .map(R::ok)
                .orElseGet(() -> R.ok(null));
    }

    @Inner(allowedServices = {INTERNAL_CALLERS})
    @GetMapping("/employees")
    public R<List<HrEmployeeSummaryVO>> listEmployees(@RequestParam("ids") List<Long> ids) {
        return R.ok(hrIntegrationQueryService.listEmployees(ids));
    }

    @Inner(allowedServices = {INTERNAL_CALLERS})
    @GetMapping("/employees/by-users")
    public R<List<HrEmployeeSummaryVO>> listEmployeesByUserIds(@RequestParam("userIds") List<Long> userIds) {
        return R.ok(hrIntegrationQueryService.listEmployeesByUserIds(userIds));
    }

    @Inner(allowedServices = {INTERNAL_CALLERS})
    @GetMapping("/depts")
    public R<List<HrDeptSummaryVO>> listDepartments(@RequestParam(value = "ids", required = false) List<Long> ids) {
        return R.ok(hrIntegrationQueryService.listDepartments(ids));
    }
}
