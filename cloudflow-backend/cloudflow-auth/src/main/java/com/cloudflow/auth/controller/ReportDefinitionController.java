package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.report.ReportDefinitionInput;
import com.cloudflow.auth.domain.report.ReportDefinitionView;
import com.cloudflow.auth.service.report.ReportDatasetService;
import com.cloudflow.auth.service.report.ReportDefinitionService;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.report.ReportValidation;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/system/report")
@RequiredArgsConstructor
public class ReportDefinitionController {
    private final ReportDefinitionService definitions;
    private final ReportDatasetService datasets;
    private final ObjectMapper objectMapper;

    @GetMapping("/dataset/list")
    @SaCheckPermission("system:report:dataset:list")
    public R<List<ReportDefinitionView.Dataset>> datasets() { return R.ok(datasets.list()); }

    @GetMapping("/chart/list")
    @SaCheckPermission("system:report:chart:list")
    public R<PageResult<ReportDefinitionView.Chart>> charts(@RequestParam(defaultValue = "1") int pageNum, @RequestParam(defaultValue = "20") int pageSize) {
        return R.ok(definitions.chartList(pageNum, pageSize));
    }

    @GetMapping("/chart/{id}")
    @SaCheckPermission("system:report:chart:list")
    public R<ReportDefinitionView.Chart> chart(@PathVariable String id) { return R.ok(definitions.chart(id)); }

    @PostMapping("/chart")
    @SaCheckPermission("system:report:chart:save")
    @RepeatSubmit
    @SysLog("创建本人图表")
    public R<Long> createChart(@RequestBody JsonNode input) {
        ReportDefinitionInput.Chart chart = ReportValidation.read(objectMapper, input, ReportDefinitionInput.Chart.class);
        if (chart.chartId() != null) throw ReportValidation.invalid("创建图表不能指定已有编号");
        return R.ok(definitions.saveChart(chart));
    }

    @PutMapping("/chart")
    @SaCheckPermission("system:report:chart:save")
    @RepeatSubmit
    @SysLog("修改本人图表")
    public R<Long> updateChart(@RequestBody JsonNode input) {
        ReportDefinitionInput.Chart chart = ReportValidation.read(objectMapper, input, ReportDefinitionInput.Chart.class);
        if (chart.chartId() == null) throw ReportValidation.invalid("修改图表须指定编号和版本");
        return R.ok(definitions.saveChart(chart));
    }

    @DeleteMapping("/chart/{id}")
    @SaCheckPermission("system:report:chart:remove")
    @SysLog("删除本人图表")
    public R<Void> removeChart(@PathVariable String id, @RequestParam Integer version) { definitions.removeChart(id, version); return R.ok(); }

    @GetMapping("/dashboard/list")
    @SaCheckPermission("system:report:dashboard:list")
    public R<PageResult<ReportDefinitionView.Dashboard>> dashboards(@RequestParam(defaultValue = "1") int pageNum, @RequestParam(defaultValue = "20") int pageSize) {
        return R.ok(definitions.dashboardList(pageNum, pageSize));
    }

    @GetMapping("/dashboard/{id}")
    @SaCheckPermission("system:report:dashboard:list")
    public R<ReportDefinitionView.Dashboard> dashboard(@PathVariable String id) { return R.ok(definitions.dashboard(id)); }

    @PostMapping("/dashboard")
    @SaCheckPermission("system:report:dashboard:save")
    @RepeatSubmit
    @SysLog("创建本人仪表盘")
    public R<Long> createDashboard(@RequestBody JsonNode input) {
        ReportDefinitionInput.Dashboard dashboard = ReportValidation.read(objectMapper, input, ReportDefinitionInput.Dashboard.class);
        if (dashboard.dashboardId() != null) throw ReportValidation.invalid("创建仪表盘不能指定已有编号");
        return R.ok(definitions.saveDashboard(dashboard));
    }

    @PutMapping("/dashboard")
    @SaCheckPermission("system:report:dashboard:save")
    @RepeatSubmit
    @SysLog("修改本人仪表盘")
    public R<Long> updateDashboard(@RequestBody JsonNode input) {
        ReportDefinitionInput.Dashboard dashboard = ReportValidation.read(objectMapper, input, ReportDefinitionInput.Dashboard.class);
        if (dashboard.dashboardId() == null) throw ReportValidation.invalid("修改仪表盘须指定编号和版本");
        return R.ok(definitions.saveDashboard(dashboard));
    }

    @DeleteMapping("/dashboard/{id}")
    @SaCheckPermission("system:report:dashboard:remove")
    @SysLog("删除本人仪表盘")
    public R<Void> removeDashboard(@PathVariable String id, @RequestParam Integer version) { definitions.removeDashboard(id, version); return R.ok(); }

    @PostMapping("/share")
    @SaCheckPermission("system:report:share")
    @RepeatSubmit
    @SysLog("调整本人报表定义共享")
    public R<Void> share(@RequestBody JsonNode input) {
        definitions.share(ReportValidation.read(objectMapper, input, ReportDefinitionInput.Share.class)); return R.ok();
    }
}
