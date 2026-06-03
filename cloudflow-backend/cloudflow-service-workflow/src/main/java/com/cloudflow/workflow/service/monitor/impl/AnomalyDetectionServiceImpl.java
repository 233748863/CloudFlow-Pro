package com.cloudflow.workflow.service.monitor.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.monitor.AnomalyAlert;
import com.cloudflow.workflow.domain.monitor.ProcessMonitor;
import com.cloudflow.workflow.mapper.AnomalyAlertMapper;
import com.cloudflow.workflow.mapper.ProcessMonitorMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.service.INotificationService;
import com.cloudflow.workflow.service.monitor.IAnomalyDetectionService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 异常检测服务实现
 *
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AnomalyDetectionServiceImpl implements IAnomalyDetectionService {

    private static final String EVENT_WORKFLOW_ANOMALY = "WORKFLOW_ANOMALY";

    private final AnomalyAlertMapper anomalyAlertMapper;
    private final ProcessMonitorMapper processMonitorMapper;
    private final WfTaskMapper taskMapper;
    private final WfProcessInstanceMapper processInstanceMapper;
    private final INotificationService notificationService;
    private final PerformanceStatsRefreshService performanceStatsRefreshService;
    private final TenantIterator tenantIterator;
    private final SysConfigHelper sysConfigHelper;

    /** 兜底默认值：异常运行时长阈值小时（实际值从 sys.workflow.anomaly.runningHoursThreshold 读取） */
    private static final int DEFAULT_RUNNING_HOURS_THRESHOLD = 24;

    private int runningHoursThreshold() {
        return sysConfigHelper.getConfigInt("sys.workflow.anomaly.runningHoursThreshold", DEFAULT_RUNNING_HOURS_THRESHOLD);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void detectExecutionFailure(String instanceId, String errorMessage, String stackTrace) {
        try {
            ProcessMonitor monitor = processMonitorMapper.selectByInstanceId(instanceId);
            if (monitor == null) {
                log.warn("流程监控记录不存在: instanceId={}", instanceId);
                return;
            }

            // 检查是否已存在未解决的告警
            LambdaQueryWrapper<AnomalyAlert> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(AnomalyAlert::getTenantId, monitor.getTenantId())
                    .eq(AnomalyAlert::getAnomalyType, "EXECUTION_FAILED")
                    .eq(AnomalyAlert::getInstanceId, instanceId);
            applyUnresolvedFilter(wrapper);

            if (anomalyAlertMapper.selectCount(wrapper) > 0) {
                return; // 已存在告警，跳过
            }

            // 创建异常告警
            AnomalyAlert alert = new AnomalyAlert();
            alert.setTenantId(monitor.getTenantId());
            alert.setAnomalyType("EXECUTION_FAILED");
            alert.setInstanceId(instanceId);
            alert.setProcessDefKey(monitor.getProcessDefKey());
            alert.setProcessName(monitor.getProcessDefName());
            alert.setErrorMessage(errorMessage);
            alert.setStackTrace(stackTrace);
            alert.setSeverity(determineSeverity(errorMessage));
            alert.setAlertTime(LocalDateTime.now());
            alert.setNotificationSent("N");
            alert.setResolved("N");
            alert.setCreateTime(LocalDateTime.now());
            alert.setUpdateTime(LocalDateTime.now());

            anomalyAlertMapper.insert(alert);
            performanceStatsRefreshService.refreshForAnomalyAlert(alert);
            log.warn("检测到执行失败: instanceId={}, error={}", instanceId, errorMessage);

            // 发送告警
            sendAnomalyAlert(alert);
        } catch (Exception e) {
            log.error("检测执行失败异常: instanceId={}", instanceId, e);
        }
    }

    @Override
    @DistributedJob(name = "workflow-anomaly-deadlock-job", lockTime = 600)
    @Scheduled(cron = "0 */10 * * * ?")
    @Transactional(rollbackFor = Exception.class)
    public void detectDeadlock() {
        log.info("开始检测死锁");
        tenantIterator.forEachActiveTenant(tid -> detectDeadlockForTenant(tid));
    }

    private void detectDeadlockForTenant(Long tenantId) {
        try {
            // 查询长时间运行的流程
            List<ProcessMonitor> runningProcesses = processMonitorMapper.selectRunningProcesses(tenantId);

            int alertCount = 0;
            for (ProcessMonitor process : runningProcesses) {
                // 检查流程是否可能死锁
                // 1. 运行时间超过24小时
                // 2. 没有活动任务
                long runningHours = java.time.Duration.between(
                        process.getStartTime(), LocalDateTime.now()).toHours();

                int threshold = runningHoursThreshold();
                if (runningHours > threshold) {
                    // 查询该流程的活动任务
                    LambdaQueryWrapper<WfTask> taskWrapper = new LambdaQueryWrapper<>();
                    taskWrapper.eq(WfTask::getInstanceId, process.getInstanceId())
                            .eq(WfTask::getStatus, "TODO");

                    long activeTaskCount = taskMapper.selectCount(taskWrapper);

                    if (activeTaskCount == 0) {
                        // 可能死锁：流程运行中但没有活动任务
                        createDeadlockAlert(process, "流程运行超过" + threshold + "小时且无活动任务");
                        alertCount++;
                    }
                }
            }

            log.info("死锁检测完成: tenantId={}, 检测数量={}, 新增告警={}", tenantId, runningProcesses.size(), alertCount);
        } catch (Exception e) {
            log.error("检测死锁失败, tenantId={}", tenantId, e);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void detectNoAssignee(String taskId, String instanceId, String nodeKey) {
        try {
            WfTask task = taskMapper.selectById(taskId);
            if (task == null) {
                return;
            }

            // 检查是否已存在未解决的告警
            LambdaQueryWrapper<AnomalyAlert> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(AnomalyAlert::getTenantId, task.getTenantId())
                    .eq(AnomalyAlert::getAnomalyType, "NO_ASSIGNEE")
                    .eq(AnomalyAlert::getTaskId, taskId);
            applyUnresolvedFilter(wrapper);

            if (anomalyAlertMapper.selectCount(wrapper) > 0) {
                return; // 已存在告警，跳过
            }

            // 创建异常告警
            AnomalyAlert alert = new AnomalyAlert();
            alert.setTenantId(task.getTenantId());
            alert.setAnomalyType("NO_ASSIGNEE");
            alert.setTaskId(taskId);
            alert.setInstanceId(instanceId);
            alert.setProcessDefKey(task.getProcessDefKey());
            alert.setNodeKey(nodeKey);
            alert.setNodeName(task.getNodeName());
            alert.setErrorMessage("任务没有候选人，无法分配");
            alert.setSeverity("HIGH");
            alert.setAlertTime(LocalDateTime.now());
            alert.setNotificationSent("N");
            alert.setResolved("N");
            alert.setCreateTime(LocalDateTime.now());
            alert.setUpdateTime(LocalDateTime.now());

            anomalyAlertMapper.insert(alert);
            performanceStatsRefreshService.refreshForAnomalyAlert(alert);
            log.warn("检测到无候选人: taskId={}, nodeKey={}", taskId, nodeKey);

            // 发送告警
            sendAnomalyAlert(alert);
        } catch (Exception e) {
            log.error("检测无候选人异常: taskId={}", taskId, e);
        }
    }

    @Override
    @DistributedJob(name = "workflow-anomaly-data-check-job", lockTime = 600)
    @Scheduled(cron = "0 0 */6 * * ?")
    @Transactional(rollbackFor = Exception.class)
    public void detectDataInconsistency() {
        log.info("开始检测数据不一致");
        tenantIterator.forEachActiveTenant(tid -> detectDataInconsistencyForTenant(tid));
    }

    private void detectDataInconsistencyForTenant(Long tenantId) {
        try {
            // 检查流程监控数据与实际流程状态的一致性
            List<ProcessMonitor> runningMonitors = processMonitorMapper.selectRunningProcesses(tenantId);

            int alertCount = 0;
            for (ProcessMonitor monitor : runningMonitors) {
                // 检查是否存在对应的活动任务
                LambdaQueryWrapper<WfTask> taskWrapper = new LambdaQueryWrapper<>();
                taskWrapper.eq(WfTask::getInstanceId, monitor.getInstanceId());

                long taskCount = taskMapper.selectCount(taskWrapper);

                if (taskCount == 0) {
                    // 数据不一致：监控显示运行中，但没有任何任务记录
                    createDataInconsistencyAlert(monitor, "监控显示运行中但无任务记录");
                    alertCount++;
                }
            }

            log.info("数据不一致检测完成: tenantId={}, 检测数量={}, 新增告警={}", tenantId, runningMonitors.size(), alertCount);
        } catch (Exception e) {
            log.error("检测数据不一致失败, tenantId={}", tenantId, e);
        }
    }

    @Override
    public void sendAnomalyAlert(AnomalyAlert alert) {
        try {
            Long recipientId = resolveRecipientId(alert);
            if (recipientId == null) {
                log.warn("异常告警未找到通知接收人: alertId={}, instanceId={}", alert.getId(), alert.getInstanceId());
                return;
            }

            // 构建告警消息
            String message = buildAlertMessage(alert);

            // 记录告警日志
            log.error("[异常告警] {}", message);

            notificationService.sendNotification(
                    recipientId,
                    buildAlertTitle(alert),
                    buildAlertNoticeContent(alert),
                    EVENT_WORKFLOW_ANOMALY
            );

            // 更新通知状态
            alert.setNotificationSent("Y");
            alert.setUpdateTime(LocalDateTime.now());
            anomalyAlertMapper.updateById(alert);

            log.info("异常告警通知已发送: alertId={}, type={}, severity={}",
                    alert.getId(), alert.getAnomalyType(), alert.getSeverity());
        } catch (Exception e) {
            log.error("发送异常告警失败: alertId={}", alert.getId(), e);
        }
    }

    private Long resolveRecipientId(AnomalyAlert alert) {
        if (alert.getInstanceId() == null) {
            return null;
        }
        WfProcessInstance instance = processInstanceMapper.selectById(alert.getInstanceId());
        return instance == null ? null : instance.getStartUserId();
    }

    private String buildAlertTitle(AnomalyAlert alert) {
        return "流程异常提醒";
    }

    private String buildAlertNoticeContent(AnomalyAlert alert) {
        return String.format("流程【%s】发生%s异常，严重程度 %s。原因：%s",
                alert.getProcessName(),
                resolveAnomalyTypeLabel(alert.getAnomalyType()),
                alert.getSeverity(),
                alert.getErrorMessage());
    }

    private String resolveAnomalyTypeLabel(String anomalyType) {
        return switch (anomalyType) {
            case "EXECUTION_FAILED" -> "执行失败";
            case "NO_ASSIGNEE" -> "无人认领";
            case "DEADLOCK" -> "死锁";
            case "DATA_INCONSISTENCY" -> "数据不一致";
            default -> anomalyType;
        };
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void resolveAnomalyAlert(Long alertId, String resolver, String solution) {
        try {
            AnomalyAlert alert = anomalyAlertMapper.selectById(alertId);
            if (alert == null) {
                return;
            }

            alert.setResolved("Y");
            alert.setResolveTime(LocalDateTime.now());
            alert.setResolveNote(solution);
            alert.setUpdateTime(LocalDateTime.now());

            anomalyAlertMapper.updateById(alert);
            performanceStatsRefreshService.refreshForAnomalyAlert(alert);
            log.info("异常告警已解决: alertId={}, resolver={}", alertId, resolver);
        } catch (Exception e) {
            log.error("解决异常告警失败: alertId={}", alertId, e);
            throw e;
        }
    }

    /**
     * 创建死锁告警
     */
    private void createDeadlockAlert(ProcessMonitor process, String reason) {
        try {
            // 检查是否已存在未解决的告警
            LambdaQueryWrapper<AnomalyAlert> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(AnomalyAlert::getTenantId, process.getTenantId())
                    .eq(AnomalyAlert::getAnomalyType, "DEADLOCK")
                    .eq(AnomalyAlert::getInstanceId, process.getInstanceId());
            applyUnresolvedFilter(wrapper);

            if (anomalyAlertMapper.selectCount(wrapper) > 0) {
                return;
            }

            AnomalyAlert alert = new AnomalyAlert();
            alert.setTenantId(process.getTenantId());
            alert.setAnomalyType("DEADLOCK");
            alert.setInstanceId(process.getInstanceId());
            alert.setProcessDefKey(process.getProcessDefKey());
            alert.setProcessName(process.getProcessDefName());
            alert.setErrorMessage(reason);
            alert.setSeverity("CRITICAL");
            alert.setAlertTime(LocalDateTime.now());
            alert.setNotificationSent("N");
            alert.setResolved("N");
            alert.setCreateTime(LocalDateTime.now());
            alert.setUpdateTime(LocalDateTime.now());

            anomalyAlertMapper.insert(alert);
            performanceStatsRefreshService.refreshForAnomalyAlert(alert);
            sendAnomalyAlert(alert);
        } catch (Exception e) {
            log.error("创建死锁告警失败: instanceId={}", process.getInstanceId(), e);
        }
    }

    /**
     * 创建数据不一致告警
     */
    private void createDataInconsistencyAlert(ProcessMonitor process, String reason) {
        try {
            // 检查是否已存在未解决的告警
            LambdaQueryWrapper<AnomalyAlert> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(AnomalyAlert::getTenantId, process.getTenantId())
                    .eq(AnomalyAlert::getAnomalyType, "DATA_INCONSISTENCY")
                    .eq(AnomalyAlert::getInstanceId, process.getInstanceId());
            applyUnresolvedFilter(wrapper);

            if (anomalyAlertMapper.selectCount(wrapper) > 0) {
                return;
            }

            AnomalyAlert alert = new AnomalyAlert();
            alert.setTenantId(process.getTenantId());
            alert.setAnomalyType("DATA_INCONSISTENCY");
            alert.setInstanceId(process.getInstanceId());
            alert.setProcessDefKey(process.getProcessDefKey());
            alert.setProcessName(process.getProcessDefName());
            alert.setErrorMessage(reason);
            alert.setSeverity("MEDIUM");
            alert.setAlertTime(LocalDateTime.now());
            alert.setNotificationSent("N");
            alert.setResolved("N");
            alert.setCreateTime(LocalDateTime.now());
            alert.setUpdateTime(LocalDateTime.now());

            anomalyAlertMapper.insert(alert);
            performanceStatsRefreshService.refreshForAnomalyAlert(alert);
            sendAnomalyAlert(alert);
        } catch (Exception e) {
            log.error("创建数据不一致告警失败: instanceId={}", process.getInstanceId(), e);
        }
    }

    /**
     * 确定严重程度
     */
    private String determineSeverity(String errorMessage) {
        if (errorMessage == null) {
            return "MEDIUM";
        }

        String lowerError = errorMessage.toLowerCase();

        // 严重错误
        if (lowerError.contains("nullpointerexception") ||
                lowerError.contains("outofmemory") ||
                lowerError.contains("stackoverflow")) {
            return "CRITICAL";
        }

        // 高级错误
        if (lowerError.contains("sqlexception") ||
                lowerError.contains("timeout") ||
                lowerError.contains("connection")) {
            return "HIGH";
        }

        // 中等错误
        return "MEDIUM";
    }

    /**
     * 构建告警消息
     */
    private String buildAlertMessage(AnomalyAlert alert) {
        StringBuilder sb = new StringBuilder();
        sb.append("类型=").append(alert.getAnomalyType());
        sb.append(", 严重程度=").append(alert.getSeverity());
        sb.append(", 流程=").append(alert.getProcessDefKey());
        sb.append(", 实例ID=").append(alert.getInstanceId());

        if (alert.getTaskId() != null) {
            sb.append(", 任务ID=").append(alert.getTaskId());
        }

        if (alert.getErrorMessage() != null) {
            sb.append(", 错误=").append(alert.getErrorMessage());
        }

        return sb.toString();
    }

    /**
     * 兼容历史数据中的 0/1 与当前标准 Y/N。
     * 未解决告警统一视为 N、0 或 NULL。
     */
    private void applyUnresolvedFilter(LambdaQueryWrapper<AnomalyAlert> wrapper) {
        wrapper.eq(AnomalyAlert::getResolved, "N");
    }
}
