package com.cloudflow.hr.client;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.fallback.CrmPerformanceClientFallback;
import com.cloudflow.hr.client.vo.CrmPerformanceSummaryVO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

/**
 * HR 调 CRM 的业绩聚合接口，用于绩效看板展示销售维度数据。
 */
@FeignClient(
        name = "cloudflow-service-crm",
        contextId = "crmPerformanceClient",
        fallback = CrmPerformanceClientFallback.class
)
public interface CrmPerformanceClient {

    @GetMapping("/inner/crm/performance/owners")
    R<List<CrmPerformanceSummaryVO>> summarizeByOwner(
            @RequestParam(value = "ownerIds", required = false) List<Long> ownerIds,
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate);

    @GetMapping("/inner/crm/performance/depts")
    R<List<CrmPerformanceSummaryVO>> summarizeByDept(
            @RequestParam(value = "deptIds", required = false) List<Long> deptIds,
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate);

    @GetMapping("/inner/crm/performance/top-owners")
    R<List<CrmPerformanceSummaryVO>> topOwners(
            @RequestParam(value = "limit", defaultValue = "10") int limit,
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate);

    @GetMapping("/inner/crm/performance/top-depts")
    R<List<CrmPerformanceSummaryVO>> topDepartments(
            @RequestParam(value = "limit", defaultValue = "10") int limit,
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate);
}
