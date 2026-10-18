package com.cloudflow.workflow.service.monitor.impl;

import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.config.JobInvocationContext;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;

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
import com.cloudflow.workflow.service.monitor.IAnomalyDetectionService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.ArrayList;
import java.util.Objects;

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
    private final PerformanceStatsRefreshService performanceStatsRefreshService;
    private final TenantIterator tenantIterator;
    private final SysConfigHelper sysConfigHelper;
    private final MessageSender messageSender;
    private final TransactionTemplate transactions;

    /** 兜底默认值：异常运行时长阈值小时（实际值从 sys.workflow.anomaly.runningHoursThreshold 读取） */
    private static final int DEFAULT_RUNNING_HOURS_THRESHOLD = 24;

    private int runningHoursThreshold() {
        return sysConfigHelper.getConfigInt("sys.workflow.anomaly.runningHoursThreshold", DEFAULT_RUNNING_HOURS_THRESHOLD);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void detectExecutionFailure(String instanceId, String errorMessage, String stackTrace) {
        try {
            Long tenantId = requireEventTenant();
            ProcessMonitor monitor = processMonitorMapper.selectByInstanceId(instanceId, tenantId);
            if (monitor == null) {
                log.warn("流程监控记录不存在: instanceId={}", instanceId);
                return;
            }

            monitor = processMonitorMapper.lockForAnomalyScan(tenantId, monitor.getId());
            if (monitor == null) throw new IllegalStateException("流程异常监控记录已变更");
            if (repairExistingEvent(tenantId, instanceId, "EXECUTION_FAILED", null)) return;

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

            if (anomalyAlertMapper.insert(alert) != 1) throw new IllegalStateException("流程异常告警登记失败");
            performanceStatsRefreshService.refreshForAnomalyAlert(alert);
            log.warn("检测到执行失败: instanceId={}, error={}", instanceId, errorMessage);

            // 发送告警
            sendAnomalyAlert(alert);
        } catch (Exception e) {
            log.error("检测执行失败异常: instanceId={}", instanceId, e);
            throw e;
        }
    }

    @Override
    @DistributedJob(name = "workflow-anomaly-deadlock-job", lockTime = 600)
    @JobHandler(value = "anomalyDetect", desc = "异常死锁检测")
    public JobResult detectDeadlock() {
        return scanScheduledAnomalies("anomalyDetect", true);
    }

    private JobResult scanScheduledAnomalies(String handler, boolean deadlock) {
        JobInvocationContext.Execution invocation = JobInvocationContext.execution();
        Long callerTenant = TenantContext.getTenantId();
        List<Long> tenants = callerTenant == null || (invocation != null && handler.equals(invocation.handlerName()))
                ? tenantIterator.listActiveTenantIds() : List.of(callerTenant);
        TransactionTemplate itemTransaction = new TransactionTemplate(Objects.requireNonNull(transactions.getTransactionManager()));
        itemTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        itemTransaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        List<RuntimeException> failures = new ArrayList<>();
        int[] counts = new int[2];
        LocalDateTime observedAt = LocalDateTime.now();
        for (Long tenantId : tenants) {
            try {
                TenantBroker.runAs(tenantId, ignored -> {
                    int threshold = deadlock ? runningHoursThreshold() : 0;
                    if (threshold < 0) throw new IllegalStateException("异常巡检时长阈值不能为负数");
                    long afterId = 0;
                    while (true) {
                        List<Long> ids = processMonitorMapper.selectAnomalyScanIds(tenantId, afterId, 500);
                        for (Long id : ids) {
                            try {
                                ScanCounts outcome = Objects.requireNonNull(itemTransaction.execute(status -> scanScheduledProcess(tenantId, id, deadlock, threshold, observedAt)));
                                counts[0] += outcome.created();
                                counts[1] += outcome.repaired();
                            } catch (RuntimeException failure) {
                                failures.add(new IllegalStateException("流程异常巡检处理失败，租户：" + tenantId + "，监控记录：" + id, failure));
                            }
                        }
                        if (ids.size() < 500) break;
                        long next = ids.get(ids.size() - 1);
                        if (next <= afterId) throw new IllegalStateException("流程异常巡检分页未前进");
                        afterId = next;
                    }
                });
            } catch (RuntimeException failure) {
                failures.add(new IllegalStateException("流程异常巡检读取失败，租户：" + tenantId, failure));
            }
        }
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("流程异常巡检存在失败项：" + failures.size()
                    + "项；已提交新增告警" + counts[0] + "条，补登提醒" + counts[1] + "条");
            failures.forEach(failure::addSuppressed);
            throw failure;
        }
        return JobResult.success(counts[0] + counts[1], "流程异常巡检完成：新增告警" + counts[0] + "条，补登提醒" + counts[1] + "条");
    }

    record ScanCounts(int created, int repaired) { }

    private ScanCounts scanScheduledProcess(Long tenantId, Long id, boolean deadlock, int threshold, LocalDateTime observedAt) {
        ProcessMonitor process = processMonitorMapper.lockForAnomalyScan(tenantId, id);
        if (process == null || !"RUNNING".equals(process.getStatus())) return new ScanCounts(0, 0);
        if (deadlock && !process.getStartTime().isBefore(observedAt.minusHours(threshold))) return new ScanCounts(0, 0);
        LambdaQueryWrapper<WfTask> tasks = new LambdaQueryWrapper<>();
        tasks.eq(WfTask::getTenantId, tenantId).eq(WfTask::getInstanceId, process.getInstanceId());
        if (deadlock) tasks.eq(WfTask::getStatus, "TODO");
        if (taskMapper.selectCount(tasks) != 0) return new ScanCounts(0, 0);
        String type = deadlock ? "DEADLOCK" : "DATA_INCONSISTENCY";
        LambdaQueryWrapper<AnomalyAlert> existing = new LambdaQueryWrapper<>();
        existing.eq(AnomalyAlert::getTenantId, tenantId).eq(AnomalyAlert::getInstanceId, process.getInstanceId())
                .eq(AnomalyAlert::getAnomalyType, type).eq(AnomalyAlert::getResolved, "N").orderByAsc(AnomalyAlert::getId);
        List<AnomalyAlert> alerts = anomalyAlertMapper.selectList(existing);
        if (!alerts.isEmpty()) {
            if (alerts.stream().allMatch(alert -> "Y".equals(alert.getNotificationSent()))) return new ScanCounts(0, 0);
            performanceStatsRefreshService.lockAnomalyScanBucket(process);
            int repaired = 0;
            for (AnomalyAlert alert : alerts) {
                if (!"Y".equals(alert.getNotificationSent())) {
                    registerReminder(alert);
                    repaired++;
                }
            }
            performanceStatsRefreshService.refreshForAnomalyAlert(alerts.get(0));
            return new ScanCounts(0, repaired);
        }
        performanceStatsRefreshService.lockAnomalyScanBucket(process);
        AnomalyAlert alert = new AnomalyAlert();
        alert.setTenantId(tenantId); alert.setInstanceId(process.getInstanceId());
        alert.setProcessDefKey(process.getProcessDefKey()); alert.setProcessName(process.getProcessDefName());
        alert.setAnomalyType(type); alert.setSeverity(deadlock ? "CRITICAL" : "MEDIUM");
        alert.setErrorMessage(deadlock ? "流程运行超过" + threshold + "小时且无活动任务" : "监控显示运行中但无任务记录");
        alert.setAlertTime(observedAt); alert.setCreateTime(observedAt); alert.setUpdateTime(observedAt);
        alert.setResolved("N"); alert.setNotificationSent("N");
        if (anomalyAlertMapper.insert(alert) != 1) throw new IllegalStateException("流程异常告警登记失败");
        registerReminder(alert);
        performanceStatsRefreshService.refreshForAnomalyAlert(alert);
        return new ScanCounts(1, 0);
    }

    private void registerReminder(AnomalyAlert alert) {
        WfProcessInstance instance = processInstanceMapper.selectById(alert.getInstanceId());
        if (instance == null || !Objects.equals(instance.getTenantId(), alert.getTenantId()) || instance.getStartUserId() == null) {
            throw new IllegalStateException("流程异常提醒缺少本租户的流程发起人");
        }
        Long recipient = instance.getStartUserId();
        messageSender.send(MessageSendRequest.legacy(recipient, buildAlertTitle(alert), buildAlertNoticeContent(alert), "1", null, "系统")
                .toBuilder().bizType(EVENT_WORKFLOW_ANOMALY).bizId(alert.getId().toString())
                .deduplicationKey("wf:anomaly:" + alert.getId() + ":" + recipient).build());
        alert.setNotificationSent("Y"); alert.setUpdateTime(LocalDateTime.now());
        if (anomalyAlertMapper.updateById(alert) != 1) throw new IllegalStateException("流程异常提醒登记状态更新失败");
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void detectNoAssignee(String taskId, String instanceId, String nodeKey) {
        try {
            Long tenantId = requireEventTenant();
            WfTask task = taskMapper.selectForUpdate(tenantId, taskId);
            if (task == null) {
                return;
            }

            if (!Objects.equals(instanceId, task.getInstanceId()) || !Objects.equals(nodeKey, task.getNodeKey())) {
                throw new IllegalArgumentException("无人认领告警的流程或节点与任务不匹配");
            }
            if (repairExistingEvent(tenantId, instanceId, "NO_ASSIGNEE", taskId)) return;

            WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
            if (instance == null || !Objects.equals(tenantId, instance.getTenantId())) {
                throw new IllegalStateException("无人认领告警缺少本租户的流程实例");
            }
            ProcessMonitor monitor = processMonitorMapper.selectByInstanceId(instanceId, tenantId);
            String processName = monitor == null ? null : monitor.getProcessDefName();
            if (processName == null || processName.isBlank()) processName = instance.getProcessDefKey();

            // 创建异常告警
            AnomalyAlert alert = new AnomalyAlert();
            alert.setTenantId(task.getTenantId());
            alert.setAnomalyType("NO_ASSIGNEE");
            alert.setTaskId(taskId);
            alert.setInstanceId(instanceId);
            alert.setProcessDefKey(instance.getProcessDefKey());
            alert.setProcessName(processName);
            alert.setNodeKey(nodeKey);
            alert.setNodeName(task.getNodeName());
            alert.setErrorMessage("任务没有候选人，无法分配");
            alert.setSeverity("HIGH");
            alert.setAlertTime(LocalDateTime.now());
            alert.setNotificationSent("N");
            alert.setResolved("N");
            alert.setCreateTime(LocalDateTime.now());
            alert.setUpdateTime(LocalDateTime.now());

            if (anomalyAlertMapper.insert(alert) != 1) throw new IllegalStateException("流程异常告警登记失败");
            performanceStatsRefreshService.refreshForAnomalyAlert(alert);
            log.warn("检测到无候选人: taskId={}, nodeKey={}", taskId, nodeKey);

            // 发送告警
            sendAnomalyAlert(alert);
        } catch (Exception e) {
            log.error("检测无候选人异常: taskId={}", taskId, e);
            throw e;
        }
    }

    @Override
    @DistributedJob(name = "workflow-anomaly-data-check-job", lockTime = 600)
    @JobHandler(value = "anomalyDetectDaily", desc = "异常数据一致性检测")
    public JobResult detectDataInconsistency() {
        return scanScheduledAnomalies("anomalyDetectDaily", false);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void sendAnomalyAlert(AnomalyAlert alert) {
        Long tenantId = requireEventTenant();
        if (alert == null || alert.getId() == null || !Objects.equals(tenantId, alert.getTenantId())) {
            throw new IllegalArgumentException("流程异常提醒必须引用本租户的已登记告警");
        }
        AnomalyAlert stored = anomalyAlertMapper.selectForNotification(tenantId, alert.getId());
        if (stored == null) throw new IllegalStateException("流程异常告警不存在");
        if ("Y".equals(stored.getNotificationSent())) return;
        registerReminder(stored);
        alert.setNotificationSent(stored.getNotificationSent());
        alert.setUpdateTime(stored.getUpdateTime());
    }

    private Long requireEventTenant() {
        return Objects.requireNonNull(TenantContext.getTenantId(), "流程异常事件缺少租户上下文");
    }

    private boolean repairExistingEvent(Long tenantId, String instanceId, String type, String taskId) {
        List<AnomalyAlert> alerts = anomalyAlertMapper.selectUnresolvedForEvent(tenantId, instanceId, type, taskId);
        if (alerts.isEmpty()) return false;
        boolean repaired = false;
        for (AnomalyAlert alert : alerts) {
            if (!"Y".equals(alert.getNotificationSent())) {
                sendAnomalyAlert(alert);
                repaired = true;
            }
        }
        if (repaired) performanceStatsRefreshService.refreshForAnomalyAlert(alerts.get(0));
        return true;
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

}
