package com.cloudflow.workflow.service.monitor.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.workflow.domain.monitor.ProcessMonitor;
import com.cloudflow.workflow.mapper.ProcessMonitorMapper;
import com.cloudflow.workflow.service.monitor.IProcessMonitorService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * 流程执行监控服务实现
 *
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProcessMonitorServiceImpl implements IProcessMonitorService {

    private final ProcessMonitorMapper processMonitorMapper;
    private final PerformanceStatsRefreshService performanceStatsRefreshService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void recordProcessStart(String instanceId, String processDefId, String processDefKey,
                                    String processDefName, String businessKey,
                                    Long startUserId, String startUserName) {
        try {
            ProcessMonitor monitor = new ProcessMonitor();
            monitor.setTenantId(SecurityUtils.getTenantId());
            monitor.setInstanceId(instanceId);
            monitor.setProcessDefId(processDefId);
            monitor.setProcessDefKey(processDefKey);
            monitor.setProcessDefName(processDefName);
            monitor.setBusinessKey(businessKey);
            monitor.setStartTime(LocalDateTime.now());
            monitor.setStatus("RUNNING");
            monitor.setNodeCount(0);
            monitor.setTaskCount(0);
            monitor.setStartUserId(startUserId);
            monitor.setStartUserName(startUserName);
            monitor.setCreateTime(LocalDateTime.now());
            monitor.setUpdateTime(LocalDateTime.now());

            processMonitorMapper.insert(monitor);
            performanceStatsRefreshService.refreshForProcess(monitor);
            log.info("记录流程启动监控: instanceId={}, processDefKey={}", instanceId, processDefKey);
        } catch (Exception e) {
            log.error("记录流程启动监控失败: instanceId={}", instanceId, e);
            throw e;
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void recordProcessEnd(String instanceId, String status, String errorMessage) {
        try {
            ProcessMonitor monitor = processMonitorMapper.selectByInstanceId(instanceId);
            if (monitor == null) {
                log.warn("流程监控记录不存在: instanceId={}", instanceId);
                return;
            }

            LocalDateTime endTime = LocalDateTime.now();
            monitor.setEndTime(endTime);
            monitor.setDuration(ChronoUnit.MILLIS.between(monitor.getStartTime(), endTime));
            monitor.setStatus(status);
            monitor.setErrorMessage(errorMessage);
            monitor.setUpdateTime(LocalDateTime.now());

            processMonitorMapper.updateById(monitor);
            log.info("记录流程结束监控: instanceId={}, status={}, duration={}ms",
                    instanceId, status, monitor.getDuration());

            performanceStatsRefreshService.refreshForProcess(monitor);
        } catch (Exception e) {
            log.error("记录流程结束监控失败: instanceId={}", instanceId, e);
            throw e;
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void incrementNodeCount(String instanceId) {
        try {
            ProcessMonitor monitor = processMonitorMapper.selectByInstanceId(instanceId);
            if (monitor == null) {
                log.warn("流程监控记录不存在: instanceId={}", instanceId);
                return;
            }

            monitor.setNodeCount(monitor.getNodeCount() + 1);
            monitor.setUpdateTime(LocalDateTime.now());
            processMonitorMapper.updateById(monitor);
            log.debug("递增流程节点数量: instanceId={}, nodeCount={}", instanceId, monitor.getNodeCount());
        } catch (Exception e) {
            log.error("递增流程节点数量失败: instanceId={}", instanceId, e);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void incrementTaskCount(String instanceId) {
        try {
            ProcessMonitor monitor = processMonitorMapper.selectByInstanceId(instanceId);
            if (monitor == null) {
                log.warn("流程监控记录不存在: instanceId={}", instanceId);
                return;
            }

            monitor.setTaskCount(monitor.getTaskCount() + 1);
            monitor.setUpdateTime(LocalDateTime.now());
            processMonitorMapper.updateById(monitor);
            log.debug("递增流程任务数量: instanceId={}, taskCount={}", instanceId, monitor.getTaskCount());
        } catch (Exception e) {
            log.error("递增流程任务数量失败: instanceId={}", instanceId, e);
        }
    }

    @Override
    public ProcessMonitor getByInstanceId(String instanceId) {
        return processMonitorMapper.selectByInstanceId(instanceId);
    }

    @Override
    public List<ProcessMonitor> getRunningProcesses() {
        return processMonitorMapper.selectRunningProcesses(SecurityUtils.getTenantId());
    }

    @Override
    public List<ProcessMonitor> getProcessesByTimeRange(LocalDateTime startTime, LocalDateTime endTime) {
        return processMonitorMapper.selectByTimeRange(SecurityUtils.getTenantId(), startTime, endTime);
    }

    @Override
    public List<ProcessMonitor> getProcessesByDefKey(String processDefKey, Integer limit) {
        return processMonitorMapper.selectByProcessDefKey(SecurityUtils.getTenantId(), processDefKey, limit);
    }

    @Override
    public com.cloudflow.workflow.domain.vo.ProcessStatisticsVO getStatistics(String processDefKey, LocalDateTime startTime, LocalDateTime endTime) {
        java.util.Map<String, Object> data = processMonitorMapper.selectStatistics(SecurityUtils.getTenantId(), processDefKey, startTime, endTime);
        
        com.cloudflow.workflow.domain.vo.ProcessStatisticsVO vo = new com.cloudflow.workflow.domain.vo.ProcessStatisticsVO();
        vo.setTotalCount(data.get("totalCount") != null ? ((Number) data.get("totalCount")).longValue() : 0L);
        vo.setCompletedCount(data.get("completedCount") != null ? ((Number) data.get("completedCount")).longValue() : 0L);
        vo.setRunningCount(data.get("runningCount") != null ? ((Number) data.get("runningCount")).longValue() : 0L);
        vo.setFailedCount(data.get("failedCount") != null ? ((Number) data.get("failedCount")).longValue() : 0L);
        vo.setAvgDuration(data.get("avgDuration") != null ? ((Number) data.get("avgDuration")).longValue() : 0L);
        vo.setMaxDuration(data.get("maxDuration") != null ? ((Number) data.get("maxDuration")).longValue() : 0L);
        vo.setMinDuration(data.get("minDuration") != null ? ((Number) data.get("minDuration")).longValue() : 0L);
        
        // 计算成功率
        if (vo.getTotalCount() > 0) {
            vo.setSuccessRate(vo.getCompletedCount() * 100.0 / vo.getTotalCount());
        } else {
            vo.setSuccessRate(0.0);
        }
        
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int cleanExpiredData(int retentionDays) {
        try {
            LocalDateTime expireTime = LocalDateTime.now().minusDays(retentionDays);
            LambdaQueryWrapper<ProcessMonitor> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(ProcessMonitor::getTenantId, SecurityUtils.getTenantId())
                    .lt(ProcessMonitor::getCreateTime, expireTime);

            int count = processMonitorMapper.delete(wrapper);
            log.info("清理过期流程监控数据: retentionDays={}, count={}", retentionDays, count);
            return count;
        } catch (Exception e) {
            log.error("清理过期流程监控数据失败", e);
            throw e;
        }
    }

}
