package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.monitor.AnomalyAlert;
import com.cloudflow.workflow.domain.monitor.TimeoutAlert;
import com.cloudflow.workflow.mapper.AnomalyAlertMapper;
import com.cloudflow.workflow.mapper.TimeoutAlertMapper;
import com.cloudflow.workflow.service.monitor.IAnomalyDetectionService;
import com.cloudflow.workflow.service.monitor.ITimeoutDetectionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 告警管理Controller
 *
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@RestController
@RequestMapping("/workflow/alert")
@RequiredArgsConstructor
public class AlertController {

    private final TimeoutAlertMapper timeoutAlertMapper;
    private final AnomalyAlertMapper anomalyAlertMapper;
    private final ITimeoutDetectionService timeoutDetectionService;
    private final IAnomalyDetectionService anomalyDetectionService;

    /**
     * 查询未解决的超时告警
     */
    @GetMapping("/timeout/unresolved")
    public R<List<TimeoutAlert>> getUnresolvedTimeoutAlerts() {
        List<TimeoutAlert> alerts = timeoutAlertMapper.selectUnresolved(
            com.cloudflow.common.core.utils.SecurityUtils.getTenantId()
        );
        return R.ok(alerts);
    }

    /**
     * 按级别查询超时告警
     */
    @GetMapping("/timeout/byLevel")
    public R<List<TimeoutAlert>> getTimeoutAlertsByLevel(@RequestParam String level) {
        List<TimeoutAlert> alerts = timeoutAlertMapper.selectByLevel(
            com.cloudflow.common.core.utils.SecurityUtils.getTenantId(),
            level
        );
        return R.ok(alerts);
    }

    /**
     * 按处理人查询超时告警
     */
    @GetMapping("/timeout/byAssignee")
    public R<List<TimeoutAlert>> getTimeoutAlertsByAssignee(@RequestParam Long assigneeId) {
        List<TimeoutAlert> alerts = timeoutAlertMapper.selectByAssignee(
            com.cloudflow.common.core.utils.SecurityUtils.getTenantId(),
            assigneeId
        );
        return R.ok(alerts);
    }

    /**
     * 解决超时告警
     */
    @PutMapping("/timeout/{alertId}/resolve")
    public R<Void> resolveTimeoutAlert(
            @PathVariable Long alertId,
            @RequestParam String resolver,
            @RequestParam String solution) {
        timeoutDetectionService.resolveTimeoutAlert(alertId, resolver, solution);
        return R.ok();
    }

    /**
     * 升级超时告警
     */
    @PutMapping("/timeout/{alertId}/escalate")
    public R<Void> escalateTimeoutAlert(@PathVariable Long alertId) {
        timeoutDetectionService.escalateTimeoutAlert(alertId);
        return R.ok();
    }

    /**
     * 查询未解决的异常告警
     */
    @GetMapping("/anomaly/unresolved")
    public R<List<AnomalyAlert>> getUnresolvedAnomalyAlerts() {
        List<AnomalyAlert> alerts = anomalyAlertMapper.selectUnresolved(
            com.cloudflow.common.core.utils.SecurityUtils.getTenantId()
        );
        return R.ok(alerts);
    }

    /**
     * 按类型查询异常告警
     */
    @GetMapping("/anomaly/byType")
    public R<List<AnomalyAlert>> getAnomalyAlertsByType(@RequestParam String type) {
        List<AnomalyAlert> alerts = anomalyAlertMapper.selectByType(
            com.cloudflow.common.core.utils.SecurityUtils.getTenantId(),
            type
        );
        return R.ok(alerts);
    }

    /**
     * 按严重程度查询异常告警
     */
    @GetMapping("/anomaly/bySeverity")
    public R<List<AnomalyAlert>> getAnomalyAlertsBySeverity(@RequestParam String severity) {
        List<AnomalyAlert> alerts = anomalyAlertMapper.selectBySeverity(
            com.cloudflow.common.core.utils.SecurityUtils.getTenantId(),
            severity
        );
        return R.ok(alerts);
    }

    /**
     * 按流程定义Key查询异常告警
     */
    @GetMapping("/anomaly/byProcessDefKey")
    public R<List<AnomalyAlert>> getAnomalyAlertsByProcessDefKey(@RequestParam String processDefKey) {
        List<AnomalyAlert> alerts = anomalyAlertMapper.selectByProcessDefKey(
            com.cloudflow.common.core.utils.SecurityUtils.getTenantId(),
            processDefKey
        );
        return R.ok(alerts);
    }

    /**
     * 查询异常类型统计
     */
    @GetMapping("/anomaly/statistics")
    public R<List<AnomalyAlert>> getAnomalyTypeStatistics(
            @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE_TIME) java.time.LocalDateTime startDate,
            @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE_TIME) java.time.LocalDateTime endDate) {
        List<AnomalyAlert> statistics = anomalyAlertMapper.selectTypeStatistics(
            com.cloudflow.common.core.utils.SecurityUtils.getTenantId(),
            startDate,
            endDate
        );
        return R.ok(statistics);
    }

    /**
     * 解决异常告警
     */
    @PutMapping("/anomaly/{alertId}/resolve")
    public R<Void> resolveAnomalyAlert(
            @PathVariable Long alertId,
            @RequestParam String resolver,
            @RequestParam String solution) {
        anomalyDetectionService.resolveAnomalyAlert(alertId, resolver, solution);
        return R.ok();
    }
}
