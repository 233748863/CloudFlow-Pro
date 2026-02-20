package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.RedisCache;
import com.cloudflow.workflow.domain.*;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.event.WorkflowEventPublisher;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.job.TaskReminderJob;
import com.cloudflow.workflow.mapper.*;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
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
 * 从 WorkflowServiceImpl 拆分而来，负责任务的完成、驳回、查询、催办等操作
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
        if ("DELEGATE".equalsIgnoreCase(action) && !StringUtils.hasText(delegateUserId)) {
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

                // XSS 过滤
                if (StringUtils.hasText(comment)) {
                    comment = securityUtils.sanitizeXss(comment);
                }

                // 会签任务处理
                if (countersignService.isCountersignTask(task)) {
                    return handleCountersignVote(task, taskId, action, comment, variables);
                }

                // 保存历史记录
                WfTaskHistory history = new WfTaskHistory();
                history.setHistoryId(UUID.randomUUID().toString());
                history.setTaskId(task.getTaskId());
                history.setInstanceId(task.getInstanceId());
                history.setNodeName(task.getNodeName());
                history.setNodeKey(task.getNodeKey());
                history.setOperatorId(currentUserId);
                history.setOperatorName(UserContext.getUserName());
                history.setComment(comment);
                history.setAction(action);
                history.setCreateTime(new Date());

                if (task.getCreateTime() != null) {
                    long durationSeconds = (System.currentTimeMillis() - task.getCreateTime().getTime()) / 1000;
                    history.setDurationSeconds((int) durationSeconds);
                }
                taskHistoryMapper.insert(history);

                // 删除当前任务
                taskMapper.deleteById(taskId);
                taskReminderJob.cancelReminders(taskId);
                cleanupTaskReadData(taskId);

                WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());

                // 保存实例快照
                nodeExecutionService.saveProcessSnapshot(instance, task.getNodeKey(), task.getNodeName());

                // 转办操作
                if ("DELEGATE".equalsIgnoreCase(action)) {
                    return handleDelegate(task, instance, delegateUserId, comment);
                }

                // 拒绝操作
                if ("REJECT".equalsIgnoreCase(action)) {
                    nodeExecutionService.completeInstance(instance, WfProcessStatus.REJECTED.getCode());
                    workflowEventPublisher.publishProcessRejected(instance, task.getNodeName(), comment);
                    notifyInitiator(instance, task.getNodeName(), action, comment);
                    return R.ok();
                }

                // 审批通过 - 变量合并
                Map<String, Object> mergedVariables = mergeVariables(instance, variables);

                // 记录变量变更
                if (variables != null && !variables.isEmpty()) {
                    try {
                        history.setVariablesChanged(objectMapper.writeValueAsString(variables));
                        taskHistoryMapper.updateById(history);
                    } catch (Exception e) {
                        log.warn("[completeTask] 记录变量变更失败: {}", e.getMessage());
                    }
                }

                // 流程流转
                WfProcessDefinition def = processDefinitionMapper.selectOne(
                    new LambdaQueryWrapper<WfProcessDefinition>()
                        .eq(WfProcessDefinition::getProcessKey, instance.getProcessDefKey())
                        .orderByDesc(WfProcessDefinition::getVersion)
                        .last("LIMIT 1")
                );

                try {
                    if (def != null && StringUtils.hasText(def.getModelJson())) {
                        WfNodeConfig root = objectMapper.readValue(def.getModelJson(), WfNodeConfig.class);
                        WfNodeConfig currentNode = nodeExecutionService.findNode(root, task.getNodeKey());
                        nodeExecutionService.advanceAfterNode(instance, currentNode, task.getNodeKey(), mergedVariables, 0, root);
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
                    if (def != null && StringUtils.hasText(def.getModelJson())) {
                        WfNodeConfig postRoot = objectMapper.readValue(def.getModelJson(), WfNodeConfig.class);
                        WfNodeConfig completedNode = nodeExecutionService.findNode(postRoot, task.getNodeKey());
                        if (completedNode != null) {
                            approvalPostProcessor.process(completedNode, instance, action, mergedVariables);
                        }
                    }
                } catch (Exception e) {
                    log.warn("[completeTask] 审批后置处理失败, taskId={}: {}", taskId, e.getMessage());
                }

                notifyInitiator(instance, task.getNodeName(), action, comment);
                auditService.log(WorkflowAuditService.AuditAction.TASK_COMPLETE, taskId,
                    "action=" + action + ", nodeName=" + task.getNodeName());
                workflowEventPublisher.publishTaskCompleted(instance, taskId, task.getNodeKey(), task.getNodeName(), action, comment);

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

        WfTask task = taskMapper.selectById(taskId);
        if (task == null) {
            throw WorkflowException.taskNotFound(taskId);
        }

        permissionService.checkRejectPermission(task);
        validateRejectTarget(task.getInstanceId(), task.getNodeKey(), targetNodeKey);

        // 保存驳回历史
        WfTaskHistory history = new WfTaskHistory();
        history.setHistoryId(UUID.randomUUID().toString());
        history.setTaskId(task.getTaskId());
        history.setInstanceId(task.getInstanceId());
        history.setNodeName(task.getNodeName());
        history.setNodeKey(task.getNodeKey());
        history.setOperatorId(UserContext.getUserId());
        history.setOperatorName(UserContext.getUserName());
        history.setComment(comment);
        history.setAction("REJECT_TO_" + targetNodeKey);
        history.setCreateTime(new Date());

        try {
            Map<String, Object> rejectDetail = new HashMap<>();
            rejectDetail.put("type", "REJECT");
            rejectDetail.put("sourceNodeKey", task.getNodeKey());
            rejectDetail.put("targetNodeKey", targetNodeKey);
            rejectDetail.put("reason", comment);
            history.setVariablesChanged(objectMapper.writeValueAsString(rejectDetail));
        } catch (Exception e) {
            log.warn("[rejectTask] 序列化驳回详情失败: {}", e.getMessage());
        }

        if (task.getCreateTime() != null) {
            long durationSeconds = (System.currentTimeMillis() - task.getCreateTime().getTime()) / 1000;
            history.setDurationSeconds((int) durationSeconds);
        }
        taskHistoryMapper.insert(history);

        // 删除当前任务
        taskMapper.deleteById(taskId);

        // 在目标节点创建新任务
        WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
        if (instance == null) {
            throw WorkflowException.instanceNotFound(task.getInstanceId());
        }

        WfProcessDefinition def = processDefinitionMapper.selectOne(
            new LambdaQueryWrapper<WfProcessDefinition>()
                .eq(WfProcessDefinition::getProcessKey, instance.getProcessDefKey())
                .orderByDesc(WfProcessDefinition::getVersion)
                .last("LIMIT 1")
        );

        try {
            WfNodeConfig root = objectMapper.readValue(def.getModelJson(), WfNodeConfig.class);
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
    }

    @Override
    public PageResult<WfTask> getTodoTasks(Long userId, PageQuery pageQuery) {
        log.info("[getTodoTasks] 查询待办任务, userId={}", userId);

        // 提取搜索条件
        String keyword = (String) pageQuery.getParams().get("keyword");
        String processDefKey = (String) pageQuery.getParams().get("processDefKey");
        String startTimeFrom = (String) pageQuery.getParams().get("startTimeFrom");
        String startTimeTo = (String) pageQuery.getParams().get("startTimeTo");
        String startUserName = (String) pageQuery.getParams().get("startUserName");

        // 实例筛选
        List<String> filteredInstanceIds = null;
        boolean hasInstanceFilter = StringUtils.hasText(keyword) || StringUtils.hasText(processDefKey) || StringUtils.hasText(startUserName);

        if (hasInstanceFilter) {
            LambdaQueryWrapper<WfProcessInstance> instanceWrapper = new LambdaQueryWrapper<>();
            instanceWrapper.eq(WfProcessInstance::getStatus, WfProcessStatus.RUNNING.getCode());
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

        if (filteredInstanceIds != null) {
            queryWrapper.in(WfTask::getInstanceId, filteredInstanceIds);
        }

        // 时间范围筛选
        if (StringUtils.hasText(startTimeFrom)) {
            try {
                Date fromDate = new java.text.SimpleDateFormat("yyyy-MM-dd").parse(startTimeFrom);
                queryWrapper.ge(WfTask::getCreateTime, fromDate);
            } catch (Exception e) { log.warn("[getTodoTasks] 解析开始时间失败"); }
        }
        if (StringUtils.hasText(startTimeTo)) {
            try {
                Date toDate = new java.text.SimpleDateFormat("yyyy-MM-dd").parse(startTimeTo);
                Calendar cal = Calendar.getInstance();
                cal.setTime(toDate);
                cal.set(Calendar.HOUR_OF_DAY, 23);
                cal.set(Calendar.MINUTE, 59);
                cal.set(Calendar.SECOND, 59);
                queryWrapper.le(WfTask::getCreateTime, cal.getTime());
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
    @Transactional(rollbackFor = Exception.class)
    public void readTask(String taskId, Long userId) {
        WfTask task = taskMapper.selectById(taskId);
        if (task == null) {
            throw WorkflowException.taskNotFound(taskId);
        }
        if (task.getAssignee() != null && !task.getAssignee().equals(userId) && !permissionService.isAdmin(userId)) {
            throw new com.cloudflow.workflow.exception.PermissionDeniedException("您不是此任务的处理人，无法标记已读");
        }

        Long count = taskReadMapper.selectCount(new LambdaQueryWrapper<WfTaskRead>()
                .eq(WfTaskRead::getTaskId, taskId).eq(WfTaskRead::getUserId, userId));
        if (count == 0) {
            WfTaskRead read = new WfTaskRead();
            read.setTaskId(taskId);
            read.setUserId(userId);
            read.setReadTime(new Date());
            taskReadMapper.insert(read);
        }
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

        WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
        if (instance == null) {
            throw WorkflowException.instanceNotFound(task.getInstanceId());
        }

        permissionService.checkUrgePermission(instance);

        WfTaskUrge urge = new WfTaskUrge();
        urge.setTaskId(taskId);
        urge.setSenderId(currentUserId);
        urge.setRecipientId(task.getAssignee());
        urge.setReason(reason);
        urge.setCreateTime(new Date());
        taskUrgeMapper.insert(urge);

        sysNoticeService.sendNotice(task.getAssignee(), "任务催办提醒",
            "发起人催办了任务: " + task.getNodeName() + "，原因: " + (StringUtils.hasText(reason) ? reason : "无"),
            "2", currentUserId, UserContext.getUserName());

        return R.ok();
    }

    // ==================== 私有方法 ====================

    /**
     * 处理转办操作
     */
    private R<?> handleDelegate(WfTask task, WfProcessInstance instance, String delegateUserId, String comment) {
        WfTask newTask = new WfTask();
        newTask.setTaskId(UUID.randomUUID().toString());
        newTask.setInstanceId(task.getInstanceId());
        newTask.setNodeName(task.getNodeName());
        newTask.setNodeKey(task.getNodeKey());
        newTask.setAssignee(Long.valueOf(delegateUserId));
        newTask.setStatus(WfTaskStatus.TODO.getCode());
        newTask.setCreateTime(new Date());
        taskMapper.insert(newTask);

        sysNoticeService.sendNotice(Long.valueOf(delegateUserId), "任务转办通知",
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
        String voteResult = "APPROVE".equalsIgnoreCase(action) ? "APPROVE" : ("REJECT".equalsIgnoreCase(action) ? "REJECT" : "APPROVE");

        String countersignResult = countersignService.vote(taskId, currentUserId, userName, voteResult, comment);

        WfTaskHistory history = new WfTaskHistory();
        history.setHistoryId(UUID.randomUUID().toString());
        history.setTaskId(taskId);
        history.setInstanceId(task.getInstanceId());
        history.setNodeName(task.getNodeName());
        history.setNodeKey(task.getNodeKey());
        history.setOperatorId(currentUserId);
        history.setOperatorName(userName);
        history.setComment(comment);
        history.setAction("COUNTERSIGN_" + voteResult);
        history.setCreateTime(new Date());
        if (task.getCreateTime() != null) {
            history.setDurationSeconds((int) ((System.currentTimeMillis() - task.getCreateTime().getTime()) / 1000));
        }
        taskHistoryMapper.insert(history);

        if ("PASSED".equals(countersignResult) || "REJECTED".equals(countersignResult)) {
            WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
            nodeExecutionService.saveProcessSnapshot(instance, task.getNodeKey(), task.getNodeName());

            if ("REJECTED".equals(countersignResult)) {
                nodeExecutionService.completeInstance(instance, WfProcessStatus.REJECTED.getCode());
                notifyInitiator(instance, task.getNodeName(), "REJECT", "会签未通过");
            } else {
                Map<String, Object> mergedVariables = mergeVariables(instance, variables);
                WfProcessDefinition def = processDefinitionMapper.selectOne(
                    new LambdaQueryWrapper<WfProcessDefinition>()
                        .eq(WfProcessDefinition::getProcessKey, instance.getProcessDefKey())
                        .orderByDesc(WfProcessDefinition::getVersion).last("LIMIT 1"));
                try {
                    if (def != null && StringUtils.hasText(def.getModelJson())) {
                        WfNodeConfig root = objectMapper.readValue(def.getModelJson(), WfNodeConfig.class);
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
        }
        return R.ok(countersignResult);
    }

    /**
     * 合并审批变量与实例变量
     */
    private Map<String, Object> mergeVariables(WfProcessInstance instance, Map<String, Object> newVariables) {
        Map<String, Object> instanceVars = new HashMap<>();
        if (StringUtils.hasText(instance.getVariables())) {
            try {
                instanceVars = objectMapper.readValue(instance.getVariables(), Map.class);
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

    /**
     * 批量填充待办任务的关联信息（流程实例、定义、已读状态、步骤信息、按钮权限）
     */
    private void enrichTodoTasks(List<WfTask> tasks, Long userId) {
        // 批量查询实例
        List<String> instanceIds = tasks.stream().map(WfTask::getInstanceId).distinct().collect(Collectors.toList());
        List<WfProcessInstance> instances = processInstanceMapper.selectBatchIds(instanceIds);
        Map<String, WfProcessInstance> instanceMap = instances.stream()
            .collect(Collectors.toMap(WfProcessInstance::getInstanceId, inst -> inst));

        // 批量查询流程定义
        List<String> processKeys = instances.stream().map(WfProcessInstance::getProcessDefKey).distinct().collect(Collectors.toList());
        List<WfProcessDefinition> definitions = processDefinitionMapper.selectList(
            new LambdaQueryWrapper<WfProcessDefinition>()
                .in(WfProcessDefinition::getProcessKey, processKeys)
                .orderByDesc(WfProcessDefinition::getVersion));
        Map<String, WfProcessDefinition> defMap = new HashMap<>();
        for (WfProcessDefinition def : definitions) {
            defMap.putIfAbsent(def.getProcessKey(), def);
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

                WfProcessDefinition def = defMap.get(instance.getProcessDefKey());
                if (def != null) {
                    task.setProcessName(def.getProcessName());
                    task.setFormId(def.getFormId());
                }

                if (StringUtils.hasText(instance.getVariables())) {
                    try {
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
                String processKey = instance.getProcessDefKey();
                List<Map<String, String>> steps = stepsCache.get(processKey);
                if (steps == null) {
                    WfProcessDefinition def = defMap.get(processKey);
                    if (def != null && StringUtils.hasText(def.getModelJson())) {
                        WfNodeConfig root = objectMapper.readValue(def.getModelJson(), WfNodeConfig.class);
                        steps = nodeExecutionService.extractApprovalSteps(root);
                        stepsCache.put(processKey, steps);
                        rootNodeCache.put(processKey, root);
                    }
                }

                if (steps != null && !steps.isEmpty()) {
                    List<WfTaskHistory> histories = historiesByInstance.getOrDefault(task.getInstanceId(), new ArrayList<>());
                    enrichTaskStepInfo(task, steps, histories);
                }

                // 提取当前节点的按钮权限
                WfNodeConfig cachedRoot = rootNodeCache.get(processKey);
                if (cachedRoot != null && StringUtils.hasText(task.getNodeKey())) {
                    WfNodeConfig currentNode = nodeExecutionService.findNode(cachedRoot, task.getNodeKey());
                    if (currentNode != null) {
                        List<String> nodeButtons = nodeExecutionService.extractNodeButtons(currentNode);
                        if (nodeButtons != null && !nodeButtons.isEmpty()) {
                            task.setButtonPermissions(nodeButtons);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("[enrichTodoTasks] 填充步骤信息失败, taskId={}: {}", task.getTaskId(), e.getMessage());
            }
        }
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
}
