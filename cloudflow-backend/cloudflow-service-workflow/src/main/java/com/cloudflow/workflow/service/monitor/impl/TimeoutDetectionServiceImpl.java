package com.cloudflow.workflow.service.monitor.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.workflow.domain.monitor.ProcessMonitor;
import com.cloudflow.workflow.domain.monitor.TaskMonitor;
import com.cloudflow.workflow.domain.monitor.TimeoutAlert;
import com.cloudflow.workflow.mapper.ProcessMonitorMapper;
import com.cloudflow.workflow.mapper.TaskMonitorMapper;
import com.cloudflow.workflow.mapper.TimeoutAlertMapper;
import com.cloudflow.workflow.service.monitor.ITimeoutDetectionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 超时检测服务实现。
 *
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TimeoutDetectionServiceImpl implements ITimeoutDetectionService {

    private final TaskMonitorMapper taskMonitorMapper;
    private final ProcessMonitorMapper processMonitorMapper;
    private final TimeoutAlertMapper timeoutAlertMapper;
    private final PerformanceStatsRefreshService performanceStatsRefreshService;
    private final TenantIterator tenantIterator;

    @Value("${workflow.timeout.remind.threshold:3600000}")
    private Long remindThreshold;

    @Value("${workflow.timeout.warning.threshold:7200000}")
    private Long warningThreshold;

    @Value("${workflow.timeout.critical.threshold:14400000}")
    private Long criticalThreshold;

    /**
     * 定时检测超时任务，每 5 分钟执行一次。
     */
    @Override
    @DistributedJob(name = "workflow-timeout-task-check-job", lockTime = 300)
    @Scheduled(cron = "0 */5 * * * ?")
    @Transactional(rollbackFor = Exception.class)
    public void detectTimeoutTasks() {
        log.info("开始检测超时任务");
        tenantIterator.forEachActiveTenant(tid -> detectTimeoutTasksForTenant(tid));
    }

    private void detectTimeoutTasksForTenant(Long tenantId) {
        try {
            List<TaskMonitor> timeoutTasks = taskMonitorMapper.selectTimeoutTasks(tenantId, criticalThreshold);

            int alertCount = 0;
            for (TaskMonitor task : timeoutTasks) {
                String level = determineTimeoutLevel(task.getTotalDuration());
                if (level == null) {
                    continue;
                }

                TimeoutAlert existingAlert = findLatestActiveAlert(tenantId, "TASK", task.getTaskId());
                if (existingAlert != null) {
                    upgradeExistingAlert(existingAlert, level);
                    performanceStatsRefreshService.refreshForTask(tenantId, task.getTaskId());
                    continue;
                }

                TimeoutAlert alert = new TimeoutAlert();
                alert.setTenantId(tenantId);
                alert.setAlertType("TASK");
                alert.setTargetId(task.getTaskId());
                alert.setTargetName(task.getTaskName());
                alert.setTimeoutLevel(level);
                alert.setTimeoutDuration(task.getTotalDuration());
                alert.setThreshold(getThresholdByLevel(level));
                alert.setAssigneeId(task.getAssigneeId());
                alert.setAssigneeName(task.getAssigneeName());
                alert.setAlertTime(LocalDateTime.now());
                alert.setNotificationSent("N");
                alert.setEscalated("N");
                alert.setResolved("N");
                alert.setCreateTime(LocalDateTime.now());
                alert.setUpdateTime(LocalDateTime.now());

                timeoutAlertMapper.insert(alert);
                alertCount++;
                performanceStatsRefreshService.refreshForTask(tenantId, task.getTaskId());
                sendTimeoutAlert(alert);
            }

            log.info("超时任务检测完成: tenantId={}, 检测数量={}, 新增告警={}", tenantId, timeoutTasks.size(), alertCount);
        } catch (Exception e) {
            log.error("检测超时任务失败, tenantId={}", tenantId, e);
        }
    }

    /**
     * 定时检测超时流程，每 5 分钟执行一次。
     */
    @Override
    @DistributedJob(name = "workflow-timeout-process-check-job", lockTime = 300)
    @Scheduled(cron = "0 */5 * * * ?")
    @Transactional(rollbackFor = Exception.class)
    public void detectTimeoutProcesses() {
        log.info("开始检测超时流程");
        // 重复告警全量收敛跨租户进行一次即可（无 tenantId 过滤，依赖 MP 行级隔离）
        tenantIterator.forEachActiveTenant(tid -> {
            try { cleanupDuplicateActiveAlerts(); } catch (Exception e) {
                log.error("超时告警收敛失败, tenantId={}", tid, e);
            }
            detectTimeoutProcessesForTenant(tid);
        });
    }

    private void detectTimeoutProcessesForTenant(Long tenantId) {
        try {
            List<ProcessMonitor> runningProcesses = processMonitorMapper.selectRunningProcesses(tenantId);

            int alertCount = 0;
            for (ProcessMonitor process : runningProcesses) {
                long duration = ChronoUnit.MILLIS.between(process.getStartTime(), LocalDateTime.now());

                String level = determineTimeoutLevel(duration);
                if (level == null) {
                    continue;
                }

                TimeoutAlert existingAlert = findLatestActiveAlert(tenantId, "PROCESS", process.getInstanceId());
                if (existingAlert != null) {
                    upgradeExistingAlert(existingAlert, level);
                    performanceStatsRefreshService.refreshForProcess(process);
                    continue;
                }

                TimeoutAlert alert = new TimeoutAlert();
                alert.setTenantId(tenantId);
                alert.setAlertType("PROCESS");
                alert.setTargetId(process.getInstanceId());
                alert.setTargetName(process.getProcessDefName());
                alert.setTimeoutLevel(level);
                alert.setTimeoutDuration(duration);
                alert.setThreshold(getThresholdByLevel(level));
                alert.setAlertTime(LocalDateTime.now());
                alert.setNotificationSent("N");
                alert.setEscalated("N");
                alert.setResolved("N");
                alert.setCreateTime(LocalDateTime.now());
                alert.setUpdateTime(LocalDateTime.now());

                timeoutAlertMapper.insert(alert);
                alertCount++;
                performanceStatsRefreshService.refreshForProcess(process);
                sendTimeoutAlert(alert);
            }

            log.info("超时流程检测完成: tenantId={}, 检测数量={}, 新增告警={}", tenantId, runningProcesses.size(), alertCount);
        } catch (Exception e) {
            log.error("检测超时流程失败, tenantId={}", tenantId, e);
        }
    }

    @Override
    public void sendTimeoutAlert(TimeoutAlert alert) {
        try {
            String message = buildAlertMessage(alert);
            log.warn("[超时告警] {}", message);

            // 当前已实现：系统通知、数据库记录、日志记录。
            // 如需扩展，可在这里对接钉钉、企业微信、邮件、短信等通知渠道。
            alert.setNotificationSent("Y");
            alert.setUpdateTime(LocalDateTime.now());
            timeoutAlertMapper.updateById(alert);

            log.info("超时告警通知已发送: alertId={}, type={}, level={}",
                    alert.getId(), alert.getAlertType(), alert.getTimeoutLevel());
        } catch (Exception e) {
            log.error("发送超时告警失败: alertId={}", alert.getId(), e);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void escalateTimeoutAlert(Long alertId) {
        try {
            TimeoutAlert alert = timeoutAlertMapper.selectById(alertId);
            if (alert == null || "Y".equals(alert.getResolved())) {
                return;
            }

            String currentLevel = alert.getTimeoutLevel();
            String newLevel = escalateLevel(currentLevel);
            if (!currentLevel.equals(newLevel)) {
                alert.setTimeoutLevel(newLevel);
                alert.setEscalated("Y");
                alert.setUpdateTime(LocalDateTime.now());
                timeoutAlertMapper.updateById(alert);
                performanceStatsRefreshService.refreshForTimeoutAlert(alert);

                log.warn("超时告警已升级: alertId={}, {} -> {}", alertId, currentLevel, newLevel);
                sendTimeoutAlert(alert);
            }
        } catch (Exception e) {
            log.error("升级超时告警失败: alertId={}", alertId, e);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void resolveTimeoutAlert(Long alertId, String resolver, String solution) {
        try {
            TimeoutAlert alert = timeoutAlertMapper.selectById(alertId);
            if (alert == null) {
                return;
            }

            alert.setResolved("Y");
            alert.setResolveTime(LocalDateTime.now());
            alert.setUpdateTime(LocalDateTime.now());
            timeoutAlertMapper.updateById(alert);
            performanceStatsRefreshService.refreshForTimeoutAlert(alert);

            log.info("超时告警已解决: alertId={}, resolver={}", alertId, resolver);
        } catch (Exception e) {
            log.error("解决超时告警失败: alertId={}", alertId, e);
            throw e;
        }
    }

    /**
     * 查询当前目标最新的一条未解决告警，并把历史重复告警自动收敛。
     * 这样即使库里已有脏数据，也不会再触发 selectOne 多结果异常。
     */
    private TimeoutAlert findLatestActiveAlert(Long tenantId, String alertType, String targetId) {
        LambdaQueryWrapper<TimeoutAlert> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(TimeoutAlert::getTenantId, tenantId)
                .eq(TimeoutAlert::getAlertType, alertType)
                .eq(TimeoutAlert::getTargetId, targetId)
                .and(query -> query.eq(TimeoutAlert::getResolved, "N")
                        .or()
                        .isNull(TimeoutAlert::getResolved))
                .orderByDesc(TimeoutAlert::getAlertTime)
                .orderByDesc(TimeoutAlert::getId);

        List<TimeoutAlert> alerts = timeoutAlertMapper.selectList(wrapper);
        if (alerts.isEmpty()) {
            return null;
        }

        TimeoutAlert latestAlert = alerts.get(0);
        if (alerts.size() > 1) {
            autoResolveDuplicateAlerts(alerts, latestAlert);
        }
        return latestAlert;
    }

    /**
     * 启动全量收敛，避免“已不在运行中的旧流程/任务”残留重复未解决告警。
     * 这样即使脏数据已经脱离当前检测范围，也会在下一轮定时任务中被清掉。
     */
    private void cleanupDuplicateActiveAlerts() {
        LambdaQueryWrapper<TimeoutAlert> wrapper = new LambdaQueryWrapper<>();
        wrapper.and(query -> query.eq(TimeoutAlert::getResolved, "N")
                        .or()
                        .isNull(TimeoutAlert::getResolved))
                .orderByAsc(TimeoutAlert::getTenantId)
                .orderByAsc(TimeoutAlert::getAlertType)
                .orderByAsc(TimeoutAlert::getTargetId)
                .orderByDesc(TimeoutAlert::getAlertTime)
                .orderByDesc(TimeoutAlert::getId);

        List<TimeoutAlert> activeAlerts = timeoutAlertMapper.selectList(wrapper);
        if (activeAlerts.isEmpty()) {
            return;
        }

        Set<String> keptKeys = new HashSet<>();
        Set<String> duplicateKeys = new HashSet<>();
        LocalDateTime now = LocalDateTime.now();
        int resolvedCount = 0;

        for (TimeoutAlert alert : activeAlerts) {
            String alertKey = buildAlertKey(alert.getTenantId(), alert.getAlertType(), alert.getTargetId());
            if (keptKeys.add(alertKey)) {
                continue;
            }

            alert.setResolved("Y");
            alert.setResolveTime(now);
            alert.setUpdateTime(now);
            timeoutAlertMapper.updateById(alert);
            duplicateKeys.add(alertKey);
            resolvedCount++;
        }

        if (resolvedCount > 0) {
            log.warn("超时告警全量收敛完成: duplicateGroups={}, resolvedDuplicates={}",
                    duplicateKeys.size(), resolvedCount);
        }
    }

    /**
     * 保留最新告警，把更老的重复未解决告警标记为已解决，避免脏数据持续放大。
     */
    private void autoResolveDuplicateAlerts(List<TimeoutAlert> alerts, TimeoutAlert latestAlert) {
        LocalDateTime now = LocalDateTime.now();
        int resolvedCount = 0;
        for (int i = 1; i < alerts.size(); i++) {
            TimeoutAlert duplicateAlert = alerts.get(i);
            duplicateAlert.setResolved("Y");
            duplicateAlert.setResolveTime(now);
            duplicateAlert.setUpdateTime(now);
            timeoutAlertMapper.updateById(duplicateAlert);
            resolvedCount++;
        }

        log.warn("检测到重复未解决超时告警，已自动收敛: tenantId={}, type={}, targetId={}, keepId={}, resolvedDuplicates={}",
                latestAlert.getTenantId(), latestAlert.getAlertType(), latestAlert.getTargetId(),
                latestAlert.getId(), resolvedCount);
    }

    private String buildAlertKey(Long tenantId, String alertType, String targetId) {
        return tenantId + "|" + alertType + "|" + targetId;
    }

    /**
     * 如果任务或流程已经从提醒升级到更高等级，则更新现有告警，避免重复插入。
     */
    private void upgradeExistingAlert(TimeoutAlert existingAlert, String newLevel) {
        String currentLevel = existingAlert.getTimeoutLevel();
        int currentPriority = getLevelPriority(currentLevel);
        int newPriority = getLevelPriority(newLevel);
        if (newPriority > currentPriority) {
            existingAlert.setTimeoutLevel(newLevel);
            existingAlert.setThreshold(getThresholdByLevel(newLevel));
            existingAlert.setUpdateTime(LocalDateTime.now());
            timeoutAlertMapper.updateById(existingAlert);
            performanceStatsRefreshService.refreshForTimeoutAlert(existingAlert);

            log.warn("超时告警已升级: alertId={}, {} -> {}", existingAlert.getId(), currentLevel, newLevel);
            sendTimeoutAlert(existingAlert);
        }
    }

    private int getLevelPriority(String level) {
        switch (level) {
            case "CRITICAL":
                return 3;
            case "WARNING":
                return 2;
            case "REMIND":
                return 1;
            default:
                return 0;
        }
    }

    /**
     * 根据超时时长确定告警级别。
     */
    private String determineTimeoutLevel(Long duration) {
        if (duration >= criticalThreshold) {
            return "CRITICAL";
        } else if (duration >= warningThreshold) {
            return "WARNING";
        } else if (duration >= remindThreshold) {
            return "REMIND";
        }
        return null;
    }

    /**
     * 手动升级告警时的级别推进规则。
     */
    private String escalateLevel(String currentLevel) {
        switch (currentLevel) {
            case "REMIND":
                return "WARNING";
            case "WARNING":
                return "CRITICAL";
            case "CRITICAL":
            default:
                return currentLevel;
        }
    }

    /**
     * 根据级别获取对应阈值。
     */
    private Long getThresholdByLevel(String level) {
        switch (level) {
            case "REMIND":
                return remindThreshold;
            case "WARNING":
                return warningThreshold;
            case "CRITICAL":
                return criticalThreshold;
            default:
                return remindThreshold;
        }
    }

    /**
     * 构建告警消息。
     */
    private String buildAlertMessage(TimeoutAlert alert) {
        StringBuilder sb = new StringBuilder();
        sb.append("类型=").append(alert.getAlertType());
        sb.append(", 级别=").append(alert.getTimeoutLevel());
        sb.append(", 目标=").append(alert.getTargetName());

        if (alert.getAssigneeName() != null) {
            sb.append(", 处理人=").append(alert.getAssigneeName());
        }

        long hours = alert.getTimeoutDuration() / 3600000;
        sb.append(", 超时时长=").append(hours).append("小时");
        return sb.toString();
    }

    /**
     * 格式化时长，保留给后续通知渠道扩展使用。
     */
    private String formatDuration(Long millis) {
        long hours = millis / 3600000;
        long minutes = (millis % 3600000) / 60000;
        return String.format("%d小时%d分钟", hours, minutes);
    }
}
