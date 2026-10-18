package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.service.report.ReportQueryService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.report.ReportQuery;
import com.cloudflow.common.core.report.ReportResult;
import com.cloudflow.common.core.report.ReportValidation;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/system/report/dataset")
@RequiredArgsConstructor
public class ReportQueryController {
    private final ReportQueryService service;
    private final ObjectMapper objectMapper;

    @PostMapping("/WF_INSTANCE/query")
    @SaCheckPermission("system:report:data:workflow-instance")
    @RateLimiter(key = "report-query", time = 60, count = 30, limitType = LimitType.USER)
    public R<ReportResult> workflowInstances(@RequestBody JsonNode input) { return query("WF_INSTANCE", input); }

    @PostMapping("/WF_TASK/query")
    @SaCheckPermission("system:report:data:workflow-task")
    @RateLimiter(key = "report-query", time = 60, count = 30, limitType = LimitType.USER)
    public R<ReportResult> workflowTasks(@RequestBody JsonNode input) { return query("WF_TASK", input); }

    @PostMapping("/CRM_FUNNEL/query")
    @SaCheckPermission("system:report:data:crm-funnel")
    @RateLimiter(key = "report-query", time = 60, count = 30, limitType = LimitType.USER)
    public R<ReportResult> crmFunnel(@RequestBody JsonNode input) { return query("CRM_FUNNEL", input); }

    @PostMapping("/CRM_AGING/query")
    @SaCheckPermission("system:report:data:crm-aging")
    @RateLimiter(key = "report-query", time = 60, count = 30, limitType = LimitType.USER)
    public R<ReportResult> crmAging(@RequestBody JsonNode input) { return query("CRM_AGING", input); }

    @PostMapping("/HR_ATTENDANCE/query")
    @SaCheckPermission("system:report:data:hr-attendance")
    @RateLimiter(key = "report-query", time = 60, count = 30, limitType = LimitType.USER)
    public R<ReportResult> hrAttendance(@RequestBody JsonNode input) { return query("HR_ATTENDANCE", input); }

    @PostMapping("/HR_LEAVE/query")
    @SaCheckPermission("system:report:data:hr-leave")
    @RateLimiter(key = "report-query", time = 60, count = 30, limitType = LimitType.USER)
    public R<ReportResult> hrLeave(@RequestBody JsonNode input) { return query("HR_LEAVE", input); }

    @PostMapping("/OA_EXPENSE/query")
    @SaCheckPermission("system:report:data:oa-expense")
    @RateLimiter(key = "report-query", time = 60, count = 30, limitType = LimitType.USER)
    public R<ReportResult> oaExpense(@RequestBody JsonNode input) { return query("OA_EXPENSE", input); }

    @PostMapping("/OA_BUDGET/query")
    @SaCheckPermission("system:report:data:oa-budget")
    @RateLimiter(key = "report-query", time = 60, count = 30, limitType = LimitType.USER)
    public R<ReportResult> oaBudget(@RequestBody JsonNode input) { return query("OA_BUDGET", input); }

    @PostMapping("/OA_ASSET/query")
    @SaCheckPermission("system:report:data:oa-asset")
    @RateLimiter(key = "report-query", time = 60, count = 30, limitType = LimitType.USER)
    public R<ReportResult> oaAssets(@RequestBody JsonNode input) { return query("OA_ASSET", input); }

    @PostMapping("/{code}/query")
    @SaCheckPermission("system:report:dataset:list")
    @RateLimiter(key = "report-query", time = 60, count = 30, limitType = LimitType.USER)
    public R<ReportResult> unsupportedDataset() { throw new ServiceException("报表数据集未注册", 404); }

    private R<ReportResult> query(String code, JsonNode input) {
        return R.ok(service.query(code, ReportValidation.read(objectMapper, input, ReportQuery.class)));
    }
}
