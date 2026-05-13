package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.CrmPerformanceClient;
import com.cloudflow.hr.client.vo.CrmPerformanceSummaryVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * HR 绩效看板的"销售业绩"区块：代理 CRM 侧 /inner/crm/performance/**。
 * 网关挂到 /hr/performance/crm/*，前端可直接调。
 */
@Slf4j
@RestController
@RequestMapping("/performance/crm")
@RequiredArgsConstructor
@SaCheckLogin
public class HrCrmPerformanceController {

    private final CrmPerformanceClient crmPerformanceClient;

    @GetMapping("/owners")
    public R<List<CrmPerformanceSummaryVO>> summarizeByOwner(
            @RequestParam(value = "ownerIds", required = false) List<Long> ownerIds,
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate) {
        return crmPerformanceClient.summarizeByOwner(ownerIds, startDate, endDate);
    }

    @GetMapping("/depts")
    public R<List<CrmPerformanceSummaryVO>> summarizeByDept(
            @RequestParam(value = "deptIds", required = false) List<Long> deptIds,
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate) {
        return crmPerformanceClient.summarizeByDept(deptIds, startDate, endDate);
    }

    @GetMapping("/top-owners")
    public R<List<CrmPerformanceSummaryVO>> topOwners(
            @RequestParam(value = "limit", defaultValue = "10") int limit,
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate) {
        return crmPerformanceClient.topOwners(limit, startDate, endDate);
    }

    @GetMapping("/top-depts")
    public R<List<CrmPerformanceSummaryVO>> topDepartments(
            @RequestParam(value = "limit", defaultValue = "10") int limit,
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate) {
        return crmPerformanceClient.topDepartments(limit, startDate, endDate);
    }
}
