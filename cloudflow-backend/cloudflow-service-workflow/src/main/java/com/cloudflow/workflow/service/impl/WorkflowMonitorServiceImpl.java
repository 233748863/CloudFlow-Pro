package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.workflow.domain.monitor.*;
import com.cloudflow.workflow.mapper.*;
import com.cloudflow.workflow.service.WorkflowMonitorService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 工作流监控服务实现
 * Phase 2 新增功能
 *
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WorkflowMonitorServiceImpl implements WorkflowMonitorService {

    private final ProcessMonitorMapper processMonitorMapper;
    private final TimeoutAlertMapper timeoutAlertMapper;
    private final AnomalyAlertMapper anomalyAlertMapper;
    private final PerformanceStatsMapper performanceStatsMapper;

    @Override
    public MonitorOverview getMonitorOverview() {
        log.info("获取监控概览数据");
        
        // 从当前登录用户获取租户ID
        Long tenantId = SecurityUtils.getTenantId();
        if (tenantId == null) {
            tenantId = 100000L; // 降级使用默认租户ID
        }
        
        MonitorOverview overview = new MonitorOverview();
        LocalDateTime todayStart = LocalDateTime.now().withHour(0).withMinute(0).withSecond(0);
        
        // 今日统计
        overview.setTodayStarted(processMonitorMapper.countByDateAndStatus(todayStart, null, tenantId));
        overview.setTodayCompleted(processMonitorMapper.countByDateAndStatus(todayStart, "COMPLETED", tenantId));
        overview.setTodayTimeout(timeoutAlertMapper.countByDate(todayStart));
        overview.setTodayAnomaly(anomalyAlertMapper.countByDate(todayStart));
        
        // 当前状态
        overview.setRunningCount(processMonitorMapper.countByStatus("RUNNING", tenantId));
        overview.setPendingTaskCount(processMonitorMapper.countPendingTasks());
        
        // 告警统计
        overview.setWarningAlertCount(timeoutAlertMapper.countByLevel("WARNING"));
        overview.setCriticalAlertCount(timeoutAlertMapper.countByLevel("CRITICAL"));
        overview.setUnresolvedAnomalyCount(anomalyAlertMapper.countUnresolved());
        
        // 性能指标
        overview.setAvgCompletionTimeMs(processMonitorMapper.getAvgCompletionTime(tenantId));
        overview.setSuccessRate(processMonitorMapper.getSuccessRate(tenantId));
        
        return overview;
    }

    @Override
    public List<ProcessTrend> getProcessTrend(Integer days, String processDefKey) {
        log.info("获取流程趋势数据: days={}, processDefKey={}", days, processDefKey);
        
        // 从当前登录用户获取租户ID
        Long tenantId = SecurityUtils.getTenantId();
        if (tenantId == null) {
            tenantId = 100000L; // 降级使用默认租户ID
        }
        
        LocalDateTime startDate = LocalDateTime.now().minusDays(days);
        return processMonitorMapper.getProcessTrend(startDate, processDefKey, tenantId);
    }

    @Override
    public PageResult<ProcessMonitor> getProcessMonitors(String processDefKey, String status,
                                             String startTimeFrom, String startTimeTo,
                                             Integer pageNum, Integer pageSize) {
        log.info("获取流程监控列表: processDefKey={}, status={}", processDefKey, status);
        
        Page<ProcessMonitor> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<ProcessMonitor> wrapper = new LambdaQueryWrapper<>();
        
        if (StringUtils.hasText(processDefKey)) {
            wrapper.eq(ProcessMonitor::getProcessDefKey, processDefKey);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(ProcessMonitor::getStatus, status);
        }
        if (StringUtils.hasText(startTimeFrom)) {
            wrapper.ge(ProcessMonitor::getStartTime, startTimeFrom);
        }
        if (StringUtils.hasText(startTimeTo)) {
            wrapper.le(ProcessMonitor::getStartTime, startTimeTo);
        }
        
        wrapper.orderByDesc(ProcessMonitor::getStartTime);
        Page<ProcessMonitor> resultPage = processMonitorMapper.selectPage(page, wrapper);
        
        return new PageResult<>(resultPage.getRecords(), resultPage.getTotal(), 
                               resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    public ProcessMonitor getProcessMonitor(String instanceId) {
        log.info("获取流程监控详情: instanceId={}", instanceId);
        return processMonitorMapper.selectByInstanceId(instanceId);
    }

    @Override
    public PageResult<TimeoutAlert> getTimeoutAlerts(String alertType, String alertLevel,
                                         Boolean resolved, Integer pageNum, Integer pageSize) {
        log.info("获取超时告警列表: alertType={}, alertLevel={}, resolved={}", 
                alertType, alertLevel, resolved);
        
        Page<TimeoutAlert> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<TimeoutAlert> wrapper = new LambdaQueryWrapper<>();
        
        if (StringUtils.hasText(alertType)) {
            wrapper.eq(TimeoutAlert::getAlertType, alertType);
        }
        if (StringUtils.hasText(alertLevel)) {
            wrapper.eq(TimeoutAlert::getTimeoutLevel, alertLevel);
        }
        if (resolved != null) {
            wrapper.eq(TimeoutAlert::getResolved, resolved ? "Y" : "N");
        }
        
        wrapper.orderByDesc(TimeoutAlert::getAlertTime);
        Page<TimeoutAlert> resultPage = timeoutAlertMapper.selectPage(page, wrapper);
        
        return new PageResult<>(resultPage.getRecords(), resultPage.getTotal(), 
                               resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    @Transactional
    public void handleTimeoutAlert(Long alertId, String action) {
        log.info("处理超时告警: alertId={}, action={}", alertId, action);
        
        TimeoutAlert alert = timeoutAlertMapper.selectById(alertId);
        if (alert == null) {
            throw new RuntimeException("告警不存在");
        }
        
        if ("notify".equals(action)) {
            // 发送通知
            alert.setNotificationSent("Y");
            timeoutAlertMapper.updateById(alert);
            log.info("已发送超时告警通知: alertId={}", alertId);
        } else if ("escalate".equals(action)) {
            // 升级处理
            alert.setEscalated("Y");
            timeoutAlertMapper.updateById(alert);
            log.info("已升级超时告警: alertId={}", alertId);
        }
    }

    @Override
    public PageResult<AnomalyAlert> getAnomalyAlerts(String anomalyType, String severity,
                                         Boolean resolved, Integer pageNum, Integer pageSize) {
        log.info("获取异常告警列表: anomalyType={}, severity={}, resolved={}", 
                anomalyType, severity, resolved);
        
        Page<AnomalyAlert> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<AnomalyAlert> wrapper = new LambdaQueryWrapper<>();
        
        if (StringUtils.hasText(anomalyType)) {
            wrapper.eq(AnomalyAlert::getAnomalyType, anomalyType);
        }
        if (StringUtils.hasText(severity)) {
            wrapper.eq(AnomalyAlert::getSeverity, severity);
        }
        if (resolved != null) {
            applyAnomalyResolvedFilter(wrapper, resolved);
        }
        
        wrapper.orderByDesc(AnomalyAlert::getAlertTime);
        Page<AnomalyAlert> resultPage = anomalyAlertMapper.selectPage(page, wrapper);
        
        return new PageResult<>(resultPage.getRecords(), resultPage.getTotal(), 
                               resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    @Transactional
    public void resolveAnomalyAlert(Long alertId, String resolveNote) {
        log.info("解决异常告警: alertId={}, resolveNote={}", alertId, resolveNote);
        
        AnomalyAlert alert = anomalyAlertMapper.selectById(alertId);
        if (alert == null) {
            throw new RuntimeException("告警不存在");
        }
        
        alert.setResolved("Y");
        alert.setResolveNote(resolveNote);
        alert.setResolveTime(LocalDateTime.now());
        alert.setUpdateTime(LocalDateTime.now());
        anomalyAlertMapper.updateById(alert);
        
        log.info("异常告警已解决: alertId={}", alertId);
    }

    @Override
    public List<PerformanceStats> getPerformanceStats(LocalDate startDate, LocalDate endDate, 
                                                      String processDefKey) {
        log.info("获取性能统计数据: startDate={}, endDate={}, processDefKey={}", 
                startDate, endDate, processDefKey);
        
        return performanceStatsMapper.selectPerformanceStats(startDate, endDate, processDefKey);
    }

    /**
     * 兼容异常告警历史数据。
     * 旧数据里 resolved 可能是 0/1，新数据会统一写为 Y/N。
     */
    private void applyAnomalyResolvedFilter(LambdaQueryWrapper<AnomalyAlert> wrapper, boolean resolved) {
        if (resolved) {
            wrapper.eq(AnomalyAlert::getResolved, "Y");
            return;
        }

        wrapper.eq(AnomalyAlert::getResolved, "N");
    }
}
