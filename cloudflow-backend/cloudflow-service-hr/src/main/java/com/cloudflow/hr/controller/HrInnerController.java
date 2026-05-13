package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.hr.domain.vo.HrDeptSummaryVO;
import com.cloudflow.hr.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.hr.service.HrIntegrationQueryService;
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

    private static final String CRM_SERVICE = "cloudflow-service-crm";
    private static final String OA_SERVICE = "cloudflow-service-oa";
    private static final String WORKFLOW_SERVICE = "cloudflow-service-workflow";

    private final HrIntegrationQueryService integrationQueryService;

    @Inner(allowedServices = {CRM_SERVICE, OA_SERVICE, WORKFLOW_SERVICE})
    @GetMapping("/employees/{employeeId}")
    public R<HrEmployeeSummaryVO> getEmployee(@PathVariable("employeeId") Long employeeId) {
        return integrationQueryService.findEmployee(employeeId)
                .map(R::ok)
                .orElseGet(() -> R.ok(null));
    }

    @Inner(allowedServices = {CRM_SERVICE, OA_SERVICE, WORKFLOW_SERVICE})
    @GetMapping("/employees/by-user/{userId}")
    public R<HrEmployeeSummaryVO> getEmployeeByUserId(@PathVariable("userId") Long userId) {
        return integrationQueryService.findEmployeeByUserId(userId)
                .map(R::ok)
                .orElseGet(() -> R.ok(null));
    }

    @Inner(allowedServices = {CRM_SERVICE, OA_SERVICE, WORKFLOW_SERVICE})
    @GetMapping("/employees")
    public R<List<HrEmployeeSummaryVO>> listEmployees(@RequestParam("ids") List<Long> ids) {
        return R.ok(integrationQueryService.listEmployees(ids));
    }

    @Inner(allowedServices = {CRM_SERVICE, OA_SERVICE, WORKFLOW_SERVICE})
    @GetMapping("/employees/by-users")
    public R<List<HrEmployeeSummaryVO>> listEmployeesByUserIds(@RequestParam("userIds") List<Long> userIds) {
        return R.ok(integrationQueryService.listEmployeesByUserIds(userIds));
    }

    @Inner(allowedServices = {CRM_SERVICE, OA_SERVICE, WORKFLOW_SERVICE})
    @GetMapping("/depts")
    public R<List<HrDeptSummaryVO>> listDepartments(@RequestParam(value = "ids", required = false) List<Long> ids) {
        return R.ok(integrationQueryService.listDepartments(ids));
    }
}
