package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.workflow.domain.*;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;
import com.cloudflow.workflow.domain.monitor.TaskMonitor;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.event.WorkflowEventPublisher;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.job.TaskReminderJob;
import com.cloudflow.workflow.mapper.*;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.processor.ApprovalPostProcessor;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.cloudflow.workflow.service.*;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * 任务操作服务实现
 * 从原工作流服务拆分而来，负责任务的完成、驳回、查询、催办等操作
 * 参考 RuoYi-Cloud-Plus IFlwTaskService 设计
 *
 * @author CloudFlow
 */
@Service
public class WfTaskServiceImpl implements IWfTaskService {

    private static final Logger log = LoggerFactory.getLogger(WfTaskServiceImpl.class);

    @Autowired
    private RedissonClient redissonClient;
    @Autowired
    private WfTaskMapper taskMapper;
    @Autowired
    private TaskMonitorMapper taskMonitorMapper;
    @Autowired
    private WfTaskHistoryMapper taskHistoryMapper;
    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;
    @Autowired
    private WfProcessDefinitionMapper processDefinitionMapper;
    @Autowired
    private WfTaskReadMapper taskReadMapper;
    @Autowired
    private WfTaskUrgeMapper taskUrgeMapper;
    @Autowired
    private WfTaskAddSignMapper wfTaskAddSignMapper;
    @Autowired
    private com.cloudflow.workflow.service.monitor.IProcessMonitorService processMonitorService;
    @Autowired
    private SysUserMapper sysUserMapper;
    @Autowired
    private WorkflowPermissionService permissionService;
    @Autowired
    private RateLimiterService rateLimiterService;
    @Autowired
    private WorkflowAuditService auditService;
    @Autowired
    private WorkflowSecurityUtils securityUtils;
    @Autowired
    private ISysNoticeService sysNoticeService;
    @Autowired
    private ICountersignService countersignService;
    @Autowired
    private INodeExecutionService nodeExecutionService;
    @Autowired
    private WorkflowEventPublisher workflowEventPublisher;
    @Autowired
    private ApprovalPostProcessor approvalPostProcessor;
    @Autowired
    private TaskReminderJob taskReminderJob;
    @Autowired
    private WorkflowGraphModelResolver workflowGraphModelResolver;

    private final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> completeTask(String taskId, String action, String comment, Map<String, Object> variables, String delegateUserId) {
        Long currentUserId = UserContext.getUserId();
        log.info("[completeTask] 开始处理任务, taskId={}, action={}, userId={}", taskId, action, currentUserId);

        // 参数校验
        if (!StringUtils.hasText(taskId)) {
            throw WorkflowException.validationError("任务ID不能为空");
        }
        if (!StringUtils.hasText(action)) {
            throw WorkflowException.validationError("操作类型不能为空");
        }
        // 统一动作口径：仅支持 APPROVE/REJECT/DELEGATE，兼容 PASS=APPROVE
        String normalizedAction = normalizeCompleteAction(action);
        if ("DELEGATE".equals(normalizedAction) && !StringUtils.hasText(delegateUserId)) {
            throw WorkflowException.validationError("转办操作必须指定目标用户ID");
        }

        // 限流检查
        rateLimiterService.checkCompleteTaskLimit(currentUserId != null ? currentUserId : 0L);

        RLock lock = redissonClient.getLock("lock:task:" + taskId);
        try {
            if (lock.tryLock(5, 10, TimeUnit.SECONDS)) {
                WfTask task = taskMapper.selectById(taskId);
                if (task == null) {
                    throw WorkflowException.taskNotFound(taskId);
                }

                // 权限校验
                permissionService.checkTaskPermission(task);
                Map<String, Object> editableVariables = normalizeEditableVariables(task, variables, normalizedAction);

                // XSS 过滤
                if (StringUtils.hasText(comment)) {
                    comment = securityUtils.sanitizeXss(comment);
                }

                // 会签任务处理
                if (countersignService.isCountersignTask(task)) {
                    return handleCountersignVote(task, taskId, normalizedAction, comment, editableVariables);
                }

                // 保存历史记录
                WfTaskHistory history = new WfTaskHistory();
                history.setHistoryId(UUID.randomUUID().toString());
                history.setTenantId(task.getTenantId());
                history.setTaskId(task.getTaskId());
                history.setInstanceId(task.getInstanceId());
                history.setNodeName(task.getNodeName());
                history.setNodeKey(task.getNodeKey());
                history.setOperatorId(currentUserId);
                history.setOperatorName(UserContext.getUserName());
                history.setComment(comment);
                history.setAction(normalizedAction);
                history.setCreateTime(LocalDateTime.now());
                applyAdminOverrideMetadata(history, task, currentUserId);

                if (task.getCreateTime() != null) {
                    long durationSeconds = java.time.Duration.between(task.getCreateTime(), LocalDateTime.now()).getSeconds();
                    history.setDurationSeconds((int) durationSeconds);
                }
                taskHistoryMapper.insert(history);
                completeTaskMonitor(task, history.getCreateTime(), normalizedAction);

                // 删除当前任务
                taskMapper.deleteById(taskId);
                taskReminderJob.cancelReminders(taskId);
                cleanupTaskReadData(taskId);

                WfProcessInstance instance = requireTaskInstanceForOperation(task, "处理");

                // 保存实例快照
                nodeExecutionService.saveProcessSnapshot(instance, task.getNodeKey(), task.getNodeName());

                // 转办操作
                if ("DELEGATE".equals(normalizedAction)) {
                    return handleDelegate(task, instance, delegateUserId, comment);
                }

                // 拒绝操作
                if ("REJECT".equals(normalizedAction)) {
                    nodeExecutionService.completeInstance(instance, WfProcessStatus.REJECTED.getCode());
                    workflowEventPublisher.publishProcessRejected(instance, task.getNodeName(), comment);
                    notifyInitiator(instance, task.getNodeName(), normalizedAction, comment);
                    return R.ok();
                }

                // 审批通过 - 变量合并
                Map<String, Object> mergedVariables = mergeVariables(instance, editableVariables);

                // 记录变量变更
                if (editableVariables != null && !editableVariables.isEmpty()) {
                    try {
                        history.setVariablesChanged(mergeHistoryMetadata(history.getVariablesChanged(), editableVariables));
                        taskHistoryMapper.updateById(history);
                    } catch (Exception e) {
                        log.warn("[completeTask] 记录变量变更失败: {}", e.getMessage());
                    }
                }

                // 流程流转
                WfProcessDefinition def = resolveDefinitionByInstance(instance);
                WfNodeConfig completedNode = null;

                try {
                    if (def != null && StringUtils.hasText(def.getModelJson())) {
                        WfNodeConfig root = workflowGraphModelResolver.parseRuntimeRoot(def.getModelJson());
                        completedNode = nodeExecutionService.findNode(root, task.getNodeKey());
                        nodeExecutionService.advanceAfterNode(instance, completedNode, task.getNodeKey(), mergedVariables, 0, root);
                    } else {
                        nodeExecutionService.completeInstance(instance, WfProcessStatus.COMPLETED.getCode());
                    }
                } catch (WorkflowException e) {
                    throw e;
                } catch (Exception e) {
                    log.error("[completeTask] 流程流转失败, taskId={}, error={}", taskId, e.getMessage(), e);
                    throw new WorkflowException("TASK_FLOW_FAILED", "流程流转失败: " + e.getMessage(), e);
                }

                // 审批后置处理
                try {
                    if (completedNode != null) {
                        approvalPostProcessor.process(completedNode, instance, normalizedAction, mergedVariables);
                    }
                } catch (Exception e) {
                    log.warn("[completeTask] 审批后置处理失败, taskId={}: {}", taskId, e.getMessage());
                }

                notifyInitiator(instance, task.getNodeName(), normalizedAction, comment);
                auditService.log(WorkflowAuditService.AuditAction.TASK_COMPLETE, taskId,
                    "action=" + normalizedAction + ", nodeName=" + task.getNodeName());
                workflowEventPublisher.publishTaskCompleted(instance, taskId, task.getNodeKey(), task.getNodeName(), normalizedAction, comment);

                return R.ok();
            } else {
                throw WorkflowException.invalidState("任务处理中，请勿重复提交");
            }
        } catch (WorkflowException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new WorkflowException("SYSTEM_BUSY", "系统繁忙，请稍后重试");
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> rejectTask(String taskId, String targetNodeKey, String comment) {
        log.info("[rejectTask] 开始驳回任务, taskId={}, targetNodeKey={}", taskId, targetNodeKey);

        if (!StringUtils.hasText(taskId)) {
            throw WorkflowException.validationError("任务ID不能为空");
        }
        if (!StringUtils.hasText(targetNodeKey)) {
            throw WorkflowException.validationError("目标节点Key不能为空");
        }
        if (!StringUtils.hasText(comment)) {
            throw WorkflowException.validationError("驳回原因不能为空，请填写驳回理由");
        }

        RLock lock = redissonClient.getLock("lock:task:" + taskId);
        try {
            if (!lock.tryLock(5, 10, TimeUnit.SECONDS)) {
                throw WorkflowException.invalidState("任务处理中，请勿重复提交");
            }

            WfTask task = taskMapper.selectById(taskId);
            if (task == null) {
                throw WorkflowException.taskNotFound(taskId);
            }

            permissionService.checkRejectPermission(task);
            validateRejectTarget(task.getInstanceId(), task.getNodeKey(), targetNodeKey);

            // 保存驳回历史
            WfTaskHistory history = new WfTaskHistory();
            history.setHistoryId(UUID.randomUUID().toString());
            history.setTenantId(task.getTenantId());
            history.setTaskId(task.getTaskId());
            history.setInstanceId(task.getInstanceId());
            history.setNodeName(task.getNodeName());
            history.setNodeKey(task.getNodeKey());
            history.setOperatorId(UserContext.getUserId());
            history.setOperatorName(UserContext.getUserName());
            history.setComment(comment);
            history.setAction("REJECT");
            history.setCreateTime(LocalDateTime.now());
            applyAdminOverrideMetadata(history, task, UserContext.getUserId());

            try {
                Map<String, Object> rejectDetail = new HashMap<>();
                rejectDetail.put("type", "REJECT");
                rejectDetail.put("sourceNodeKey", task.getNodeKey());
                rejectDetail.put("targetNodeKey", targetNodeKey);
                rejectDetail.put("reason", comment);
                history.setVariablesChanged(mergeHistoryMetadata(history.getVariablesChanged(), rejectDetail));
            } catch (Exception e) {
                log.warn("[rejectTask] 序列化驳回详情失败: {}", e.getMessage());
            }

            if (task.getCreateTime() != null) {
                long durationSeconds = java.time.Duration.between(task.getCreateTime(), LocalDateTime.now()).getSeconds();
                history.setDurationSeconds((int) durationSeconds);
            }
            taskHistoryMapper.insert(history);
            completeTaskMonitor(task, history.getCreateTime(), "REJECT");

            // 删除当前任务
            taskMapper.deleteById(taskId);
            taskReminderJob.cancelReminders(taskId);
            cleanupTaskReadData(taskId);

            // 在目标节点创建新任务
            WfProcessInstance instance = requireTaskInstanceForOperation(task, "驳回");

            WfProcessDefinition def = resolveDefinitionByInstance(instance);
            if (def == null || !StringUtils.hasText(def.getModelJson())) {
                throw WorkflowException.processNotFound(instance.getProcessDefKey());
            }

            try {
                WfNodeConfig root = workflowGraphModelResolver.parseRuntimeRoot(def.getModelJson());
                WfNodeConfig targetNode = nodeExecutionService.findNode(root, targetNodeKey);
                if (targetNode == null) {
                    throw WorkflowException.validationError("目标节点不存在: " + targetNodeKey);
                }
                nodeExecutionService.runNode(instance, targetNode, null, 0, root);
            } catch (WorkflowException e) {
                throw e;
            } catch (Exception e) {
                throw new WorkflowException("REJECT_FAILED", "驳回失败: " + e.getMessage(), e);
            }

            auditService.log(WorkflowAuditService.AuditAction.TASK_REJECT, taskId, "targetNodeKey=" + targetNodeKey);
            return R.ok();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new WorkflowException("SYSTEM_BUSY", "系统繁忙，请稍后重试");
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    @Override
    public PageResult<WfTask> getTodoTasks(Long userId, PageQuery pageQuery) {
        log.info("[getTodoTasks] 查询待办任务, userId={}", userId);
        Long currentTenantId = UserContext.getTenantId();
        Map<String, Object> params = pageQuery.getParams() != null ? pageQuery.getParams() : Collections.emptyMap();

        // 提取搜索条件
        String keyword = Objects.toString(params.get("keyword"), null);
        String processDefKey = Objects.toString(params.get("processDefKey"), null);
        String startTimeFrom = Objects.toString(params.get("startTimeFrom"), null);
        String startTimeTo = Objects.toString(params.get("startTimeTo"), null);
        String startUserName = Objects.toString(params.get("startUserName"), null);

        // 实例筛选
        List<String> filteredInstanceIds = null;
        boolean hasInstanceFilter = StringUtils.hasText(keyword) || StringUtils.hasText(processDefKey) || StringUtils.hasText(startUserName);

        if (hasInstanceFilter) {
            LambdaQueryWrapper<WfProcessInstance> instanceWrapper = new LambdaQueryWrapper<>();
            instanceWrapper.eq(WfProcessInstance::getStatus, WfProcessStatus.RUNNING.getCode());
            if (currentTenantId != null) {
                instanceWrapper.eq(WfProcessInstance::getTenantId, currentTenantId);
            }
            if (StringUtils.hasText(keyword)) {
                instanceWrapper.and(w -> w.like(WfProcessInstance::getTitle, keyword).or().like(WfProcessInstance::getProcessNo, keyword));
            }
            if (StringUtils.hasText(processDefKey)) {
                instanceWrapper.eq(WfProcessInstance::getProcessDefKey, processDefKey);
            }
            if (StringUtils.hasText(startUserName)) {
                instanceWrapper.like(WfProcessInstance::getStartUserName, startUserName);
            }
            instanceWrapper.select(WfProcessInstance::getInstanceId);
            List<WfProcessInstance> matchedInstances = processInstanceMapper.selectList(instanceWrapper);
            filteredInstanceIds = matchedInstances.stream().map(WfProcessInstance::getInstanceId).collect(Collectors.toList());
            if (filteredInstanceIds.isEmpty()) {
                return new PageResult<>(new ArrayList<>(), 0L, (long) pageQuery.getPageNum(), (long) pageQuery.getPageSize());
            }
        }

        Page<WfTask> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<WfTask> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(WfTask::getAssignee, userId);
        queryWrapper.eq(WfTask::getStatus, WfTaskStatus.TODO.getCode());
        if (currentTenantId != null) {
            queryWrapper.eq(WfTask::getTenantId, currentTenantId);
        }

        if (filteredInstanceIds != null) {
            queryWrapper.in(WfTask::getInstanceId, filteredInstanceIds);
        }

        // 时间范围筛选
        if (StringUtils.hasText(startTimeFrom)) {
            try {
                LocalDateTime fromDate = java.time.LocalDate.parse(startTimeFrom, DateTimeFormatter.ofPattern("yyyy-MM-dd")).atStartOfDay();
                queryWrapper.ge(WfTask::getCreateTime, fromDate);
            } catch (Exception e) { log.warn("[getTodoTasks] 解析开始时间失败"); }
        }
        if (StringUtils.hasText(startTimeTo)) {
            try {
                LocalDateTime toDate = java.time.LocalDate.parse(startTimeTo, DateTimeFormatter.ofPattern("yyyy-MM-dd")).atStartOfDay();
                LocalDateTime endOfDay = toDate.withHour(23).withMinute(59).withSecond(59);
                queryWrapper.le(WfTask::getCreateTime, endOfDay);
            } catch (Exception e) { log.warn("[getTodoTasks] 解析结束时间失败"); }
        }

        queryWrapper.orderByDesc(WfTask::getCreateTime);
        Page<WfTask> resultPage = taskMapper.selectPage(page, queryWrapper);
        List<WfTask> tasks = resultPage.getRecords();

        if (tasks != null && !tasks.isEmpty()) {
            enrichTodoTasks(tasks, userId);
        }

        return new PageResult<>(tasks, resultPage.getTotal(), resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    public PageResult<WfTask> getDoneTasks(Long userId, PageQuery pageQuery) {
        log.info("[getDoneTasks] 查询已办任务, userId={}", userId);
        Long currentTenantId = UserContext.getTenantId();
        Map<String, Object> params = pageQuery.getParams() != null ? pageQuery.getParams() : Collections.emptyMap();

        String keyword = Objects.toString(params.get("keyword"), null);
        String processDefKey = Objects.toString(params.get("processDefKey"), null);
        String startTimeFrom = Objects.toString(params.get("startTimeFrom"), null);
        String startTimeTo = Objects.toString(params.get("startTimeTo"), null);
        String startUserName = Objects.toString(params.get("startUserName"), null);

        List<String> filteredInstanceIds = null;
        boolean hasInstanceFilter = StringUtils.hasText(keyword) || StringUtils.hasText(processDefKey) || StringUtils.hasText(startUserName);
        if (hasInstanceFilter) {
            LambdaQueryWrapper<WfProcessInstance> instanceWrapper = new LambdaQueryWrapper<>();
            if (currentTenantId != null) {
                instanceWrapper.eq(WfProcessInstance::getTenantId, currentTenantId);
            }
            if (StringUtils.hasText(keyword)) {
                instanceWrapper.and(w -> w.like(WfProcessInstance::getTitle, keyword).or().like(WfProcessInstance::getProcessNo, keyword));
            }
            if (StringUtils.hasText(processDefKey)) {
                instanceWrapper.eq(WfProcessInstance::getProcessDefKey, processDefKey);
            }
            if (StringUtils.hasText(startUserName)) {
                instanceWrapper.like(WfProcessInstance::getStartUserName, startUserName);
            }
            instanceWrapper.select(WfProcessInstance::getInstanceId);
            List<WfProcessInstance> matchedInstances = processInstanceMapper.selectList(instanceWrapper);
            filteredInstanceIds = matchedInstances.stream().map(WfProcessInstance::getInstanceId).collect(Collectors.toList());
            if (filteredInstanceIds.isEmpty()) {
                return new PageResult<>(new ArrayList<>(), 0L, (long) pageQuery.getPageNum(), (long) pageQuery.getPageSize());
            }
        }

        Page<WfTaskHistory> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<WfTaskHistory> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WfTaskHistory::getOperatorId, userId);
        if (currentTenantId != null) {
            wrapper.eq(WfTaskHistory::getTenantId, currentTenantId);
        }
        if (filteredInstanceIds != null) {
            wrapper.in(WfTaskHistory::getInstanceId, filteredInstanceIds);
        }
        if (StringUtils.hasText(startTimeFrom)) {
            try {
                LocalDateTime fromDate = java.time.LocalDate.parse(startTimeFrom, DateTimeFormatter.ofPattern("yyyy-MM-dd")).atStartOfDay();
                wrapper.ge(WfTaskHistory::getCreateTime, fromDate);
            } catch (Exception e) { log.warn("[getDoneTasks] 解析开始时间失败"); }
        }
        if (StringUtils.hasText(startTimeTo)) {
            try {
                LocalDateTime toDate = java.time.LocalDate.parse(startTimeTo, DateTimeFormatter.ofPattern("yyyy-MM-dd")).atStartOfDay();
                wrapper.le(WfTaskHistory::getCreateTime, toDate.withHour(23).withMinute(59).withSecond(59));
            } catch (Exception e) { log.warn("[getDoneTasks] 解析结束时间失败"); }
        }
        wrapper.orderByDesc(WfTaskHistory::getCreateTime);
        Page<WfTaskHistory> resultPage = taskHistoryMapper.selectPage(page, wrapper);
        List<WfTask> tasks = toDoneTasks(resultPage.getRecords());
        enrichDoneTasks(tasks);
        return new PageResult<>(tasks, resultPage.getTotal(), resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void readTask(String taskId, Long userId) {
        WfTask task = taskMapper.selectById(taskId);
        if (task == null) {
            markCompletedTaskReadAsNoop(taskId, userId);
            return;
        }
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && !Objects.equals(currentTenantId, task.getTenantId())) {
            throw new PermissionDeniedException("无权访问该租户任务");
        }
        if (task.getAssignee() != null && !task.getAssignee().equals(userId) && !permissionService.isAdmin(userId)) {
            throw new PermissionDeniedException("您不是此任务的处理人，无法标记已读");
        }

        Long count = taskReadMapper.selectCount(new LambdaQueryWrapper<WfTaskRead>()
                .eq(WfTaskRead::getTenantId, task.getTenantId())
                .eq(WfTaskRead::getTaskId, taskId)
                .eq(WfTaskRead::getUserId, userId));
        if (count == 0) {
            WfTaskRead read = new WfTaskRead();
            read.setTenantId(task.getTenantId());
            read.setTaskId(taskId);
            read.setUserId(userId);
            read.setReadTime(LocalDateTime.now());
            taskReadMapper.insert(read);
        }
    }

    private void markCompletedTaskReadAsNoop(String taskId, Long userId) {
        WfTaskHistory history = taskHistoryMapper.selectOne(new LambdaQueryWrapper<WfTaskHistory>()
                .eq(WfTaskHistory::getTaskId, taskId)
                .orderByDesc(WfTaskHistory::getCreateTime)
                .last("LIMIT 1"));
        if (history == null) {
            throw WorkflowException.taskNotFound(taskId);
        }
        WfProcessInstance instance = processInstanceMapper.selectById(history.getInstanceId());
        if (instance == null) {
            throw WorkflowException.instanceNotFound(history.getInstanceId());
        }
        permissionService.checkViewInstancePermission(instance);
        log.debug("[readTask] 任务已完成，跳过已读标记, taskId={}, userId={}", taskId, userId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> urgeTask(String taskId, String reason) {
        Long currentUserId = UserContext.getUserId();
        if (!StringUtils.hasText(taskId)) {
            throw WorkflowException.validationError("任务ID不能为空");
        }

        rateLimiterService.checkUrgeTaskLimit(currentUserId != null ? currentUserId : 0L);

        WfTask task = taskMapper.selectById(taskId);
        if (task == null) {
            throw WorkflowException.taskNotFound(taskId);
        }

        WfProcessInstance instance = requireTaskInstanceForOperation(task, "催办");

        permissionService.checkUrgePermission(instance);

        WfTaskUrge urge = new WfTaskUrge();
        urge.setTenantId(instance.getTenantId());
        urge.setTaskId(taskId);
        urge.setSenderId(currentUserId);
        urge.setRecipientId(task.getAssignee());
        urge.setReason(reason);
        urge.setCreateTime(LocalDateTime.now());
        taskUrgeMapper.insert(urge);

        sysNoticeService.sendNotice(task.getAssignee(), "任务催办提醒",
            "发起人催办了任务: " + task.getNodeName() + "，原因: " + (StringUtils.hasText(reason) ? reason : "无"),
            "2", currentUserId, UserContext.getUserName());

        return R.ok();
    }

    // ==================== 私有方法 ====================

    /**
     * 标准化完成任务动作，避免未知动作被误当成"同意"执行。
     * 兼容历史 PASS（等价 APPROVE）。
     */
    private String normalizeCompleteAction(String action) {
        String normalized = action.trim().toUpperCase(Locale.ROOT);
        if ("PASS".equals(normalized)) {
            return "APPROVE";
        }
        if ("APPROVE".equals(normalized) || "REJECT".equals(normalized) || "DELEGATE".equals(normalized)) {
            return normalized;
        }
        throw WorkflowException.validationError("不支持的操作类型: " + action + "，仅支持 APPROVE/REJECT/DELEGATE");
    }

    /**
     * 处理转办操作
     */
    private R<?> handleDelegate(WfTask task, WfProcessInstance instance, String delegateUserId, String comment) {
        Long delegateId;
        try {
            delegateId = Long.valueOf(delegateUserId);
        } catch (Exception e) {
            throw WorkflowException.validationError("转办目标用户ID格式非法: " + delegateUserId);
        }

        SysUser delegateUser = sysUserMapper.selectById(delegateId);
        if (delegateUser == null) {
            throw WorkflowException.validationError("转办目标用户不存在: " + delegateUserId);
        }
        String delegateUserName = StringUtils.hasText(delegateUser.getNickName())
            ? delegateUser.getNickName()
            : delegateUser.getUserName();

        WfTask newTask = new WfTask();
        newTask.setTaskId(UUID.randomUUID().toString());
        newTask.setInstanceId(task.getInstanceId());
        newTask.setNodeName(task.getNodeName());
        newTask.setNodeKey(task.getNodeKey());
        newTask.setAssignee(delegateId);
        newTask.setAssigneeName(delegateUserName);
        newTask.setTenantId(task.getTenantId());
        newTask.setStatus(WfTaskStatus.TODO.getCode());
        newTask.setCreateTime(LocalDateTime.now());
        taskMapper.insert(newTask);
        createTaskMonitor(instance, newTask);

        sysNoticeService.sendNotice(delegateId, "任务转办通知",
            String.format("您收到一个转办任务: %s (流程: %s)", task.getNodeName(), instance.getTitle()),
            "1", UserContext.getUserId(), UserContext.getUserName());

        notifyInitiator(instance, task.getNodeName(), "DELEGATE", comment);
        auditService.log(WorkflowAuditService.AuditAction.TASK_COMPLETE, task.getTaskId(), "action=DELEGATE, delegateUserId=" + delegateUserId);
        return R.ok();
    }

    /**
     * 处理会签投票
     */
    private R<?> handleCountersignVote(WfTask task, String taskId, String action, String comment, Map<String, Object> variables) {
        Long currentUserId = UserContext.getUserId();
        String userName = UserContext.getUserName();
        if (!"APPROVE".equals(action) && !"REJECT".equals(action)) {
            throw WorkflowException.validationError("会签任务仅支持同意或拒绝操作");
        }
        String voteResult = action;

        String countersignResult = countersignService.vote(taskId, currentUserId, userName, voteResult, comment);

        WfTaskHistory history = new WfTaskHistory();
        history.setHistoryId(UUID.randomUUID().toString());
        history.setTenantId(task.getTenantId());
        history.setTaskId(taskId);
        history.setInstanceId(task.getInstanceId());
        history.setNodeName(task.getNodeName());
        history.setNodeKey(task.getNodeKey());
        history.setOperatorId(currentUserId);
        history.setOperatorName(userName);
        history.setComment(comment);
        history.setAction("COUNTERSIGN_" + voteResult);
        history.setCreateTime(LocalDateTime.now());
        applyAdminOverrideMetadata(history, task, currentUserId);
        if (task.getCreateTime() != null) {
            history.setDurationSeconds((int) java.time.Duration.between(task.getCreateTime(), LocalDateTime.now()).getSeconds());
        }
        taskHistoryMapper.insert(history);
        completeTaskMonitor(task, history.getCreateTime(), "COUNTERSIGN_" + voteResult);

        if ("PASSED".equals(countersignResult) || "REJECTED".equals(countersignResult)) {
            WfProcessInstance instance = requireTaskInstanceForOperation(task, "会签处理");
            nodeExecutionService.saveProcessSnapshot(instance, task.getNodeKey(), task.getNodeName());

            if ("REJECTED".equals(countersignResult)) {
                nodeExecutionService.completeInstance(instance, WfProcessStatus.REJECTED.getCode());
                notifyInitiator(instance, task.getNodeName(), "REJECT", "会签未通过");
            } else {
                Map<String, Object> mergedVariables = mergeVariables(instance, variables);
                WfProcessDefinition def = resolveDefinitionByInstance(instance);
                try {
                    if (def != null && StringUtils.hasText(def.getModelJson())) {
                        WfNodeConfig root = workflowGraphModelResolver.parseRuntimeRoot(def.getModelJson());
                        WfNodeConfig nextNode = nodeExecutionService.findNextNode(root, task.getNodeKey());
                        if (nextNode != null) {
                            nodeExecutionService.runNode(instance, nextNode, mergedVariables, 0, root);
                        } else {
                            nodeExecutionService.completeInstance(instance, WfProcessStatus.COMPLETED.getCode());
                        }
                    } else {
                        nodeExecutionService.completeInstance(instance, WfProcessStatus.COMPLETED.getCode());
                    }
                } catch (Exception e) {
                    throw new WorkflowException("COUNTERSIGN_FLOW_FAILED", "会签后流程流转失败: " + e.getMessage(), e);
                }
                notifyInitiator(instance, task.getNodeName(), "APPROVE", "会签已通过");
            }
            workflowEventPublisher.publishTaskCompleted(instance, taskId, task.getNodeKey(), task.getNodeName(),
                "COUNTERSIGN_" + voteResult, comment);
        }
        return R.ok(countersignResult);
    }

    /**
     * 严格按实例锁定的 definitionId 读取流程定义。
     */
    private WfProcessDefinition resolveDefinitionByInstance(WfProcessInstance instance) {
        if (instance == null) {
            return null;
        }
        if (!StringUtils.hasText(instance.getDefinitionId())) {
            log.warn("[resolveDefinitionByInstance] instanceId={} 缺少 definitionId，无法按实例版本解析",
                instance.getInstanceId());
            return null;
        }
        WfProcessDefinition byId = processDefinitionMapper.selectById(instance.getDefinitionId());
        if (byId == null) {
            log.warn("[resolveDefinitionByInstance] definitionId={} 不存在，无法按实例版本解析",
                instance.getDefinitionId());
        }
        return byId;
    }

    /**
     * 合并审批变量与实例变量
     */
    private Map<String, Object> mergeVariables(WfProcessInstance instance, Map<String, Object> newVariables) {
        Map<String, Object> instanceVars = new HashMap<>();
        if (StringUtils.hasText(instance.getVariables())) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> parsedVars = objectMapper.readValue(instance.getVariables(), Map.class);
                instanceVars = parsedVars;
            } catch (Exception e) { log.warn("[mergeVariables] 反序列化失败"); }
        }
        if (newVariables != null && !newVariables.isEmpty()) {
            for (Map.Entry<String, Object> entry : newVariables.entrySet()) {
                if (!entry.getKey().startsWith("_")) {
                    instanceVars.put(entry.getKey(), entry.getValue());
                }
            }
            try {
                instance.setVariables(objectMapper.writeValueAsString(instanceVars));
                processInstanceMapper.updateById(instance);
            } catch (Exception e) { log.warn("[mergeVariables] 更新失败"); }
        }
        return instanceVars;
    }

    /**
     * 仅允许在节点开启 allowEdit 时提交业务变量；系统变量（_前缀）始终忽略。
     */
    private Map<String, Object> normalizeEditableVariables(WfTask task, Map<String, Object> variables, String action) {
        if (variables == null || variables.isEmpty()) {
            return Collections.emptyMap();
        }
        // 仅“同意”动作允许回写变量，拒绝/转办忽略客户端变量，避免误伤历史客户端调用。
        if (!"APPROVE".equalsIgnoreCase(action)) {
            return Collections.emptyMap();
        }

        Map<String, Object> editableVariables = new HashMap<>();
        for (Map.Entry<String, Object> entry : variables.entrySet()) {
            String key = entry.getKey();
            if (StringUtils.hasText(key) && !key.startsWith("_")) {
                editableVariables.put(key, entry.getValue());
            }
        }

        if (editableVariables.isEmpty()) {
            return Collections.emptyMap();
        }

        if (!Boolean.TRUE.equals(task.getAllowEdit())) {
            throw WorkflowException.validationError("当前节点不允许修改表单数据");
        }

        return editableVariables;
    }

    /**
     * 通知发起人审批进度
     */
    private void notifyInitiator(WfProcessInstance instance, String nodeName, String action, String comment) {
        try {
            Long initiatorId = instance.getStartUserId();
            Long currentUserId = UserContext.getUserId();
            if (initiatorId != null && !initiatorId.equals(currentUserId)) {
                String actionText;
                switch (action != null ? action.toUpperCase() : "") {
                    case "APPROVE": actionText = "已通过"; break;
                    case "REJECT": actionText = "已拒绝"; break;
                    case "DELEGATE": actionText = "已转办"; break;
                    default: actionText = "已处理"; break;
                }
                String content = String.format("您发起的流程「%s」在节点「%s」%s", instance.getTitle(), nodeName, actionText);
                if (StringUtils.hasText(comment)) content += "，意见：" + comment;
                sysNoticeService.sendNotice(initiatorId, "审批进度通知", content, "1", currentUserId, UserContext.getUserName());
            }
        } catch (Exception e) {
            log.warn("[notifyInitiator] 通知失败: {}", e.getMessage());
        }
    }

    /**
     * 校验驳回目标节点合法性
     */
    private void validateRejectTarget(String instanceId, String currentNodeKey, String targetNodeKey) {
        List<WfTaskHistory> histories = taskHistoryMapper.selectList(
            new LambdaQueryWrapper<WfTaskHistory>()
                .eq(WfTaskHistory::getInstanceId, instanceId)
                .orderByAsc(WfTaskHistory::getCreateTime));

        List<String> previousNodeKeys = new ArrayList<>();
        for (WfTaskHistory h : histories) {
            String nodeKey = h.getNodeKey();
            if (nodeKey != null && nodeKey.equals(currentNodeKey)) break;
            if (nodeKey != null && !previousNodeKeys.contains(nodeKey)) previousNodeKeys.add(nodeKey);
        }

        if (!previousNodeKeys.contains(targetNodeKey)) {
            throw WorkflowException.validationError("只能驳回到之前已执行过的节点，允许的目标节点: " + String.join(", ", previousNodeKeys));
        }
    }

    /**
     * 清理已读数据
     */
    private void cleanupTaskReadData(String taskId) {
        try {
            taskReadMapper.delete(new LambdaQueryWrapper<WfTaskRead>().eq(WfTaskRead::getTaskId, taskId));
        } catch (Exception e) {
            log.warn("[cleanupTaskReadData] 清理失败: {}", e.getMessage());
        }
    }

    private void applyAdminOverrideMetadata(WfTaskHistory history, WfTask task, Long operatorId) {
        if (history == null || task == null || operatorId == null || task.getAssignee() == null) {
            return;
        }
        if (Objects.equals(task.getAssignee(), operatorId) || !permissionService.isAdmin(operatorId)) {
            return;
        }
        try {
            history.setVariablesChanged(mergeHistoryMetadata(history.getVariablesChanged(), adminOverrideMetadata(task)));
        } catch (Exception e) {
            log.warn("[applyAdminOverrideMetadata] 记录管理员代处理元数据失败, taskId={}, error={}",
                    task.getTaskId(), e.getMessage());
        }
    }

    private Map<String, Object> adminOverrideMetadata(WfTask task) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("adminOverride", true);
        metadata.put("originalAssigneeId", task.getAssignee());
        metadata.put("originalAssigneeName", task.getAssigneeName());
        return metadata;
    }

    private String mergeHistoryMetadata(String existingJson, Map<String, Object> metadata) throws Exception {
        Map<String, Object> merged = new LinkedHashMap<>();
        if (StringUtils.hasText(existingJson)) {
            @SuppressWarnings("unchecked")
            Map<String, Object> existing = objectMapper.readValue(existingJson, Map.class);
            if (existing != null) {
                merged.putAll(existing);
            }
        }
        if (metadata != null && !metadata.isEmpty()) {
            merged.putAll(metadata);
        }
        return objectMapper.writeValueAsString(merged);
    }

    /**
     * 批量填充待办任务的关联信息（流程实例、定义、已读状态、步骤信息、按钮权限）
     */
    private void enrichTodoTasks(List<WfTask> tasks, Long userId) {
        // 批量查询实例
        List<String> instanceIds = tasks.stream().map(WfTask::getInstanceId).distinct().collect(Collectors.toList());
        List<WfProcessInstance> instances = processInstanceMapper.selectBatchIds(instanceIds);
        Map<String, WfProcessInstance> instanceMap = instances.stream()
            .collect(Collectors.toMap(WfProcessInstance::getInstanceId, inst -> inst));

        // 批量查询流程定义（严格按实例 definitionId 锁定）
        List<String> definitionIds = instances.stream()
            .map(WfProcessInstance::getDefinitionId)
            .filter(StringUtils::hasText)
            .distinct()
            .collect(Collectors.toList());
        Map<String, WfProcessDefinition> defById = new HashMap<>();
        if (!definitionIds.isEmpty()) {
            List<WfProcessDefinition> defsById = processDefinitionMapper.selectBatchIds(definitionIds);
            if (defsById != null) {
                for (WfProcessDefinition def : defsById) {
                    if (def != null && StringUtils.hasText(def.getDefinitionId())) {
                        defById.put(def.getDefinitionId(), def);
                    }
                }
            }
        }

        // 批量查询已读状态
        List<String> taskIds = tasks.stream().map(WfTask::getTaskId).collect(Collectors.toList());
        List<WfTaskRead> readRecords = taskReadMapper.selectList(
            new LambdaQueryWrapper<WfTaskRead>().in(WfTaskRead::getTaskId, taskIds).eq(WfTaskRead::getUserId, userId));
        Map<String, WfTaskRead> readMap = readRecords.stream()
            .collect(Collectors.toMap(WfTaskRead::getTaskId, r -> r));

        // 批量查询处理人用户名
        List<Long> assigneeIds = tasks.stream().map(WfTask::getAssignee).filter(Objects::nonNull).distinct().collect(Collectors.toList());
        Map<Long, String> userNameMap = new HashMap<>();
        if (!assigneeIds.isEmpty()) {
            List<SysUser> assigneeUsers = sysUserMapper.selectBatchIds(assigneeIds);
            for (SysUser u : assigneeUsers) {
                userNameMap.put(u.getUserId(), u.getNickName() != null ? u.getNickName() : u.getUserName());
            }
        }

        // 批量查询历史记录（用于步骤信息）
        List<WfTaskHistory> allHistories = taskHistoryMapper.selectList(
            new LambdaQueryWrapper<WfTaskHistory>().in(WfTaskHistory::getInstanceId, instanceIds).orderByAsc(WfTaskHistory::getCreateTime));
        Map<String, List<WfTaskHistory>> historiesByInstance = allHistories.stream()
            .collect(Collectors.groupingBy(WfTaskHistory::getInstanceId));

        // 缓存已解析的步骤列表和节点树
        Map<String, List<Map<String, String>>> stepsCache = new HashMap<>();
        Map<String, WfNodeConfig> rootNodeCache = new HashMap<>();

        for (WfTask task : tasks) {
            WfProcessInstance instance = instanceMap.get(task.getInstanceId());
            if (instance != null) {
                task.setProcessDefKey(instance.getProcessDefKey());
                task.setStartUserId(String.valueOf(instance.getStartUserId()));
                task.setStartUserName(instance.getStartUserName());
                task.setInstanceTitle(instance.getTitle());

                WfProcessDefinition def = resolveDefinitionForInstance(instance, defById);
                if (def != null) {
                    task.setProcessName(def.getProcessName());
                    task.setFormId(def.getFormId());
                }

                if (StringUtils.hasText(instance.getVariables())) {
                    try {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> vars = objectMapper.readValue(instance.getVariables(), Map.class);
                        task.setVariables(vars);
                    } catch (Exception e) { /* 忽略 */ }
                }
            }

            // 填充处理人用户名
            if (task.getAssignee() != null) {
                task.setAssigneeName(userNameMap.getOrDefault(task.getAssignee(), String.valueOf(task.getAssignee())));
            } else {
                task.setAssigneeName("待认领");
            }

            // 设置已读状态
            WfTaskRead readRecord = readMap.get(task.getTaskId());
            if (readRecord != null) {
                task.setIsRead(true);
                task.setReadTime(readRecord.getReadTime());
            } else {
                task.setIsRead(false);
            }

            // 填充步骤信息和按钮权限
            try {
                if (instance == null) continue;
                if (!StringUtils.hasText(instance.getDefinitionId())) {
                    log.warn("[enrichTodoTasks] instanceId={} 缺少 definitionId，跳过步骤信息解析",
                        instance.getInstanceId());
                    continue;
                }
                String definitionCacheKey = "ID:" + instance.getDefinitionId();
                List<Map<String, String>> steps = stepsCache.get(definitionCacheKey);
                if (steps == null) {
                    WfProcessDefinition def = resolveDefinitionForInstance(instance, defById);
                    if (def != null && StringUtils.hasText(def.getModelJson())) {
                        WfNodeConfig root = workflowGraphModelResolver.parseRuntimeRoot(def.getModelJson());
                        steps = nodeExecutionService.extractApprovalSteps(root);
                        stepsCache.put(definitionCacheKey, steps);
                        rootNodeCache.put(definitionCacheKey, root);
                    }
                }

                if (steps != null && !steps.isEmpty()) {
                    List<WfTaskHistory> histories = historiesByInstance.getOrDefault(task.getInstanceId(), new ArrayList<>());
                    enrichTaskStepInfo(task, steps, histories);
                }

                // 提取当前节点的按钮权限
                WfNodeConfig cachedRoot = rootNodeCache.get(definitionCacheKey);
                if (cachedRoot != null && StringUtils.hasText(task.getNodeKey())) {
                    WfNodeConfig currentNode = nodeExecutionService.findNode(cachedRoot, task.getNodeKey());
                    if (currentNode != null) {
                        List<String> nodeButtons = nodeExecutionService.extractNodeButtons(currentNode);
                        if (nodeButtons != null && !nodeButtons.isEmpty()) {
                            task.setButtonPermissions(nodeButtons);
                        }
                        
                        // P2-12: 设置是否允许编辑表单
                        if (currentNode.getAllowEdit() != null) {
                            task.setAllowEdit(currentNode.getAllowEdit());
                        } else {
                            task.setAllowEdit(false);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("[enrichTodoTasks] 填充步骤信息失败, taskId={}: {}", task.getTaskId(), e.getMessage());
            }
        }
    }

    private List<WfTask> toDoneTasks(List<WfTaskHistory> histories) {
        if (histories == null || histories.isEmpty()) {
            return new ArrayList<>();
        }
        List<WfTask> tasks = new ArrayList<>();
        for (WfTaskHistory history : histories) {
            WfTask task = new WfTask();
            task.setTaskId(history.getTaskId());
            task.setTenantId(history.getTenantId());
            task.setInstanceId(history.getInstanceId());
            task.setNodeKey(history.getNodeKey());
            task.setNodeName(history.getNodeName());
            task.setAssignee(history.getOperatorId());
            task.setAssigneeName(history.getOperatorName());
            task.setStatus("REJECT".equalsIgnoreCase(history.getAction()) ? "REJECTED" : "COMPLETED");
            task.setCreateTime(history.getCreateTime());
            task.setIsRead(true);
            task.setReadTime(history.getCreateTime());
            tasks.add(task);
        }
        return tasks;
    }

    private void enrichDoneTasks(List<WfTask> tasks) {
        if (tasks == null || tasks.isEmpty()) {
            return;
        }
        List<String> instanceIds = tasks.stream().map(WfTask::getInstanceId).filter(StringUtils::hasText).distinct().collect(Collectors.toList());
        if (instanceIds.isEmpty()) {
            return;
        }
        List<WfProcessInstance> instances = processInstanceMapper.selectBatchIds(instanceIds);
        Map<String, WfProcessInstance> instanceMap = instances.stream()
            .collect(Collectors.toMap(WfProcessInstance::getInstanceId, inst -> inst));
        List<String> definitionIds = instances.stream()
            .map(WfProcessInstance::getDefinitionId)
            .filter(StringUtils::hasText)
            .distinct()
            .collect(Collectors.toList());
        Map<String, WfProcessDefinition> defById = new HashMap<>();
        if (!definitionIds.isEmpty()) {
            List<WfProcessDefinition> defs = processDefinitionMapper.selectBatchIds(definitionIds);
            if (defs != null) {
                for (WfProcessDefinition def : defs) {
                    if (def != null && StringUtils.hasText(def.getDefinitionId())) {
                        defById.put(def.getDefinitionId(), def);
                    }
                }
            }
        }
        List<WfTaskHistory> allHistories = taskHistoryMapper.selectList(
            new LambdaQueryWrapper<WfTaskHistory>().in(WfTaskHistory::getInstanceId, instanceIds).orderByAsc(WfTaskHistory::getCreateTime));
        Map<String, List<WfTaskHistory>> historiesByInstance = allHistories.stream()
            .collect(Collectors.groupingBy(WfTaskHistory::getInstanceId));

        for (WfTask task : tasks) {
            WfProcessInstance instance = instanceMap.get(task.getInstanceId());
            if (instance == null) {
                continue;
            }
            task.setProcessDefKey(instance.getProcessDefKey());
            task.setStartUserId(String.valueOf(instance.getStartUserId()));
            task.setStartUserName(instance.getStartUserName());
            task.setInstanceTitle(instance.getTitle());
            task.setPriority(instance.getPriority());
            WfProcessDefinition def = resolveDefinitionForInstance(instance, defById);
            if (def != null) {
                task.setProcessName(def.getProcessName());
                task.setFormId(def.getFormId());
            }
            if (StringUtils.hasText(instance.getVariables())) {
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> vars = objectMapper.readValue(instance.getVariables(), Map.class);
                    task.setVariables(vars);
                } catch (Exception e) {
                    log.warn("[enrichDoneTasks] 解析流程变量失败, instanceId={}: {}", instance.getInstanceId(), e.getMessage());
                }
            }
            if (def != null && StringUtils.hasText(def.getModelJson())) {
                try {
                    WfNodeConfig root = workflowGraphModelResolver.parseRuntimeRoot(def.getModelJson());
                    List<Map<String, String>> steps = nodeExecutionService.extractApprovalSteps(root);
                    if (steps != null && !steps.isEmpty()) {
                        enrichTaskStepInfo(task, steps, historiesByInstance.getOrDefault(task.getInstanceId(), new ArrayList<>()));
                    }
                } catch (Exception e) {
                    log.warn("[enrichDoneTasks] 填充步骤信息失败, taskId={}: {}", task.getTaskId(), e.getMessage());
                }
            }
        }
    }

    /**
     * 在批量富化场景下解析实例对应流程定义（仅按 definitionId）。
     */
    private WfProcessDefinition resolveDefinitionForInstance(
        WfProcessInstance instance,
        Map<String, WfProcessDefinition> defById
    ) {
        if (instance == null) {
            return null;
        }
        if (!StringUtils.hasText(instance.getDefinitionId())) {
            return null;
        }
        return defById.get(instance.getDefinitionId());
    }

    /**
     * 为任务填充流程步骤信息
     */
    private void enrichTaskStepInfo(WfTask task, List<Map<String, String>> steps, List<WfTaskHistory> histories) {
        if (steps == null || steps.isEmpty()) return;
        task.setTotalSteps(steps.size());

        int currentIndex = -1;
        for (int i = 0; i < steps.size(); i++) {
            if (steps.get(i).get("nodeKey").equals(task.getNodeKey())) {
                currentIndex = i;
                break;
            }
        }

        if (currentIndex >= 0) {
            task.setCurrentStepIndex(currentIndex + 1);

            if (currentIndex > 0) {
                Map<String, String> prevStep = steps.get(currentIndex - 1);
                task.setPreviousNodeName(prevStep.get("nodeTitle"));
                if (histories != null) {
                    for (int i = histories.size() - 1; i >= 0; i--) {
                        WfTaskHistory h = histories.get(i);
                        if (prevStep.get("nodeKey").equals(h.getNodeKey()) && h.getOperatorName() != null) {
                            task.setPreviousOperatorName(h.getOperatorName());
                            break;
                        }
                    }
                }
            } else {
                task.setPreviousNodeName("发起申请");
                task.setPreviousOperatorName(task.getStartUserName());
            }

            if (currentIndex < steps.size() - 1) {
                Map<String, String> nextStep = steps.get(currentIndex + 1);
                task.setNextNodeName(nextStep.get("nodeTitle"));
                task.setNextAssigneeName(nodeExecutionService.resolveAssigneeDescription(
                    nextStep.get("approverType"), nextStep.get("approverValue")));
            } else {
                task.setNextNodeName("流程结束");
                task.setNextAssigneeName("-");
            }
        }

        task.setStepsDetail(nodeExecutionService.buildAllStepsDetail(steps, histories, task.getNodeKey()));
    }

    // ==================== 加签/减签功能实现 ====================

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> addSignature(String taskId, java.util.List<Long> userIds, String comment) {
        Long currentUserId = UserContext.getUserId();
        log.info("[addSignature] 开始加签, taskId={}, userIds={}, userId={}", taskId, userIds, currentUserId);

        // 参数校验
        if (!StringUtils.hasText(taskId)) {
            throw WorkflowException.validationError("任务ID不能为空");
        }
        if (userIds == null || userIds.isEmpty()) {
            throw WorkflowException.validationError("加签人员列表不能为空");
        }
        if (!StringUtils.hasText(comment)) {
            throw WorkflowException.validationError("加签说明不能为空");
        }

        WfTask task = taskMapper.selectById(taskId);
        if (task == null) {
            throw WorkflowException.taskNotFound(taskId);
        }
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && !Objects.equals(currentTenantId, task.getTenantId())) {
            throw new PermissionDeniedException("无权访问该租户任务");
        }

        // 权限校验：只有当前任务处理人可以加签
        if (!Objects.equals(task.getAssignee(), currentUserId) && !permissionService.isAdmin(currentUserId)) {
            throw new PermissionDeniedException("只有任务处理人可以加签");
        }

        // 检查是否为会签任务
        if (!countersignService.isCountersignTask(task)) {
            throw WorkflowException.validationError("只有会签节点支持加签操作");
        }

        // 获取会签任务信息
        WfCountersignTask csTask = countersignService.getCountersignTask(task.getInstanceId(), task.getNodeKey());
        if (csTask == null) {
            throw WorkflowException.validationError("未找到会签任务信息");
        }

        // 检查会签状态
        if (!"VOTING".equals(csTask.getStatus())) {
            throw WorkflowException.invalidState("会签已结束，无法加签");
        }

        // P0修复: 顺序签署模式不支持加签
        if ("SEQUENTIAL".equals(csTask.getSignType())) {
            throw WorkflowException.validationError("顺序签署模式不支持加签操作");
        }

        // XSS 过滤
        comment = securityUtils.sanitizeXss(comment);

        // P0修复: 使用与投票相同的分布式锁，确保并发安全
        String countersignId = csTask.getCountersignId();
        RLock lock = redissonClient.getLock("lock:countersign:" + countersignId);
        try {
            if (lock.tryLock(5, 10, TimeUnit.SECONDS)) {
                // 锁内重新查询会签任务，确保数据最新
                csTask = countersignService.getCountersignTask(task.getInstanceId(), task.getNodeKey());
                if (csTask == null || !"VOTING".equals(csTask.getStatus())) {
                    throw WorkflowException.invalidState("会签状态已变更，无法加签");
                }

                int addedCount = 0;
                // 为每个新增人员创建会签任务
                for (Long userId : userIds) {
                    // 检查用户是否已经是会签人
                    Long existingTaskCount = taskMapper.selectCount(
                        new LambdaQueryWrapper<WfTask>()
                            .eq(WfTask::getInstanceId, task.getInstanceId())
                            .eq(WfTask::getNodeKey, task.getNodeKey())
                            .eq(WfTask::getAssignee, userId)
                    );
                    if (existingTaskCount > 0) {
                        log.warn("[addSignature] 用户{}已是会签人，跳过", userId);
                        continue;
                    }

                    // 创建新的会签任务
                    WfTask newTask = new WfTask();
                    newTask.setTaskId(UUID.randomUUID().toString());
                    newTask.setInstanceId(task.getInstanceId());
                    newTask.setNodeName(task.getNodeName());
                    newTask.setNodeKey(task.getNodeKey());
                    newTask.setAssignee(userId);
                    newTask.setTenantId(task.getTenantId());
                    newTask.setStatus(WfTaskStatus.TODO.getCode());
                    newTask.setCreateTime(LocalDateTime.now());
                    newTask.setCandidateRoles("CS:" + countersignId);

                    addedCount++;

                    // 记录加签历史
                    WfTaskAddSign addSign = new WfTaskAddSign();
                    addSign.setAddSignId(UUID.randomUUID().toString());
                    addSign.setTenantId(task.getTenantId());
                    addSign.setTaskId(taskId);
                    addSign.setInstanceId(task.getInstanceId());
                    addSign.setSignType("AFTER"); // 后加签
                    addSign.setInitiatorId(currentUserId);
                    addSign.setInitiatorName(UserContext.getUserName());
                    
                    // 获取被加签人姓名
                    SysUser toUser = sysUserMapper.selectById(userId);
                    String toUserName = "";
                    if (toUser != null) {
                        toUserName = toUser.getNickName() != null ? toUser.getNickName() : toUser.getUserName();
                    }
                    newTask.setAssigneeName(toUserName);
                    taskMapper.insert(newTask);
                    WfProcessInstance addSignInstance = processInstanceMapper.selectById(task.getInstanceId());
                    createTaskMonitor(addSignInstance, newTask);
                    
                    addSign.setSignUserIds(String.valueOf(userId));
                    addSign.setSignUserNames(toUserName);
                    addSign.setReason(comment);
                    addSign.setStatus("PENDING");
                    addSign.setCreateTime(LocalDateTime.now());
                    
                    wfTaskAddSignMapper.insert(addSign);

                    // 发送通知
                    sysNoticeService.sendNotice(userId, "加签通知",
                        String.format("您被加签到任务: %s (流程: %s)", task.getNodeName(), 
                            getInstanceTitle(task.getInstanceId())),
                        "1", currentUserId, UserContext.getUserName());
                }

                if (addedCount == 0) {
                    throw WorkflowException.validationError("没有可加签的人员（可能已是会签人）");
                }

                // 更新会签任务的总人数
                csTask.setTotalCount(csTask.getTotalCount() + addedCount);
                countersignService.updateCountersignTask(csTask);

                // 记录审计日志
                auditService.log(WorkflowAuditService.AuditAction.TASK_ADD_SIGN, taskId,
                    "addedUsers=" + addedCount + ", comment=" + comment);

                log.info("[addSignature] 加签完成, 新增{}人", addedCount);
                return R.ok(Map.of("addedCount", addedCount));
            } else {
                throw WorkflowException.invalidState("加签操作处理中，请勿重复提交");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new WorkflowException("SYSTEM_BUSY", "系统繁忙，请稍后重试");
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> reductionSignature(String taskId, java.util.List<Long> userIds, String comment) {
        Long currentUserId = UserContext.getUserId();
        log.info("[reductionSignature] 开始减签, taskId={}, userIds={}, userId={}", taskId, userIds, currentUserId);

        // 参数校验
        if (!StringUtils.hasText(taskId)) {
            throw WorkflowException.validationError("任务ID不能为空");
        }
        if (userIds == null || userIds.isEmpty()) {
            throw WorkflowException.validationError("减签人员列表不能为空");
        }
        if (!StringUtils.hasText(comment)) {
            throw WorkflowException.validationError("减签说明不能为空");
        }

        WfTask task = taskMapper.selectById(taskId);
        if (task == null) {
            throw WorkflowException.taskNotFound(taskId);
        }
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && !Objects.equals(currentTenantId, task.getTenantId())) {
            throw new PermissionDeniedException("无权访问该租户任务");
        }

        // 权限校验：只有当前任务处理人或管理员可以减签
        if (!Objects.equals(task.getAssignee(), currentUserId) && !permissionService.isAdmin(currentUserId)) {
            throw new PermissionDeniedException("只有任务处理人或管理员可以减签");
        }

        // 检查是否为会签任务
        if (!countersignService.isCountersignTask(task)) {
            throw WorkflowException.validationError("只有会签节点支持减签操作");
        }

        // 获取会签任务信息
        WfCountersignTask csTask = countersignService.getCountersignTask(task.getInstanceId(), task.getNodeKey());
        if (csTask == null) {
            throw WorkflowException.validationError("未找到会签任务信息");
        }

        // 检查会签状态
        if (!"VOTING".equals(csTask.getStatus())) {
            throw WorkflowException.invalidState("会签已结束，无法减签");
        }

        // P1修复: 顺序签署模式不支持减签
        if ("SEQUENTIAL".equals(csTask.getSignType())) {
            throw WorkflowException.validationError("顺序签署模式不支持减签操作");
        }

        // XSS 过滤
        comment = securityUtils.sanitizeXss(comment);

        // P0修复: 使用与投票相同的分布式锁，确保并发安全
        String countersignId = csTask.getCountersignId();
        RLock lock = redissonClient.getLock("lock:countersign:" + countersignId);
        try {
            if (lock.tryLock(5, 10, TimeUnit.SECONDS)) {
                // 锁内重新查询会签任务，确保数据最新
                csTask = countersignService.getCountersignTask(task.getInstanceId(), task.getNodeKey());
                if (csTask == null || !"VOTING".equals(csTask.getStatus())) {
                    throw WorkflowException.invalidState("会签状态已变更，无法减签");
                }

                int removedCount = 0;
                for (Long userId : userIds) {
                    // 不能减签自己
                    if (userId.equals(currentUserId)) {
                        log.warn("[reductionSignature] 不能减签自己，跳过");
                        continue;
                    }

                    // 查找该用户的待办任务
                    List<WfTask> userTasks = taskMapper.selectList(
                        new LambdaQueryWrapper<WfTask>()
                            .eq(WfTask::getInstanceId, task.getInstanceId())
                            .eq(WfTask::getNodeKey, task.getNodeKey())
                            .eq(WfTask::getAssignee, userId)
                            .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode())
                    );

                    if (userTasks.isEmpty()) {
                        log.warn("[reductionSignature] 用户{}没有待办任务，跳过", userId);
                        continue;
                    }

                    // 检查是否已投票
                    boolean hasVoted = countersignService.hasUserVoted(csTask.getCountersignId(), userId);
                    if (hasVoted) {
                        log.warn("[reductionSignature] 用户{}已投票，不能减签", userId);
                        continue;
                    }

                    // 删除任务
                    for (WfTask userTask : userTasks) {
                        taskMapper.deleteById(userTask.getTaskId());
                        
                        // 记录减签历史
                        WfTaskHistory history = new WfTaskHistory();
                        history.setHistoryId(UUID.randomUUID().toString());
                        history.setTenantId(userTask.getTenantId());
                        history.setTaskId(userTask.getTaskId());
                        history.setInstanceId(task.getInstanceId());
                        history.setNodeName(task.getNodeName());
                        history.setNodeKey(task.getNodeKey());
                        history.setOperatorId(currentUserId);
                        history.setOperatorName(UserContext.getUserName());
                        history.setComment("减签: " + comment);
                        history.setAction("REDUCTION_SIGN");
                        history.setCreateTime(LocalDateTime.now());
                        taskHistoryMapper.insert(history);
                        completeTaskMonitor(userTask, history.getCreateTime(), "REDUCTION_SIGN");

                        removedCount++;
                    }

                    // 发送通知
                    sysNoticeService.sendNotice(userId, "减签通知",
                        String.format("您被移出会签任务: %s (流程: %s)，原因: %s", 
                            task.getNodeName(), getInstanceTitle(task.getInstanceId()), comment),
                        "1", currentUserId, UserContext.getUserName());
                }

                if (removedCount == 0) {
                    throw WorkflowException.validationError("没有可减签的人员（可能已投票或不存在）");
                }

                // 更新会签任务的总人数
                csTask.setTotalCount(csTask.getTotalCount() - removedCount);
                if (csTask.getTotalCount() < 1) {
                    throw WorkflowException.validationError("减签后会签人数不能少于1人");
                }
                countersignService.updateCountersignTask(csTask);

                // P1修复: 检查减签后是否满足通过或失败条件
                countersignService.checkAndCompleteCountersign(csTask);

                // 记录审计日志
                auditService.log(WorkflowAuditService.AuditAction.TASK_REDUCTION_SIGN, taskId,
                    "removedUsers=" + removedCount + ", comment=" + comment);

                log.info("[reductionSignature] 减签完成, 移除{}人", removedCount);
                return R.ok(Map.of("removedCount", removedCount));
            } else {
                throw WorkflowException.invalidState("减签操作处理中，请勿重复提交");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new WorkflowException("SYSTEM_BUSY", "系统繁忙，请稍后重试");
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    /**
     * 统一校验任务归属的流程实例，防止异常数据导致跨租户误操作。
     */
    private WfProcessInstance requireTaskInstanceForOperation(WfTask task, String operation) {
        if (task == null || !StringUtils.hasText(task.getInstanceId())) {
            throw WorkflowException.validationError("任务缺少关联的流程实例信息");
        }

        WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
        if (instance == null) {
            throw WorkflowException.instanceNotFound(task.getInstanceId());
        }

        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && !Objects.equals(currentTenantId, instance.getTenantId())) {
            throw new PermissionDeniedException("无权" + operation + "其他租户流程实例");
        }

        if (task.getTenantId() != null
                && instance.getTenantId() != null
                && !Objects.equals(task.getTenantId(), instance.getTenantId())) {
            throw WorkflowException.invalidState("任务与流程实例租户不一致，拒绝继续" + operation + "操作");
        }
        return instance;
    }

    private void createTaskMonitor(WfProcessInstance instance, WfTask task) {
        try {
            if (instance != null) {
                processMonitorService.incrementTaskCount(instance.getInstanceId());
            }

            TaskMonitor monitor = new TaskMonitor();
            monitor.setTenantId(task.getTenantId());
            monitor.setTaskId(task.getTaskId());
            monitor.setInstanceId(task.getInstanceId());
            monitor.setNodeKey(task.getNodeKey());
            monitor.setTaskName(task.getNodeName());
            monitor.setAssigneeId(task.getAssignee());
            monitor.setAssigneeName(task.getAssigneeName());
            monitor.setCreateTimeTask(task.getCreateTime());
            monitor.setClaimTime(task.getCreateTime());
            monitor.setWaitDuration(0L);
            monitor.setHandleDuration(0L);
            monitor.setTotalDuration(0L);
            monitor.setStatus("PENDING");
            monitor.setCreateTime(task.getCreateTime());
            monitor.setUpdateTime(LocalDateTime.now());
            taskMonitorMapper.insert(monitor);
        } catch (Exception e) {
            log.warn("[createTaskMonitor] 记录任务监控失败, instanceId={}, taskId={}, error={}",
                instance != null ? instance.getInstanceId() : task.getInstanceId(), task.getTaskId(), e.getMessage());
        }
    }

    private void completeTaskMonitor(WfTask task, LocalDateTime completeTime, String action) {
        try {
            TaskMonitor monitor = taskMonitorMapper.selectByTaskId(task.getTaskId());
            if (monitor == null) {
                return;
            }

            LocalDateTime finishedAt = completeTime != null ? completeTime : LocalDateTime.now();
            monitor.setCompleteTime(finishedAt);
            if (monitor.getCreateTimeTask() != null) {
                long totalDuration = java.time.Duration.between(monitor.getCreateTimeTask(), finishedAt).toMillis();
                monitor.setTotalDuration(totalDuration);
                monitor.setHandleDuration(totalDuration);
            }
            monitor.setStatus("COMPLETED");
            monitor.setAction(action);
            monitor.setUpdateTime(LocalDateTime.now());
            taskMonitorMapper.updateById(monitor);
        } catch (Exception e) {
            log.warn("[completeTaskMonitor] 更新任务监控失败, taskId={}, error={}", task.getTaskId(), e.getMessage());
        }
    }

    /**
     * 获取流程实例标题
     */
    private String getInstanceTitle(String instanceId) {
        try {
            WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
            return instance != null ? instance.getTitle() : "未知流程";
        } catch (Exception e) {
            return "未知流程";
        }
    }
}
