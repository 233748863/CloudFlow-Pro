package com.cloudflow.workflow.service.monitor.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.redis.config.SysConfigKeys;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.common.workflow.callback.registry.BusinessTypeDef;
import com.cloudflow.common.workflow.callback.registry.BusinessTypeRegistry;
import com.cloudflow.workflow.domain.WfEscalationChain;
import com.cloudflow.workflow.domain.WfEscalationLog;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.monitor.ProcessMonitor;
import com.cloudflow.workflow.domain.monitor.TaskMonitor;
import com.cloudflow.workflow.domain.monitor.TimeoutAlert;
import com.cloudflow.workflow.domain.system.SysDept;
import com.cloudflow.workflow.domain.system.SysRole;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.mapper.ProcessMonitorMapper;
import com.cloudflow.workflow.mapper.TaskMonitorMapper;
import com.cloudflow.workflow.mapper.TimeoutAlertMapper;
import com.cloudflow.workflow.mapper.WfEscalationChainMapper;
import com.cloudflow.workflow.mapper.WfEscalationLogMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.mapper.system.SysDeptMapper;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.cloudflow.workflow.service.INotificationService;
import com.cloudflow.workflow.service.monitor.ITimeoutDetectionService;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
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

    private static final String EVENT_TIMEOUT_TASK = "WORKFLOW_TIMEOUT_TASK";
    private static final String EVENT_TIMEOUT_PROCESS = "WORKFLOW_TIMEOUT_PROCESS";

    private final TaskMonitorMapper taskMonitorMapper;
    private final ProcessMonitorMapper processMonitorMapper;
    private final TimeoutAlertMapper timeoutAlertMapper;
    private final WfTaskMapper wfTaskMapper;
    private final WfProcessInstanceMapper processInstanceMapper;
    private final INotificationService notificationService;
    private final PerformanceStatsRefreshService performanceStatsRefreshService;
    private final TenantIterator tenantIterator;
    private final WfEscalationChainMapper escalationChainMapper;
    private final WfEscalationLogMapper escalationLogMapper;
    private final BusinessTypeRegistry businessTypeRegistry;
    private final ObjectMapper objectMapper;
    private final SysUserMapper sysUserMapper;
    private final SysDeptMapper sysDeptMapper;
    private final SysRoleMapper sysRoleMapper;
    private final SysUserRoleMapper sysUserRoleMapper;
    private final RuntimeSysConfigService runtimeSysConfigService;

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
            List<TaskMonitor> timeoutTasks = taskMonitorMapper.selectTimeoutTasks(tenantId, resolveTaskScanThreshold(tenantId));

            int alertCount = 0;
            for (TaskMonitor task : timeoutTasks) {
                task.setTotalDuration(resolveCurrentTaskDuration(task));
                WfTask wfTask = wfTaskMapper.selectById(task.getTaskId());
                WfProcessInstance instance = resolveTaskInstance(task, wfTask);
                executeEscalationChains(tenantId, task, wfTask, instance);

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

    private Long resolveCurrentTaskDuration(TaskMonitor task) {
        if (task == null) {
            return 0L;
        }
        if (task.getCreateTimeTask() != null) {
            return ChronoUnit.MILLIS.between(task.getCreateTimeTask(), LocalDateTime.now());
        }
        return task.getTotalDuration() == null ? 0L : task.getTotalDuration();
    }

    private Long resolveTaskScanThreshold(Long tenantId) {
        LambdaQueryWrapper<WfEscalationChain> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WfEscalationChain::getTenantId, tenantId)
                .eq(WfEscalationChain::getStatus, 1)
                .orderByAsc(WfEscalationChain::getTimeoutMinutes);
        WfEscalationChain first = escalationChainMapper.selectPage(new Page<>(1, 1, false), wrapper)
                .getRecords().stream().findFirst().orElse(null);
        if (first == null || first.getTimeoutMinutes() == null || first.getTimeoutMinutes() <= 0) {
            return runtimeSysConfigService.getLong(SysConfigKeys.WORKFLOW_TIMEOUT_ESCALATION_SCAN_THRESHOLD_MS, 60000L);
        }
        return Math.max(60000L, first.getTimeoutMinutes() * 60000L);
    }

    private WfProcessInstance resolveTaskInstance(TaskMonitor task, WfTask wfTask) {
        String instanceId = wfTask != null && StringUtils.hasText(wfTask.getInstanceId())
                ? wfTask.getInstanceId()
                : task.getInstanceId();
        return StringUtils.hasText(instanceId) ? processInstanceMapper.selectById(instanceId) : null;
    }

    private void executeEscalationChains(Long tenantId, TaskMonitor monitor, WfTask task, WfProcessInstance instance) {
        String bizModule = resolveBizModule(instance);
        List<WfEscalationChain> chains = selectMatchedChains(tenantId, bizModule, monitor.getTotalDuration());
        if (chains.isEmpty()) {
            return;
        }

        for (WfEscalationChain chain : chains) {
            EscalationTarget target = resolveEscalationTarget(chain, monitor, task, instance);
            WfEscalationLog escalationLog = buildEscalationLog(tenantId, monitor, instance, bizModule, chain, target);
            try {
                escalationLogMapper.insert(escalationLog);
            } catch (DuplicateKeyException e) {
                continue;
            }

            applyEscalationAction(chain, monitor, task, target);
        }
    }

    private List<WfEscalationChain> selectMatchedChains(Long tenantId, String bizModule, Long timeoutMillis) {
        long timeoutMinutes = timeoutMillis == null ? 0 : timeoutMillis / 60000L;
        List<WfEscalationChain> chains = escalationChainMapper.selectList(new LambdaQueryWrapper<WfEscalationChain>()
                .eq(WfEscalationChain::getTenantId, tenantId)
                .eq(WfEscalationChain::getBizModule, bizModule)
                .eq(WfEscalationChain::getStatus, 1)
                .le(WfEscalationChain::getTimeoutMinutes, timeoutMinutes)
                .orderByAsc(WfEscalationChain::getLevelNo));
        if (!chains.isEmpty() || "system".equals(bizModule)) {
            return chains;
        }
        return escalationChainMapper.selectList(new LambdaQueryWrapper<WfEscalationChain>()
                .eq(WfEscalationChain::getTenantId, tenantId)
                .eq(WfEscalationChain::getBizModule, "system")
                .eq(WfEscalationChain::getStatus, 1)
                .le(WfEscalationChain::getTimeoutMinutes, timeoutMinutes)
                .orderByAsc(WfEscalationChain::getLevelNo));
    }

    private WfEscalationLog buildEscalationLog(Long tenantId,
                                               TaskMonitor monitor,
                                               WfProcessInstance instance,
                                               String bizModule,
                                               WfEscalationChain chain,
                                               EscalationTarget target) {
        WfEscalationLog log = new WfEscalationLog();
        log.setTenantId(tenantId);
        log.setTaskId(monitor.getTaskId());
        log.setInstanceId(instance != null ? instance.getInstanceId() : monitor.getInstanceId());
        log.setBizModule(bizModule);
        log.setLevelNo(chain.getLevelNo());
        log.setActionType(chain.getActionType());
        log.setActionTarget(chain.getActionTarget());
        log.setTargetUserId(target.userId());
        log.setTargetUserName(target.userName());
        log.setTriggerAt(LocalDateTime.now());
        log.setCreateTime(LocalDateTime.now());
        return log;
    }

    private void applyEscalationAction(WfEscalationChain chain, TaskMonitor monitor, WfTask task, EscalationTarget target) {
        if (target.userId() == null) {
            log.warn("超时升级未找到目标用户: taskId={}, levelNo={}, actionTarget={}",
                    monitor.getTaskId(), chain.getLevelNo(), chain.getActionTarget());
            return;
        }

        if ("REASSIGN".equalsIgnoreCase(chain.getActionType()) && task != null && "TODO".equals(task.getStatus())) {
            task.setAssignee(target.userId());
            task.setAssigneeName(target.userName());
            task.setIsTimeout(1);
            wfTaskMapper.updateById(task);

            monitor.setAssigneeId(target.userId());
            monitor.setAssigneeName(target.userName());
            monitor.setAction("ESCALATE_REASSIGN");
            monitor.setUpdateTime(LocalDateTime.now());
            taskMonitorMapper.updateById(monitor);
        } else if (task != null) {
            task.setIsTimeout(1);
            wfTaskMapper.updateById(task);
        }

        notificationService.sendNotification(
                target.userId(),
                "任务超时升级提醒",
                buildEscalationContent(chain, monitor, target),
                EVENT_TIMEOUT_TASK
        );
    }

    private String buildEscalationContent(WfEscalationChain chain, TaskMonitor monitor, EscalationTarget target) {
        return String.format("任务【%s】已触发第%d级超时升级，动作=%s，目标处理人=%s，请及时处理。",
                monitor.getTaskName(),
                chain.getLevelNo(),
                chain.getActionType(),
                target.userName() != null ? target.userName() : target.userId());
    }

    private EscalationTarget resolveEscalationTarget(WfEscalationChain chain,
                                                    TaskMonitor monitor,
                                                    WfTask task,
                                                    WfProcessInstance instance) {
        String target = chain.getActionTarget();
        if (!StringUtils.hasText(target) || "CURRENT_ASSIGNEE".equalsIgnoreCase(target)) {
            return userTarget(monitor.getAssigneeId(), monitor.getAssigneeName(), monitor.getTenantId());
        }
        if ("DIRECT_LEADER".equalsIgnoreCase(target)) {
            return directLeaderTarget(monitor.getAssigneeId(), monitor.getTenantId());
        }
        if ("STARTER".equalsIgnoreCase(target)) {
            return instance == null
                    ? new EscalationTarget(null, null)
                    : userTarget(instance.getStartUserId(), instance.getStartUserName(), instance.getTenantId());
        }
        if ("STARTER_DIRECT_LEADER".equalsIgnoreCase(target)) {
            return instance == null
                    ? new EscalationTarget(null, null)
                    : directLeaderTarget(instance.getStartUserId(), instance.getTenantId());
        }
        if (target.startsWith("USER:")) {
            return userTarget(parseLong(target.substring("USER:".length())), null, monitor.getTenantId());
        }
        if (target.startsWith("ROLE:")) {
            return roleTarget(target.substring("ROLE:".length()), monitor.getTenantId());
        }
        if (task != null && task.getAssignee() != null) {
            return userTarget(task.getAssignee(), task.getAssigneeName(), task.getTenantId());
        }
        return userTarget(monitor.getAssigneeId(), monitor.getAssigneeName(), monitor.getTenantId());
    }

    private EscalationTarget userTarget(Long userId, String fallbackName, Long tenantId) {
        if (userId == null) {
            return new EscalationTarget(null, null);
        }
        SysUser user = selectActiveUser(userId, tenantId);
        return new EscalationTarget(userId, user == null ? fallbackName : resolveUserName(user));
    }

    private EscalationTarget directLeaderTarget(Long sourceUserId, Long tenantId) {
        SysUser sourceUser = selectActiveUser(sourceUserId, tenantId);
        if (sourceUser == null || sourceUser.getDeptId() == null) {
            return new EscalationTarget(null, null);
        }
        SysDept dept = sysDeptMapper.selectById(sourceUser.getDeptId());
        SysUser leader = resolveLeaderFromDept(dept, tenantId);
        if (leader == null) {
            leader = resolveFirstRoleUser("manager", tenantId, sourceUser.getDeptId());
        }
        return leader == null
                ? new EscalationTarget(null, null)
                : new EscalationTarget(leader.getUserId(), resolveUserName(leader));
    }

    private EscalationTarget roleTarget(String roleKey, Long tenantId) {
        SysUser user = resolveFirstRoleUser(roleKey, tenantId, null);
        return user == null
                ? new EscalationTarget(null, null)
                : new EscalationTarget(user.getUserId(), resolveUserName(user));
    }

    private SysUser resolveLeaderFromDept(SysDept dept, Long tenantId) {
        if (dept == null || !StringUtils.hasText(dept.getLeader())) {
            return null;
        }
        String leader = dept.getLeader().trim();
        Long leaderId = parseLong(leader);
        if (leaderId != null) {
            return selectActiveUser(leaderId, tenantId);
        }
        return sysUserMapper.selectPage(new Page<>(1, 1, false), activeUserWrapper(tenantId)
                .and(query -> query.eq(SysUser::getUserName, leader).or().eq(SysUser::getNickName, leader)))
                .getRecords().stream().findFirst().orElse(null);
    }

    private SysUser resolveFirstRoleUser(String roleKey, Long tenantId, Long deptId) {
        if (!StringUtils.hasText(roleKey)) {
            return null;
        }
        SysRole role = sysRoleMapper.selectPage(new Page<>(1, 1, false), new LambdaQueryWrapper<SysRole>()
                .eq(SysRole::getTenantId, tenantId)
                .eq(SysRole::getRoleKey, roleKey)
                .eq(SysRole::getStatus, "0")
                .eq(SysRole::getDeleted, 0))
                .getRecords().stream().findFirst().orElse(null);
        if (role == null) {
            return null;
        }
        List<Long> userIds = sysUserRoleMapper.selectList(new LambdaQueryWrapper<SysUserRole>()
                        .eq(SysUserRole::getTenantId, tenantId)
                        .eq(SysUserRole::getRoleId, role.getRoleId()))
                .stream()
                .map(SysUserRole::getUserId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (userIds.isEmpty()) {
            return null;
        }
        LambdaQueryWrapper<SysUser> wrapper = activeUserWrapper(tenantId)
                .in(SysUser::getUserId, userIds)
                .orderByAsc(SysUser::getUserId);
        if (deptId != null) {
            wrapper.eq(SysUser::getDeptId, deptId);
        }
        return sysUserMapper.selectPage(new Page<>(1, 1, false), wrapper)
                .getRecords().stream().findFirst().orElse(null);
    }

    private SysUser selectActiveUser(Long userId, Long tenantId) {
        if (userId == null) {
            return null;
        }
        return sysUserMapper.selectPage(new Page<>(1, 1, false), activeUserWrapper(tenantId)
                .eq(SysUser::getUserId, userId))
                .getRecords().stream().findFirst().orElse(null);
    }

    private LambdaQueryWrapper<SysUser> activeUserWrapper(Long tenantId) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getStatus, "0")
                .eq(SysUser::getDeleted, 0);
        if (tenantId != null) {
            wrapper.eq(SysUser::getTenantId, tenantId);
        }
        return wrapper;
    }

    private String resolveUserName(SysUser user) {
        if (user == null) {
            return null;
        }
        if (StringUtils.hasText(user.getNickName())) {
            return user.getNickName();
        }
        if (StringUtils.hasText(user.getUserName())) {
            return user.getUserName();
        }
        return String.valueOf(user.getUserId());
    }

    private Long parseLong(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return Long.valueOf(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String resolveBizModule(WfProcessInstance instance) {
        if (instance == null) {
            return "workflow";
        }
        String businessType = resolveBusinessTypeFromVariables(instance.getVariables());
        if (StringUtils.hasText(businessType)) {
            BusinessTypeDef def = businessTypeRegistry.get(businessType);
            if (def != null && StringUtils.hasText(def.getModule())) {
                return normalizeBizModule(def.getModule());
            }
            return normalizeBizModule(businessType);
        }
        return normalizeBizModule(instance.getProcessDefKey());
    }

    private String resolveBusinessTypeFromVariables(String variables) {
        if (!StringUtils.hasText(variables)) {
            return null;
        }
        try {
            Map<String, Object> values = objectMapper.readValue(variables, new TypeReference<>() {});
            Object businessType = values.get("businessType");
            if (businessType == null) {
                businessType = values.get("bizModule");
            }
            if (businessType == null) {
                businessType = values.get("sourceModule");
            }
            return businessType == null ? null : String.valueOf(businessType);
        } catch (Exception e) {
            log.debug("解析流程变量业务模块失败: {}", e.getMessage());
            return null;
        }
    }

    private String normalizeBizModule(String value) {
        if (!StringUtils.hasText(value)) {
            return "workflow";
        }
        String normalized = value.trim().toLowerCase();
        if (normalized.startsWith("oa") || normalized.contains("_oa_")) {
            return "oa";
        }
        if (normalized.startsWith("crm") || normalized.contains("_crm_")) {
            return "crm";
        }
        if (normalized.startsWith("hr") || normalized.contains("_hr_") || normalized.startsWith("wf_hr")) {
            return "hr";
        }
        if (normalized.startsWith("auth") || normalized.startsWith("sys_")) {
            return "auth";
        }
        if (normalized.startsWith("workflow") || normalized.startsWith("wf_")) {
            return "workflow";
        }
        if (normalized.startsWith("system")) {
            return "system";
        }
        return "workflow";
    }

    private record EscalationTarget(Long userId, String userName) {
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
                alert.setAssigneeId(process.getStartUserId());
                alert.setAssigneeName(process.getStartUserName());
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
            Long recipientId = resolveRecipientId(alert);
            if (recipientId == null) {
                log.warn("超时告警未找到通知接收人: alertId={}, type={}, targetId={}",
                        alert.getId(), alert.getAlertType(), alert.getTargetId());
                return;
            }

            String message = buildAlertMessage(alert);
            log.warn("[超时告警] {}", message);

            notificationService.sendNotification(
                    recipientId,
                    buildAlertTitle(alert),
                    buildAlertNoticeContent(alert),
                    resolveEventType(alert)
            );

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
        if (duration >= criticalThreshold()) {
            return "CRITICAL";
        } else if (duration >= warningThreshold()) {
            return "WARNING";
        } else if (duration >= remindThreshold()) {
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
                return remindThreshold();
            case "WARNING":
                return warningThreshold();
            case "CRITICAL":
                return criticalThreshold();
            default:
                return remindThreshold();
        }
    }

    private long remindThreshold() {
        return runtimeSysConfigService.getLong(SysConfigKeys.WORKFLOW_TIMEOUT_REMIND_THRESHOLD_MS, 3600000L);
    }

    private long warningThreshold() {
        return runtimeSysConfigService.getLong(SysConfigKeys.WORKFLOW_TIMEOUT_WARNING_THRESHOLD_MS, 7200000L);
    }

    private long criticalThreshold() {
        return runtimeSysConfigService.getLong(SysConfigKeys.WORKFLOW_TIMEOUT_CRITICAL_THRESHOLD_MS, 14400000L);
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

    private String buildAlertTitle(TimeoutAlert alert) {
        return "TASK".equals(alert.getAlertType()) ? "任务超时提醒" : "流程超时提醒";
    }

    private String buildAlertNoticeContent(TimeoutAlert alert) {
        return String.format("%s【%s】已达到%s级超时，当前超时时长 %s，请尽快处理。",
                "TASK".equals(alert.getAlertType()) ? "任务" : "流程",
                alert.getTargetName(),
                resolveLevelLabel(alert.getTimeoutLevel()),
                formatDuration(alert.getTimeoutDuration()));
    }

    private String resolveEventType(TimeoutAlert alert) {
        return "TASK".equals(alert.getAlertType()) ? EVENT_TIMEOUT_TASK : EVENT_TIMEOUT_PROCESS;
    }

    private String resolveLevelLabel(String level) {
        return switch (level) {
            case "CRITICAL" -> "严重";
            case "WARNING" -> "警告";
            case "REMIND" -> "提醒";
            default -> level;
        };
    }

    private Long resolveRecipientId(TimeoutAlert alert) {
        if (alert.getAssigneeId() != null) {
            return alert.getAssigneeId();
        }
        if ("TASK".equals(alert.getAlertType())) {
            WfTask task = wfTaskMapper.selectById(alert.getTargetId());
            if (task != null && task.getAssignee() != null) {
                alert.setAssigneeId(task.getAssignee());
                alert.setAssigneeName(task.getAssigneeName());
                return task.getAssignee();
            }
            return null;
        }
        WfProcessInstance instance = processInstanceMapper.selectById(alert.getTargetId());
        if (instance != null && instance.getStartUserId() != null) {
            alert.setAssigneeId(instance.getStartUserId());
            alert.setAssigneeName(instance.getStartUserName());
            return instance.getStartUserId();
        }
        return null;
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
