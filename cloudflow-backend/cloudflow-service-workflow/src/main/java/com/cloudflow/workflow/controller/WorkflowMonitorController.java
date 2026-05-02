package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.workflow.domain.monitor.*;
import com.cloudflow.workflow.service.WorkflowMonitorService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * 工作流监控告警 Controller
 * Phase 2 新增功能 - 提供监控大屏、告警管理、性能统计API
 *
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@Tag(name = "工作流监控", description = "工作流监控告警相关接口")
@RestController
@RequestMapping("/monitor")
@RequiredArgsConstructor
public class WorkflowMonitorController {

    private final WorkflowMonitorService monitorService;

    // ==================== 监控概览 ====================

    /**
     * 获取监控概览数据
     * 用于监控大屏首页展示
     */
    @Operation(summary = "获取监控概览", description = "获取今日统计、当前状态、告警统计、性能指标")
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    @GetMapping("/overview")
    public R<MonitorOverview> getMonitorOverview() {
        MonitorOverview overview = monitorService.getMonitorOverview();
        return R.ok(overview);
    }

    /**
     * 获取流程趋势数据
     * 用于监控大屏图表展示
     */
    @Operation(summary = "获取流程趋势", description = "获取最近N天的流程启动、完成、超时、异常趋势")
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    @GetMapping("/trend")
    public R<List<ProcessTrend>> getProcessTrend(
            @RequestParam(defaultValue = "7") Integer days,
            @RequestParam(required = false) String processDefKey) {
        List<ProcessTrend> trend = monitorService.getProcessTrend(days, processDefKey);
        return R.ok(trend);
    }

    // ==================== 流程监控 ====================

    /**
     * 获取流程监控列表
     * 分页查询流程执行监控记录
     */
    @Operation(summary = "获取流程监控列表", description = "分页查询流程执行监控记录")
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    @GetMapping("/process/list")
    public R<PageResult<ProcessMonitor>> getProcessMonitors(
            @RequestParam(required = false) String processDefKey,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") String startTimeFrom,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") String startTimeTo,
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize) {
        
        return R.ok(monitorService.getProcessMonitors(
                processDefKey, status, startTimeFrom, startTimeTo, pageNum, pageSize));
    }

    /**
     * 获取流程监控详情
     */
    @Operation(summary = "获取流程监控详情", description = "根据流程实例ID获取详细监控信息")
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    @GetMapping("/process/{instanceId}")
    public R<ProcessMonitor> getProcessMonitor(@PathVariable String instanceId) {
        ProcessMonitor monitor = monitorService.getProcessMonitor(instanceId);
        return R.ok(monitor);
    }

    // ==================== 超时告警 ====================

    /**
     * 获取超时告警列表
     */
    @Operation(summary = "获取超时告警列表", description = "分页查询超时告警记录")
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    @GetMapping("/timeout/list")
    public R<PageResult<TimeoutAlert>> getTimeoutAlerts(
            @RequestParam(required = false) String alertType,
            @RequestParam(required = false) String alertLevel,
            @RequestParam(required = false) Boolean resolved,
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize) {
        
        return R.ok(monitorService.getTimeoutAlerts(
                alertType, alertLevel, resolved, pageNum, pageSize));
    }

    /**
     * 处理超时告警
     */
    @Operation(summary = "处理超时告警", description = "发送通知或升级处理超时告警")
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    @PostMapping("/timeout/{alertId}/handle")
    public R<TimeoutAlertHandleResult> handleTimeoutAlert(
            @PathVariable Long alertId,
            @RequestBody HandleAlertRequest request) {
        return R.ok(monitorService.handleTimeoutAlert(alertId, request.getAction()));
    }

    /**
     * 获取我的超时告警升级待办
     */
    @Operation(summary = "获取超时告警升级待办", description = "查询当前用户需要处置的超时告警升级记录")
    @SaCheckLogin
    @GetMapping("/timeout/escalation-tasks")
    public R<PageResult<TimeoutAlert>> getTimeoutEscalationTasks(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(monitorService.getTimeoutEscalationTasks(pageNum, pageSize));
    }

    /**
     * 解决超时告警
     */
    @Operation(summary = "解决超时告警", description = "升级接收人或管理员填写处置说明并关闭超时告警")
    @SaCheckLogin
    @PostMapping("/timeout/{alertId}/resolve")
    public R<TimeoutAlert> resolveTimeoutAlert(
            @PathVariable Long alertId,
            @RequestBody ResolveAlertRequest request) {
        return R.ok(monitorService.resolveTimeoutAlert(alertId, request.getResolveNote()));
    }

    // ==================== 异常告警 ====================

    /**
     * 获取异常告警列表
     */
    @Operation(summary = "获取异常告警列表", description = "分页查询异常告警记录")
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    @GetMapping("/anomaly/list")
    public R<PageResult<AnomalyAlert>> getAnomalyAlerts(
            @RequestParam(required = false) String anomalyType,
            @RequestParam(required = false) String severity,
            @RequestParam(required = false) Boolean resolved,
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize) {
        
        return R.ok(monitorService.getAnomalyAlerts(
                anomalyType, severity, resolved, pageNum, pageSize));
    }

    /**
     * 解决异常告警
     */
    @Operation(summary = "解决异常告警", description = "标记异常告警为已解决并添加解决说明")
    @SaCheckRole("admin")
    @PostMapping("/anomaly/{alertId}/resolve")
    public R<?> resolveAnomalyAlert(
            @PathVariable Long alertId,
            @RequestBody ResolveAlertRequest request) {
        monitorService.resolveAnomalyAlert(alertId, request.getResolveNote());
        return R.ok("解决成功");
    }

    // ==================== 性能统计 ====================

    /**
     * 获取性能统计数据
     */
    @Operation(summary = "获取性能统计", description = "获取指定时间范围内的流程性能统计数据")
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    @GetMapping("/performance/stats")
    public R<List<PerformanceStats>> getPerformanceStats(
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate endDate,
            @RequestParam(required = false) String processDefKey) {
        
        List<PerformanceStats> stats = monitorService.getPerformanceStats(
                startDate, endDate, processDefKey);
        return R.ok(stats);
    }

    // ==================== 请求对象 ====================

    /**
     * 处理告警请求
     */
    @lombok.Data
    public static class HandleAlertRequest {
        private String action; // notify, escalate
    }

    /**
     * 解决告警请求
     */
    @lombok.Data
    public static class ResolveAlertRequest {
        private String resolveNote;
    }
}
