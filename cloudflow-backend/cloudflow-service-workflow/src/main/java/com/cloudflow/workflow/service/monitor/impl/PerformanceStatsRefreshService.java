package com.cloudflow.workflow.service.monitor.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.workflow.domain.monitor.AnomalyAlert;
import com.cloudflow.workflow.domain.monitor.PerformanceStats;
import com.cloudflow.workflow.domain.monitor.ProcessMonitor;
import com.cloudflow.workflow.domain.monitor.TaskMonitor;
import com.cloudflow.workflow.domain.monitor.TimeoutAlert;
import com.cloudflow.workflow.mapper.PerformanceStatsMapper;
import com.cloudflow.workflow.mapper.ProcessMonitorMapper;
import com.cloudflow.workflow.mapper.TaskMonitorMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class PerformanceStatsRefreshService {

    private final PerformanceStatsMapper performanceStatsMapper;
    private final ProcessMonitorMapper processMonitorMapper;
    private final TaskMonitorMapper taskMonitorMapper;

    @Transactional(rollbackFor = Exception.class)
    public void refreshForProcess(ProcessMonitor processMonitor) {
        if (processMonitor == null || processMonitor.getStartTime() == null) {
            return;
        }
        refreshPerformanceStats(
                processMonitor.getTenantId(),
                processMonitor.getProcessDefKey(),
                processMonitor.getStartTime().toLocalDate()
        );
    }

    @Transactional(rollbackFor = Exception.class)
    public void refreshForInstance(Long tenantId, String instanceId) {
        if (tenantId == null || !StringUtils.hasText(instanceId)) {
            return;
        }
        ProcessMonitor processMonitor = processMonitorMapper.selectByInstanceId(instanceId, tenantId);
        refreshForProcess(processMonitor);
    }

    @Transactional(rollbackFor = Exception.class)
    public void refreshForTask(Long tenantId, String taskId) {
        if (tenantId == null || !StringUtils.hasText(taskId)) {
            return;
        }
        TaskMonitor taskMonitor = taskMonitorMapper.selectByTaskId(taskId);
        if (taskMonitor == null) {
            return;
        }
        refreshForInstance(tenantId, taskMonitor.getInstanceId());
    }

    @Transactional(rollbackFor = Exception.class)
    public void refreshForTimeoutAlert(TimeoutAlert alert) {
        if (alert == null || alert.getTenantId() == null) {
            return;
        }
        if ("TASK".equals(alert.getAlertType())) {
            refreshForTask(alert.getTenantId(), alert.getTargetId());
            return;
        }
        refreshForInstance(alert.getTenantId(), alert.getTargetId());
    }

    @Transactional(rollbackFor = Exception.class)
    public void refreshForAnomalyAlert(AnomalyAlert alert) {
        if (alert == null || alert.getTenantId() == null) {
            return;
        }
        refreshForInstance(alert.getTenantId(), alert.getInstanceId());
    }

    @Transactional(rollbackFor = Exception.class)
    public void refreshPerformanceStats(Long tenantId, String processDefKey, LocalDate statDate) {
        if (tenantId == null || !StringUtils.hasText(processDefKey) || statDate == null) {
            return;
        }

        PerformanceStats snapshot = performanceStatsMapper.selectPerformanceSnapshot(tenantId, statDate, processDefKey);
        if (snapshot == null) {
            log.debug("跳过性能统计刷新，未找到基础流程数据: tenantId={}, processDefKey={}, statDate={}",
                    tenantId, processDefKey, statDate);
            return;
        }

        LambdaQueryWrapper<PerformanceStats> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PerformanceStats::getTenantId, tenantId)
                .eq(PerformanceStats::getStatDate, statDate)
                .eq(PerformanceStats::getProcessDefKey, processDefKey);

        PerformanceStats existing = performanceStatsMapper.selectOne(wrapper);
        LocalDateTime now = LocalDateTime.now();

        if (existing == null) {
            snapshot.setCreateTime(now);
            snapshot.setUpdateTime(now);
            performanceStatsMapper.insert(snapshot);
            return;
        }

        existing.setProcessDefName(snapshot.getProcessDefName());
        existing.setTotalCount(snapshot.getTotalCount());
        existing.setCompletedCount(snapshot.getCompletedCount());
        existing.setFailedCount(snapshot.getFailedCount());
        existing.setTimeoutCount(snapshot.getTimeoutCount());
        existing.setAnomalyCount(snapshot.getAnomalyCount());
        existing.setTimeoutInstanceCount(snapshot.getTimeoutInstanceCount());
        existing.setAnomalyInstanceCount(snapshot.getAnomalyInstanceCount());
        existing.setAvgDuration(snapshot.getAvgDuration());
        existing.setMinDuration(snapshot.getMinDuration());
        existing.setMaxDuration(snapshot.getMaxDuration());
        existing.setUpdateTime(now);
        performanceStatsMapper.updateById(existing);
    }
}
