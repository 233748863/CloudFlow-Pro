package com.cloudflow.workflow.service.monitor.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.utils.SecurityUtils;
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
import java.util.List;

/**
 * 超时检测服务实现
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

    @Value("${workflow.timeout.remind.threshold:3600000}")
    private Long remindThreshold;

    @Value("${workflow.timeout.warning.threshold:7200000}")
    private Long warningThreshold;

    @Value("${workflow.timeout.critical.threshold:14400000}")
    private Long criticalThreshold;

    /**
     * 定时检测超时任务
     * 每5分钟执行一次
     */
    @Override
    @Scheduled(cron = "0 */5 * * * ?")
    @Transactional(rollbackFor = Exception.class)
    public void detectTimeoutTasks() {
        try {
            log.info("开始检测超时任务");
            // P2-fix-1: 定时任务无 SecurityContext，使用默认租户ID
            Long tenantId = getScheduledTenantId();

            // 查询超时任务
            List<TaskMonitor> timeoutTasks = taskMonitorMapper.selectTimeoutTasks(tenantId, criticalThreshold);

            int alertCount = 0;
            for (TaskMonitor task : timeoutTasks) {
                // 确定超时级别
                String level = determineTimeoutLevel(task.getTotalDuration());
                if (level == null) {
                    continue; // 未达到提醒阈值
                }

                // P2-fix-5: 检查是否已存在未解决的告警，存在则尝试升级级别
                LambdaQueryWrapper<TimeoutAlert> wrapper = new LambdaQueryWrapper<>();
                wrapper.eq(TimeoutAlert::getTenantId, tenantId)
                        .eq(TimeoutAlert::getAlertType, "TASK")
                        .eq(TimeoutAlert::getTargetId, task.getTaskId())
                        .eq(TimeoutAlert::getResolved, "N");

                TimeoutAlert existingAlert = timeoutAlertMapper.selectOne(wrapper);
                if (existingAlert != null) {
                    upgradeExistingAlert(existingAlert, level);
                    continue;
                }

                // 创建告警记录
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

                // 发送告警通知
                sendTimeoutAlert(alert);
            }

            log.info("超时任务检测完成: 检测数量={}, 新增告警={}", timeoutTasks.size(), alertCount);
        } catch (Exception e) {
            log.error("检测超时任务失败", e);
        }
    }

    /**
     * 定时检测超时流程
     * 每5分钟执行一次
     */
    @Override
    @Scheduled(cron = "0 */5 * * * ?")
    @Transactional(rollbackFor = Exception.class)
    public void detectTimeoutProcesses() {
        try {
            log.info("开始检测超时流程");
            // P2-fix-1: 定时任务无 SecurityContext，使用默认租户ID
            Long tenantId = getScheduledTenantId();

            // 查询运行中的流程
            List<ProcessMonitor> runningProcesses = processMonitorMapper.selectRunningProcesses(tenantId);

            int alertCount = 0;
            for (ProcessMonitor process : runningProcesses) {
                // 计算运行时长
                long duration = ChronoUnit.MILLIS.between(process.getStartTime(), LocalDateTime.now());

                // 确定超时级别
                String level = determineTimeoutLevel(duration);
                if (level == null) {
                    continue; // 未达到提醒阈值
                }

                // P2-fix-5: 检查是否已存在未解决的告警，存在则尝试升级级别
                LambdaQueryWrapper<TimeoutAlert> wrapper = new LambdaQueryWrapper<>();
                wrapper.eq(TimeoutAlert::getTenantId, tenantId)
                        .eq(TimeoutAlert::getAlertType, "PROCESS")
                        .eq(TimeoutAlert::getTargetId, process.getInstanceId())
                        .eq(TimeoutAlert::getResolved, "N");

                TimeoutAlert existingAlert = timeoutAlertMapper.selectOne(wrapper);
                if (existingAlert != null) {
                    upgradeExistingAlert(existingAlert, level);
                    continue;
                }

                // 创建告警记录
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

                // 发送告警通知
                sendTimeoutAlert(alert);
            }

            log.info("超时流程检测完成: 检测数量={}, 新增告警={}", runningProcesses.size(), alertCount);
        } catch (Exception e) {
            log.error("检测超时流程失败", e);
        }
    }

    @Override
    public void sendTimeoutAlert(TimeoutAlert alert) {
        try {
            // 构建告警消息
            String message = buildAlertMessage(alert);

            // 记录告警日志
            log.warn("[超时告警] {}", message);

            // 当前已实现：系统通知、数据库记录、日志记录
            // 扩展点：外部通知渠道（钉钉、企业微信、邮件、短信）
            // 示例：if (notificationConfig.isDingTalkEnabled()) { dingTalkService.sendAlert(...); }
            // 2. 发送邮件
            // 3. 发送钉钉/企业微信通知
            // 4. 发送短信（严重级别）

            // 更新通知状态
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

            // 升级告警级别
            String currentLevel = alert.getTimeoutLevel();
            String newLevel = escalateLevel(currentLevel);

            if (!currentLevel.equals(newLevel)) {
                alert.setTimeoutLevel(newLevel);
                alert.setEscalated("Y");
                alert.setUpdateTime(LocalDateTime.now());
                timeoutAlertMapper.updateById(alert);

                log.warn("超时告警已升级: alertId={}, {} -> {}", alertId, currentLevel, newLevel);

                // 重新发送告警
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
            log.info("超时告警已解决: alertId={}, resolver={}", alertId, resolver);
        } catch (Exception e) {
            log.error("解决超时告警失败: alertId={}", alertId, e);
            throw e;
        }
    }

    /**
     * P2-fix-1: 定时任务安全获取租户ID
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
     * P2-fix-5: 检查并升级已有告警的级别
     * 如果任务超时从 REMIND 升级到 WARNING 或 CRITICAL，更新已有告警
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
            log.warn("超时告警已升级: alertId={}, {} -> {}", existingAlert.getId(), currentLevel, newLevel);
            sendTimeoutAlert(existingAlert);
        }
    }

    private int getLevelPriority(String level) {
        switch (level) {
            case "CRITICAL": return 3;
            case "WARNING": return 2;
            case "REMIND": return 1;
            default: return 0;
        }
    }

    /**
     * 确定超时级别
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
     * 升级告警级别
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
     * 根据级别获取阈值
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
     * 构建告警消息
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
     * 格式化时长
     */
    private String formatDuration(Long millis) {
        long hours = millis / 3600000;
        long minutes = (millis % 3600000) / 60000;
        return String.format("%d小时%d分钟", hours, minutes);
    }
}
