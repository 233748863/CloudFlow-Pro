package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.monitor.ProcessMonitor;
import com.cloudflow.workflow.service.monitor.IProcessMonitorService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 流程监控Controller
 *
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@RestController
@RequestMapping("/workflow/monitor")
@RequiredArgsConstructor
public class MonitorController {

    private final IProcessMonitorService processMonitorService;

    /**
     * 根据实例ID查询监控信息
     */
    @GetMapping("/process/{instanceId}")
    public R<ProcessMonitor> getByInstanceId(@PathVariable String instanceId) {
        ProcessMonitor monitor = processMonitorService.getByInstanceId(instanceId);
        return R.ok(monitor);
    }

    /**
     * 查询运行中的流程
     */
    @GetMapping("/process/running")
    public R<List<ProcessMonitor>> getRunningProcesses() {
        List<ProcessMonitor> processes = processMonitorService.getRunningProcesses();
        return R.ok(processes);
    }

    /**
     * 按时间范围查询流程
     */
    @GetMapping("/process/timeRange")
    public R<List<ProcessMonitor>> getProcessesByTimeRange(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startTime,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endTime) {
        List<ProcessMonitor> processes = processMonitorService.getProcessesByTimeRange(startTime, endTime);
        return R.ok(processes);
    }

    /**
     * 按流程定义Key查询
     */
    @GetMapping("/process/byDefKey")
    public R<List<ProcessMonitor>> getProcessesByDefKey(
            @RequestParam String processDefKey,
            @RequestParam(defaultValue = "100") Integer limit) {
        List<ProcessMonitor> processes = processMonitorService.getProcessesByDefKey(processDefKey, limit);
        return R.ok(processes);
    }

    /**
     * 查询流程统计信息
     */
    @GetMapping("/process/statistics")
    public R<ProcessMonitor> getStatistics(
            @RequestParam String processDefKey,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startTime,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endTime) {
        ProcessMonitor statistics = processMonitorService.getStatistics(processDefKey, startTime, endTime);
        return R.ok(statistics);
    }

    /**
     * 清理过期监控数据
     */
    @DeleteMapping("/process/cleanup")
    public R<Integer> cleanExpiredData(@RequestParam(defaultValue = "90") Integer retentionDays) {
        int count = processMonitorService.cleanExpiredData(retentionDays);
        return R.ok(count);
    }
}
