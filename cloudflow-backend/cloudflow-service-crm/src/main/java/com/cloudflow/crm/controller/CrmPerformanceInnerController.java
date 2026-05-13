package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.crm.domain.vo.CrmPerformanceSummaryVO;
import com.cloudflow.crm.service.CrmPerformanceQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 供 HR 绩效看板内部调用的 CRM 业绩聚合接口。
 * 仅限微服务内部调用（X-Inner-Call + 白名单）。
 */
@RestController
@RequestMapping("/inner/crm/performance")
@RequiredArgsConstructor
public class CrmPerformanceInnerController {

    private static final String HR_SERVICE = "cloudflow-service-hr";

    private final CrmPerformanceQueryService performanceQueryService;

    @Inner(allowedServices = HR_SERVICE)
    @GetMapping("/owners")
    public R<List<CrmPerformanceSummaryVO>> summarizeByOwner(
            @RequestParam(value = "ownerIds", required = false) List<Long> ownerIds,
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate) {
        return R.ok(performanceQueryService.summarizeByOwner(ownerIds, startDate, endDate));
    }

    @Inner(allowedServices = HR_SERVICE)
    @GetMapping("/depts")
    public R<List<CrmPerformanceSummaryVO>> summarizeByDept(
            @RequestParam(value = "deptIds", required = false) List<Long> deptIds,
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate) {
        return R.ok(performanceQueryService.summarizeByDept(deptIds, startDate, endDate));
    }

    @Inner(allowedServices = HR_SERVICE)
    @GetMapping("/top-owners")
    public R<List<CrmPerformanceSummaryVO>> topOwners(
            @RequestParam(value = "limit", defaultValue = "10") int limit,
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate) {
        return R.ok(performanceQueryService.topOwners(limit, startDate, endDate));
    }

    @Inner(allowedServices = HR_SERVICE)
    @GetMapping("/top-depts")
    public R<List<CrmPerformanceSummaryVO>> topDepartments(
            @RequestParam(value = "limit", defaultValue = "10") int limit,
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate) {
        return R.ok(performanceQueryService.topDepartments(limit, startDate, endDate));
    }
}
