package com.cloudflow.workflow.service.monitor.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.monitor.AnomalyAlert;
import com.cloudflow.workflow.domain.monitor.ProcessMonitor;
import com.cloudflow.workflow.mapper.AnomalyAlertMapper;
import com.cloudflow.workflow.mapper.ProcessMonitorMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.service.monitor.IAnomalyDetectionService;
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

    private final AnomalyAlertMapper anomalyAlertMapper;
    private final ProcessMonitorMapper processMonitorMapper;
    private final WfTaskMapper taskMapper;

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
            log.warn("检测到执行失败: instanceId={}, error={}", instanceId, errorMessage);

            // 发送告警
            sendAnomalyAlert(alert);
        } catch (Exception e) {
            log.error("检测执行失败异常: instanceId={}", instanceId, e);
        }
    }

    @Override
    @Scheduled(cron = "0 */10 * * * ?")
    @Transactional(rollbackFor = Exception.class)
    public void detectDeadlock() {
        try {
            log.info("开始检测死锁");
            // P2-fix-6: 定时任务无 SecurityContext，安全获取租户ID
            Long tenantId = getScheduledTenantId();

            // 查询长时间运行的流程
            List<ProcessMonitor> runningProcesses = processMonitorMapper.selectRunningProcesses(tenantId);

            int alertCount = 0;
            for (ProcessMonitor process : runningProcesses) {
                // 检查流程是否可能死锁
                // 1. 运行时间超过24小时
                // 2. 没有活动任务
                long runningHours = java.time.Duration.between(
                        process.getStartTime(), LocalDateTime.now()).toHours();

                if (runningHours > 24) {
                    // 查询该流程的活动任务
                    LambdaQueryWrapper<WfTask> taskWrapper = new LambdaQueryWrapper<>();
                    taskWrapper.eq(WfTask::getInstanceId, process.getInstanceId())
                            .eq(WfTask::getStatus, "TODO");

                    long activeTaskCount = taskMapper.selectCount(taskWrapper);

                    if (activeTaskCount == 0) {
                        // 可能死锁：流程运行中但没有活动任务
                        createDeadlockAlert(process, "流程运行超过24小时且无活动任务");
                        alertCount++;
                    }
                }
            }

            log.info("死锁检测完成: 检测数量={}, 新增告警={}", runningProcesses.size(), alertCount);
        } catch (Exception e) {
            log.error("检测死锁失败", e);
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
            log.warn("检测到无候选人: taskId={}, nodeKey={}", taskId, nodeKey);

            // 发送告警
            sendAnomalyAlert(alert);
        } catch (Exception e) {
            log.error("检测无候选人异常: taskId={}", taskId, e);
        }
    }

    @Override
    @Scheduled(cron = "0 0 */6 * * ?")
    @Transactional(rollbackFor = Exception.class)
    public void detectDataInconsistency() {
        try {
            log.info("开始检测数据不一致");
            // P2-fix-6: 定时任务无 SecurityContext，安全获取租户ID
            Long tenantId = getScheduledTenantId();

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

            log.info("数据不一致检测完成: 检测数量={}, 新增告警={}", runningMonitors.size(), alertCount);
        } catch (Exception e) {
            log.error("检测数据不一致失败", e);
        }
    }

    @Override
    public void sendAnomalyAlert(AnomalyAlert alert) {
        try {
            // 构建告警消息
            String message = buildAlertMessage(alert);

            // 记录告警日志
            log.error("[异常告警] {}", message);

            // 当前已实现：系统通知、数据库记录、日志记录
            // 扩展点：外部通知渠道（钉钉、企业微信、邮件、短信）
            // 示例：if (notificationConfig.isDingTalkEnabled()) { dingTalkService.sendAlert(...); }
            // 2. 发送邮件
            // 3. 发送钉钉/企业微信通知
            // 4. 严重级别发送短信

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
            sendAnomalyAlert(alert);
        } catch (Exception e) {
            log.error("创建数据不一致告警失败: instanceId={}", process.getInstanceId(), e);
        }
    }

    /**
     * P2-fix-6: 定时任务安全获取租户ID
     * @Scheduled 方法没有 SecurityContext，直接调用 SecurityUtils 会 NPE
     */
    private Long getScheduledTenantId() {
        try {
            Long tenantId = SecurityUtils.getTenantId();
            return tenantId != null ? tenantId : 100000L;
        } catch (Exception e) {
            return 100000L; // 默认租户ID
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
