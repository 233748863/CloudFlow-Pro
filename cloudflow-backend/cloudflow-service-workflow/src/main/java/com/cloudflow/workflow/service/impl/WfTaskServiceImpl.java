package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.service.WorkflowBusinessLockService;
import com.cloudflow.workflow.service.WorkflowBusinessLockService.BusinessLock;

import com.cloudflow.workflow.domain.enums.WfTaskType;
import com.cloudflow.workflow.model.WorkflowGatewayRewindPlan;
import com.cloudflow.workflow.service.TaskSemanticContext;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.message.api.MessageSender;
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
import com.cloudflow.workflow.model.WorkflowRuntimeGraph;
import com.cloudflow.workflow.processor.ApprovalPostProcessor;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.cloudflow.workflow.service.*;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
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
    private WorkflowBusinessLockService businessLocks;

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
    private WorkflowFormAccessService formAccess;
    @Autowired
    private WorkflowSecurityUtils securityUtils;
    @Autowired
    private MessageSender sysNoticeService;
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
    @Autowired
    private TransactionTemplate transactionTemplate;
    @Autowired
    private TaskTimeoutNotifications taskTimeoutNotifications;
    @Autowired
    private WfCountersignTaskMapper countersignTaskMapper;
    @Autowired
    private WorkflowNodePolicy nodePolicy;
    @Autowired
    private WorkflowHParticipantPolicy hParticipantPolicy;

    @Autowired
    private WorkflowAgentService agents;
    @Autowired
    private WorkflowDelegationReturnService delegationReturns;
    @Autowired
    private WorkflowProcessStateService processStateService;

    @Autowired
    private WorkflowGatewayService gateways;
    @Autowired
    private WorkflowRewindService rewinds;
    @Autowired
    private WorkflowHistoryState historyState;
    @Autowired
    private WorkflowAddSignService addSignGroups;

    private final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    @Override
    public R<?> completeTask(String taskId, String action, String comment, Map<String, Object> variables, String delegateUserId) {
        return executeTaskCompletion(taskId, action, comment, variables, delegateUserId, null);
    }

    @Override
    public R<?> completeAutomaticTask(String taskId, String action, String comment, Map<String, Object> variables) {
        String normalizedAction = normalizeCompleteAction(action);
        if (!"APPROVE".equals(normalizedAction) && !"REJECT".equals(normalizedAction)) {
            throw WorkflowException.validationError("自动处理仅支持通过或驳回");
        }
        String taskType = "APPROVE".equals(normalizedAction)
                ? WfTaskType.AUTO_PASS.name() : WfTaskType.AUTO_REJECT.name();
        return WorkflowCompletionContext.automatically(
                () -> executeTaskCompletion(taskId, normalizedAction, comment, variables, null, taskType));
    }

    private R<?> executeTaskCompletion(String taskId, String action, String comment,
                                       Map<String, Object> variables, String delegateUserId, String taskType) {
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

        // 分布式锁必须覆盖整个事务生命周期（拿锁 → 业务 → 事务提交 → 释放锁）：
        // 若锁在事务内释放，并发请求会在本事务提交前拿到锁并读到旧数据，造成重复审批/重复计票。
        // 锁按当前归属持续续期，并在提交前核验归属，避免已失效请求继续提交。
        BusinessLock taskLock = businessLocks.getLock("lock:task:" + taskId);
        BusinessLock countersignLock = null;
        BusinessLock parentLock = null;
        try {
            if (!taskLock.tryLock(5, TimeUnit.SECONDS)) {
                throw WorkflowException.invalidState("任务处理中，请勿重复提交");
            }
            // 会签任务需同时持有会签级锁：会签计票跨同组多个任务，仅任务级锁不足以串行化计票
            WfTask probe = taskMapper.selectById(taskId);
            if (probe == null) {
                throw WorkflowException.taskNotFound(taskId);
            }
            if (countersignService.isCountersignTask(probe)) {
                String countersignId = countersignService.extractCountersignId(probe);
                if (StringUtils.hasText(countersignId)) {
                    countersignLock = businessLocks.getLock("lock:countersign:" + countersignId);
                    if (!countersignLock.tryLock(5, TimeUnit.SECONDS)) {
                        throw WorkflowException.invalidState("会签处理中，请稍后重试");
                    }
                }
            }
            if ("REJECT".equals(normalizedAction)) {
                WfProcessInstance instance = requireTaskInstanceForOperation(probe, "驳回");
                if (StringUtils.hasText(instance.getParentInstanceId())) {
                    parentLock = businessLocks.getLock("lock:instance:" + instance.getParentInstanceId());
                    if (!parentLock.tryLock(5, TimeUnit.SECONDS)) {
                        throw WorkflowException.invalidState("父流程正在处理中");
                    }
                }
            }
            return businessLocks.execute(transactionTemplate, status ->
                doCompleteTask(taskId, normalizedAction, comment, variables, delegateUserId, currentUserId, taskType));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new WorkflowException("SYSTEM_BUSY", "系统繁忙，请稍后重试");
        } finally {
            businessLocks.close(parentLock, countersignLock, taskLock);
        }
    }

    /**
     * completeTask 的事务内业务段。
     * 调用前提：外层已持有 lock:task:{taskId}（会签任务还持有 lock:countersign:{csId}），
     * 事务由外层 TransactionTemplate 管理，锁在事务提交后才释放。
     */
    private R<?> doCompleteTask(String taskId, String normalizedAction, String comment,
                                Map<String, Object> variables, String delegateUserId, Long currentUserId, String taskType) {
        WfTask task = agents.lockTask(taskId);
        if (task == null) {
            throw WorkflowException.taskNotFound(taskId);
        }

        WorkflowExecutionContext.Frame context = WorkflowExecutionContext.parse(task.getExecutionContext());
        if (context != null) gateways.assertActive(requireTaskInstanceForOperation(task, "处理"), context);
        R<?> result = WorkflowExecutionContext.call(context, () -> doCompleteLockedTask(task, normalizedAction, comment,
                variables, delegateUserId, currentUserId, taskType));
        if (result != null && result.isSuccess() && WorkflowCompletionContext.isTimeoutTask(taskId)) {
            taskTimeoutNotifications.completed(task, requireTaskInstanceForOperation(task, "超时处理通知"), normalizedAction);
        }
        return result;
    }

    private R<?> doCompleteLockedTask(WfTask task, String normalizedAction, String comment,
                                      Map<String, Object> variables, String delegateUserId, Long currentUserId, String taskType) {
        WorkflowImCompletionContext.require(task, normalizedAction);
        String taskId = task.getTaskId();
        WorkflowExecutionContext.assertNoOverrides(variables);
        if (taskType != null) {
            task.setTaskType(taskType);
        }

        // 权限校验
        permissionService.checkTaskPermission(task);
        WfProcessInstance activeInstance = requireTaskInstanceForOperation(task, "处理");
        hParticipantPolicy.assertTaskAction(task, currentUserId, variables);
        if (!WfProcessStatus.isActive(activeInstance.getStatus())) {
            throw WorkflowException.invalidState("当前流程状态不允许处理任务");
        }
        if ("APPROVE".equals(normalizedAction) && Set.of("TASK_BACK", "WITHDRAWN", "RESTARTED").contains(activeInstance.getStatus())) {
            WfNodeConfig activeNode = resolveTaskNode(task, activeInstance);
            processStateService.transition(activeInstance, activeNode != null && "START".equals(activeNode.getType())
                    ? WfProcessStatus.RESTARTED : WfProcessStatus.RUNNING);
        }
        if ("DELEGATE".equals(normalizedAction)) {
            nodePolicy.assertTaskAllowed(task, "allowDelegate");
        }
        if ("REJECT".equals(normalizedAction) && !countersignService.isCountersignTask(task)
                && !WorkflowDelegationReturnService.requiresReturn(task)) {
            WfProcessInstance rejectingInstance = requireTaskInstanceForOperation(task, "驳回");
            WfNodeConfig rejectingNode = resolveTaskNode(task, rejectingInstance);
            if (rejectingNode != null && rejectingNode.getRejectStrategy() != null) {
                String rejectComment = comment;
                return TaskSemanticContext.callWithType(taskType,
                        () -> doRejectByStrategy(taskId, null, rejectComment, rejectingNode.getRejectStrategy()));
            }
        }
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
        history.setTaskType(WfTaskType.forAction(normalizedAction, task.getTaskType()));
        history.setCreateTime(LocalDateTime.now());
        applyAdminOverrideMetadata(history, task, currentUserId);

        if (task.getCreateTime() != null) {
            long durationSeconds = java.time.Duration.between(task.getCreateTime(), LocalDateTime.now()).getSeconds();
            history.setDurationSeconds((int) durationSeconds);
        }
        historyState.record(activeInstance, task, history);
        taskHistoryMapper.insert(history);
        completeTaskMonitor(task, history.getCreateTime(), normalizedAction);

        // 删除当前任务
        if (!"APPROVE".equals(normalizedAction) || !addSignGroups.retainOriginal(task)) taskMapper.deleteById(taskId);
        taskReminderJob.cancelAfterCommit(taskId);
        cleanupTaskReadData(taskId);

        WfProcessInstance instance = requireTaskInstanceForOperation(task, "处理");

        // 保存实例快照
        nodeExecutionService.saveProcessSnapshot(instance, task.getNodeKey(), task.getNodeName());

        // 转办操作
        if ("DELEGATE".equals(normalizedAction)) {
            return handleDelegate(task, instance, delegateUserId, comment);
        }

        if (WorkflowDelegationReturnService.requiresReturn(task)) {
            mergeVariables(instance, editableVariables, task);
            WfTask original = delegationReturns.restore(task, normalizedAction, comment);
            WfNodeConfig returnedNode = nodePolicy.resolveNode(instance, original.getNodeKey());
            taskReminderJob.registerAfterCommit(original.getTaskId(), returnedNode == null ? null : returnedNode.getSlaHours());
            workflowEventPublisher.publishTaskCompleted(instance, taskId, task.getNodeKey(), task.getNodeName(),
                    normalizedAction, comment, history.getTaskType());
            workflowEventPublisher.publishTaskAssigned(instance, original.getTaskId(), original.getNodeKey(), original.getNodeName(),
                    original.getAssignee(), original.getAssigneeName(), original.getTaskType());
            return R.ok(Map.of("returnedTaskId", original.getTaskId(), "version", original.getVersion()));
        }

        // 拒绝操作
        if ("REJECT".equals(normalizedAction)) {
            nodeExecutionService.completeInstance(instance, WfProcessStatus.REJECTED.getCode());
            workflowEventPublisher.publishTaskCompleted(instance, taskId, task.getNodeKey(), task.getNodeName(),
                    "REJECT", comment, history.getTaskType());
            workflowEventPublisher.publishProcessRejected(instance, task.getNodeName(), comment);
            notifyInitiator(instance, task.getNodeName(), normalizedAction, comment);
            return R.ok();
        }

        // 审批通过 - 变量合并
        Map<String, Object> mergedVariables = mergeVariables(instance, editableVariables, task);

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
        WorkflowAddSignService.Completion completion = addSignGroups.completed(instance, task, history);
        if (completion == null) {
            workflowEventPublisher.publishTaskCompleted(instance, taskId, task.getNodeKey(), task.getNodeName(), normalizedAction, comment, history.getTaskType());
            return R.ok(Map.of("waitingForAddSign", true));
        }
        advanceApprovedTask(instance, completion.task(), mergedVariables);

        notifyInitiator(instance, task.getNodeName(), normalizedAction, comment);
        auditService.log(WorkflowAuditService.AuditAction.TASK_COMPLETE, taskId,
            "action=" + normalizedAction + ", nodeName=" + task.getNodeName());
        workflowEventPublisher.publishTaskCompleted(instance, taskId, task.getNodeKey(), task.getNodeName(),
                normalizedAction, comment, history.getTaskType());

        return R.ok();
    }

    @Override
    public R<?> rejectTask(String taskId, String targetNodeKey, String comment) {
        return rejectTask(taskId, targetNodeKey, comment, null);
    }

    @Override
    public R<?> rejectTask(String taskId, String targetNodeKey, String comment, String strategy) {
        log.info("[rejectTask] 开始驳回任务, taskId={}, targetNodeKey={}", taskId, targetNodeKey);

        if (!StringUtils.hasText(taskId)) {
            throw WorkflowException.validationError("任务ID不能为空");
        }
        if (!StringUtils.hasText(comment)) {
            throw WorkflowException.validationError("驳回原因不能为空，请填写驳回理由");
        }

        // 同 completeTask：锁覆盖整个事务生命周期，事务提交后才释放锁
        BusinessLock lock = businessLocks.getLock("lock:task:" + taskId);
        BusinessLock countersignLock = null;
        BusinessLock parentLock = null;
        try {
            if (!lock.tryLock(5, TimeUnit.SECONDS)) {
                throw WorkflowException.invalidState("任务处理中，请勿重复提交");
            }
            WfTask probe = taskMapper.selectById(taskId);
            if (probe == null) {
                throw WorkflowException.taskNotFound(taskId);
            }
            if (countersignService.isCountersignTask(probe)) {
                countersignLock = businessLocks.getLock("lock:countersign:" + countersignService.extractCountersignId(probe));
                if (!countersignLock.tryLock(5, TimeUnit.SECONDS)) {
                    throw WorkflowException.invalidState("会签处理中，请稍后重试");
                }
            }
            WfProcessInstance instance = requireTaskInstanceForOperation(probe, "驳回");
            if (StringUtils.hasText(instance.getParentInstanceId())) {
                parentLock = businessLocks.getLock("lock:instance:" + instance.getParentInstanceId());
                if (!parentLock.tryLock(5, TimeUnit.SECONDS)) {
                    throw WorkflowException.invalidState("父流程正在处理中");
                }
            }
            return businessLocks.execute(transactionTemplate, status -> doRejectByStrategy(taskId, targetNodeKey, comment, strategy));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new WorkflowException("SYSTEM_BUSY", "系统繁忙，请稍后重试");
        } finally {
            businessLocks.close(parentLock, countersignLock, lock);
        }
    }

    /**
     * rejectTask 的事务内业务段（外层已持有 lock:task:{taskId}，事务由 TransactionTemplate 管理）
     */
    private R<?> doRejectTask(String taskId, String targetNodeKey, String comment) {
        return doRejectTask(taskId, targetNodeKey, comment, "REJECT");
    }

    private R<?> doRejectTask(String taskId, String targetNodeKey, String comment, String action) {
        if (!StringUtils.hasText(targetNodeKey)) {
            throw WorkflowException.validationError("目标节点Key不能为空");
        }
        WfTask task = agents.lockTask(taskId);
        if (task == null) {
            throw WorkflowException.taskNotFound(taskId);
        }

        permissionService.checkRejectPermission(task);
        validateRejectTarget(task.getInstanceId(), task.getNodeKey(), targetNodeKey);
        hParticipantPolicy.assertTaskAction(task, UserContext.getUserId(), null);
        WfProcessInstance instance = requireTaskInstanceForOperation(task, "驳回");
        WfProcessDefinition definition = resolveDefinitionByInstance(instance);
        if (definition == null) throw WorkflowException.processNotFound(instance.getProcessDefKey());
        WorkflowRuntimeGraph graph = workflowGraphModelResolver.parseRuntimeGraph(definition.getModelJson());
        WfTaskHistory targetHistory = rewinds.target(instance, graph, task, targetNodeKey);

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
        history.setAction(action);
        history.setTaskType(TaskSemanticContext.resolve(WfTaskType.REJECT_JUMP.name()));
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
        historyState.record(instance, task, history);
        taskHistoryMapper.insert(history);
        completeTaskMonitor(task, history.getCreateTime(), "REJECT");

        // 删除当前任务
        taskMapper.deleteById(taskId);
        taskReminderJob.cancelAfterCommit(taskId);
        cleanupTaskReadData(taskId);

        // 在目标节点创建新任务
        try {
            WorkflowGatewayRewindPlan plan = rewinds.rewind(instance, graph, WorkflowExecutionContext.current(), targetHistory);
            WfNodeConfig root = workflowGraphModelResolver.parseRuntimeRoot(definition.getModelJson());
            WfNodeConfig targetNode = nodeExecutionService.findNode(root, plan.targetKey());
            if (targetNode == null) {
                throw WorkflowException.validationError("目标节点不存在: " + targetNodeKey);
            }
            WorkflowExecutionContext.run(plan.context(), () -> TaskSemanticContext.withType(WfTaskType.REJECT_JUMP.name(),
                    () -> nodeExecutionService.runNode(instance, targetNode, null, 0, root)));
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            throw new WorkflowException("REJECT_FAILED", "驳回失败: " + e.getMessage(), e);
        }

        auditService.log(WorkflowAuditService.AuditAction.TASK_REJECT, taskId, "targetNodeKey=" + targetNodeKey);
        workflowEventPublisher.publishTaskCompleted(instance, taskId, task.getNodeKey(), task.getNodeName(),
                action, comment, history.getTaskType());
        return R.ok();
    }

    private void advanceApprovedTask(WfProcessInstance instance, WfTask task, Map<String, Object> variables) {
        WfProcessDefinition definition = resolveDefinitionByInstance(instance);
        if (definition == null || !StringUtils.hasText(definition.getModelJson())) throw WorkflowException.invalidState("实例绑定的流程定义无法读取");
        WfNodeConfig root = workflowGraphModelResolver.parseRuntimeRoot(definition.getModelJson());
        WfNodeConfig completed = nodeExecutionService.findNode(root, task.getNodeKey());
        if (completed == null) throw WorkflowException.invalidState("审批节点不存在");
        nodeExecutionService.advanceAfterNode(instance, completed, task.getNodeKey(), variables, 0, root);
        try { approvalPostProcessor.process(completed, instance, "APPROVE", variables); }
        catch (Exception failure) { log.warn("审批后置处理失败, taskId={}", task.getTaskId(), failure); }
    }

    @Override
    @Audit(name = "移除顺序加签人员", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public R<?> removeOrderedSignatures(String taskId, List<Long> userIds, String reason) {
        WorkflowAddSignService.Reduction reduction = addSignGroups.remove(taskId, userIds, reason);
        if (reduction.completion() != null) {
            WfTask completed = reduction.completion().task();
            WfProcessInstance instance = processInstanceMapper.selectForExecution(completed.getTenantId(), completed.getInstanceId());
            if (instance == null || !WorkflowHistoryState.effectiveApproval(instance, reduction.completion().approval())) {
                throw WorkflowException.invalidState("原审批记录已失效");
            }
            WorkflowExecutionContext.run(WorkflowExecutionContext.parse(completed.getExecutionContext()),
                    () -> advanceApprovedTask(instance, completed, WorkflowWaitState.variables(instance)));
        }
        return R.ok(reduction.removed());
    }

    private WfNodeConfig resolveTaskNode(WfTask task, WfProcessInstance instance) {
        WfProcessDefinition definition = resolveDefinitionByInstance(instance);
        if (definition == null || !StringUtils.hasText(definition.getModelJson())) {
            return null;
        }
        return workflowGraphModelResolver.parseRuntimeGraph(definition.getModelJson()).getNode(task.getNodeKey());
    }

    private R<?> doRejectByStrategy(String taskId, String targetNodeKey, String comment, String requestedStrategy) {
        WfTask task = agents.lockTask(taskId);
        if (task == null) {
            throw WorkflowException.taskNotFound(taskId);
        }
        WfProcessInstance instance = requireTaskInstanceForOperation(task, "驳回");
        WorkflowExecutionContext.Frame context = WorkflowExecutionContext.parse(task.getExecutionContext());
        gateways.assertActive(instance, context);
        return WorkflowExecutionContext.call(context, () -> WorkflowDelegationReturnService.requiresReturn(task)
                ? doCompleteLockedTask(task, "REJECT", comment, null, null, UserContext.getUserId(), null)
                : doRejectLockedByStrategy(task, instance, targetNodeKey, comment, requestedStrategy));
    }

    private R<?> doRejectLockedByStrategy(WfTask task, WfProcessInstance instance, String targetNodeKey,
                                          String comment, String requestedStrategy) {
        String taskId = task.getTaskId();
        permissionService.checkRejectPermission(task);
        hParticipantPolicy.assertTaskAction(task, UserContext.getUserId(), null);

        if (!WfTaskStatus.TODO.getCode().equals(task.getStatus())
                || !WfProcessStatus.isActive(instance.getStatus())) {
            throw WorkflowException.invalidState("只有运行中流程的待办任务可以驳回");
        }
        processStateService.transition(instance, WfProcessStatus.TASK_BACK);
        WfNodeConfig node = resolveTaskNode(task, instance);
        String strategy = WorkflowRejectPolicy.resolve(requestedStrategy, node, targetNodeKey);
        if (!"TERMINATE".equals(strategy)) {
            WorkflowNodePolicy.assertAllowed(node, "allowRollback");
        }
        if (strategy == null) {
            return doRejectTask(taskId, targetNodeKey, comment);
        }
        if (!StringUtils.hasText(comment)) {
            throw WorkflowException.validationError("驳回原因不能为空");
        }
        String safeComment = securityUtils.sanitizeXss(comment);
        return switch (strategy) {
            case "TO_SPECIFIED_NODE" -> {
                String target = StringUtils.hasText(targetNodeKey) ? targetNodeKey : node == null ? null : node.getRejectToNodeKey();
                validateRejectTarget(task.getInstanceId(), task.getNodeKey(), target);
                cancelCountersignPeers(task);
                yield doRejectTask(taskId, target, safeComment);
            }
            case "TO_PREVIOUS_NODE" -> {
                WfProcessDefinition definition = resolveDefinitionByInstance(instance);
                if (definition == null) throw WorkflowException.processNotFound(instance.getProcessDefKey());
                WfTaskHistory previous = rewinds.target(instance, workflowGraphModelResolver.parseRuntimeGraph(definition.getModelJson()), task, null);
                cancelCountersignPeers(task);
                yield doRejectTask(taskId, previous.getNodeKey(), safeComment, "REJECT_TO_PREVIOUS");
            }
            case "TO_INITIATOR" -> rejectToInitiator(task, instance, safeComment);
            case "TERMINATE" -> finishByRejection(task, instance, safeComment, "TERMINATE");
            case "TO_PARENT_NODE" -> rejectToParent(task, instance, safeComment);
            default -> throw WorkflowException.validationError("未知驳回策略");
        };
    }

    private R<?> rejectToInitiator(WfTask task, WfProcessInstance instance, String comment) {
        WfProcessDefinition definition = resolveDefinitionByInstance(instance);
        if (definition == null) {
            throw WorkflowException.processNotFound(instance.getProcessDefKey());
        }
        WorkflowRuntimeGraph graph = workflowGraphModelResolver.parseRuntimeGraph(definition.getModelJson());
        recordStrategyRejection(task, instance, comment, WfTaskType.REJECT.name(), "TO_INITIATOR");
        rewinds.clear(instance);
        processStateService.transition(instance, WfProcessStatus.TASK_BACK);
        WfTask returned = new WfTask();
        returned.setTaskId(UUID.randomUUID().toString());
        returned.setTenantId(instance.getTenantId());
        returned.setInstanceId(instance.getInstanceId());
        returned.setNodeKey(graph.getStartNodeId());
        returned.setNodeName("发起人修改");
        returned.setAssignee(instance.getStartUserId());
        returned.setAssigneeName(instance.getStartUserName());
        returned.setAllowEdit(true);
        returned.setTaskType(WfTaskType.REJECT.name());
        returned.setStatus(WfTaskStatus.TODO.getCode());
        returned.setCreateTime(LocalDateTime.now());
        hParticipantPolicy.assertTaskAssignment(returned, returned.getAssignee());
        WorkflowExecutionContext.run(null, () -> agents.createTask(returned));
        createTaskMonitor(instance, returned);
        workflowEventPublisher.publishTaskAssigned(instance, returned.getTaskId(), returned.getNodeKey(),
                returned.getNodeName(), returned.getAssignee(), returned.getAssigneeName(), returned.getTaskType());
        notifyInitiator(instance, task.getNodeName(), "REJECT", comment);
        return R.ok();
    }

    private R<?> finishByRejection(WfTask task, WfProcessInstance instance, String comment, String reason) {
        recordStrategyRejection(task, instance, comment, WfTaskType.REJECT.name(), reason);
        cancelTasksForRejection(instance, null);
        nodeExecutionService.completeInstance(instance, WfProcessStatus.REJECTED.getCode());
        workflowEventPublisher.publishProcessRejected(instance, task.getNodeName(), comment);
        notifyInitiator(instance, task.getNodeName(), "REJECT", comment);
        return R.ok();
    }

    private R<?> rejectToParent(WfTask task, WfProcessInstance instance, String comment) {
        if (!StringUtils.hasText(instance.getParentInstanceId())) {
            return rejectToInitiator(task, instance, comment);
        }
        WfProcessInstance parent = processInstanceMapper.selectForExecution(instance.getTenantId(), instance.getParentInstanceId());
        if (parent == null || !WfProcessStatus.isOpen(parent.getStatus())) {
            return finishByRejection(task, instance, comment, "PARENT_FINISHED_DEGRADE_TO_TERMINATE");
        }
        if (!Objects.equals(parent.getTenantId(), instance.getTenantId())) {
            throw WorkflowException.permissionDenied("跨租户父流程驳回");
        }
        WfProcessDefinition parentDefinition = resolveDefinitionByInstance(parent);
        if (parentDefinition == null) {
            throw WorkflowException.processNotFound(parent.getProcessDefKey());
        }
        WfNodeConfig root = workflowGraphModelResolver.parseRuntimeRoot(parentDefinition.getModelJson());
        WfNodeConfig parentNode = nodeExecutionService.findNode(root, instance.getParentNodeKey());
        if (parentNode == null || !"SUBPROCESS".equals(parentNode.getType())) {
            throw WorkflowException.validationError("父流程子流程调用节点不存在");
        }
        WorkflowWaitState.Pending waiting = WorkflowWaitState.find(parent, instance.getInstanceId());
        if (waiting == null || !"SUBPROCESS".equals(waiting.kind()) || !instance.getParentNodeKey().equals(waiting.nodeKey())) {
            throw WorkflowException.invalidState("父流程已离开本次子流程等待，无法退回该调用节点");
        }
        gateways.assertActive(parent, waiting.context());
        WorkflowWaitState.finish(parent, null, waiting.waitId());
        recordStrategyRejection(task, instance, comment, WfTaskType.REJECT_JUMP.name(), "TO_PARENT_NODE");
        rewinds.clear(instance);
        nodeExecutionService.completeInstance(instance, WfProcessStatus.REJECTED.getCode());
        workflowEventPublisher.publishProcessRejected(instance, task.getNodeName(), comment);
        processStateService.transition(parent, WfProcessStatus.TASK_BACK);
        WorkflowExecutionContext.run(waiting.context(), () -> TaskSemanticContext.withType(WfTaskType.REJECT_JUMP.name(),
                () -> nodeExecutionService.runNode(parent, parentNode, WorkflowWaitState.variables(parent), 0, root)));
        return R.ok();
    }

    private void recordStrategyRejection(WfTask task, WfProcessInstance instance, String comment,
                                          String taskType, String strategy) {
        WfTaskHistory history = new WfTaskHistory();
        history.setHistoryId(UUID.randomUUID().toString());
        history.setTenantId(instance.getTenantId());
        history.setTaskId(task.getTaskId());
        history.setInstanceId(instance.getInstanceId());
        history.setNodeKey(task.getNodeKey());
        history.setNodeName(task.getNodeName());
        history.setOperatorId(UserContext.getUserId());
        history.setOperatorName(UserContext.getUserName());
        history.setTaskType(TaskSemanticContext.resolve(taskType));
        history.setAction("REJECT");
        history.setComment(comment);
        history.setCreateTime(LocalDateTime.now());
        try {
            history.setVariablesChanged(mergeHistoryMetadata(null, Map.of("rejectStrategy", strategy)));
        } catch (Exception exception) {
            throw new WorkflowException("REJECT_HISTORY_FAILED", "驳回记录保存失败", exception);
        }
        applyAdminOverrideMetadata(history, task, UserContext.getUserId());
        historyState.record(instance, task, history);
        taskHistoryMapper.insert(history);
        workflowEventPublisher.publishTaskCompleted(instance, task.getTaskId(), task.getNodeKey(), task.getNodeName(),
                "REJECT", comment, history.getTaskType());
        auditService.log(WorkflowAuditService.AuditAction.TASK_REJECT, task.getTaskId(), "strategy=" + strategy);
    }

    private void cancelCountersignPeers(WfTask task) {
        if (!countersignService.isCountersignTask(task)) {
            return;
        }
        WfProcessInstance instance = requireTaskInstanceForOperation(task, "驳回");
        cancelTasksForRejection(instance, task);
    }

    private void cancelTasksForRejection(WfProcessInstance instance, WfTask retainedTask) {
        LambdaQueryWrapper<WfTask> query = new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getInstanceId, instance.getInstanceId());
        if (retainedTask != null) {
            query.eq(WfTask::getCandidateRoles, retainedTask.getCandidateRoles())
                    .ne(WfTask::getTaskId, retainedTask.getTaskId());
        }
        Set<String> cancelledCountersigns = new HashSet<>();
        if (retainedTask != null) {
            cancelledCountersigns.add(countersignService.extractCountersignId(retainedTask));
        }
        for (WfTask pendingTask : taskMapper.selectList(query)) {
            if (countersignService.isCountersignTask(pendingTask)) {
                cancelledCountersigns.add(countersignService.extractCountersignId(pendingTask));
            }
            completeTaskMonitor(pendingTask, LocalDateTime.now(), "REJECT_CANCEL");
            taskReminderJob.cancelAfterCommit(pendingTask.getTaskId());
            cleanupTaskReadData(pendingTask.getTaskId());
            taskMapper.deleteById(pendingTask.getTaskId());
        }
        for (String countersignId : cancelledCountersigns) {
            WfCountersignTask countersign = countersignTaskMapper.selectById(countersignId);
            if (countersign != null && "VOTING".equals(countersign.getStatus())) {
                countersign.setStatus("REJECTED");
                countersign.setCompleteTime(LocalDateTime.now());
                countersignTaskMapper.updateById(countersign);
            }
        }
    }

    @Override
    public WfTask getTodoTask(String taskId) {
        Long tenantId = com.cloudflow.workflow.service.WorkflowLaunchContextService.requireTenant();
        Long userId = com.cloudflow.workflow.service.WorkflowLaunchContextService.requireUser();
        if (taskId == null || !taskId.matches("[A-Za-z0-9_-]{1,64}")) throw WorkflowException.permissionDenied("待办链接无效");
        WfTask task = taskMapper.selectById(taskId);
        if (task == null || !Objects.equals(task.getTenantId(), tenantId) || !"TODO".equals(task.getStatus())
                || !Objects.equals(task.getAssignee(), userId) && !agents.canRead(task, userId)) {
            throw WorkflowException.permissionDenied("任务已处理、已转交或无权查看");
        }
        permissionService.checkTaskReadPermission(task);
        enrichTodoTasks(List.of(task), userId);
        WfTask current = taskMapper.selectById(taskId);
        if (current == null || !Objects.equals(current.getTenantId(), tenantId) || !"TODO".equals(current.getStatus())
                || !Objects.equals(current.getVersion(), task.getVersion()) || !Objects.equals(current.getAssignee(), task.getAssignee())
                || !Objects.equals(current.getProxyUserId(), task.getProxyUserId())) {
            throw WorkflowException.permissionDenied("任务已处理、已转交或无权查看");
        }
        permissionService.checkTaskReadPermission(current);
        return task;
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
            instanceWrapper.in(WfProcessInstance::getStatus, WfProcessStatus.activeCodes());
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
        List<String> receivedTaskIds = Objects.equals(userId, UserContext.getUserId())
                ? agents.receivedTasks().stream().map(WfTask::getTaskId).toList() : List.of();
        queryWrapper.and(owner -> {
            owner.eq(WfTask::getAssignee, userId);
            if (!receivedTaskIds.isEmpty()) owner.or().in(WfTask::getTaskId, receivedTaskIds);
        });
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
        List<WfTask> tasks = resultPage.getRecords().stream().filter(permissionService::canReadTask).toList();

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
        LambdaQueryWrapper<WfTaskHistory> wrapper = WorkflowHistoryAttribution.completedHistory();
        wrapper.and(historyOwner -> historyOwner.eq(WfTaskHistory::getOperatorId, userId)
                .or().eq(WfTaskHistory::getOnBehalfOfUserId, userId));
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
        if (!Objects.equals(userId, UserContext.getUserId())) {
            throw new PermissionDeniedException("只能记录本人的已读状态");
        }
        WfTask task = taskMapper.selectById(taskId);
        if (task == null) {
            markCompletedTaskReadAsNoop(taskId, userId);
            return;
        }
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && !Objects.equals(currentTenantId, task.getTenantId())) {
            throw new PermissionDeniedException("无权访问该租户任务");
        }
        permissionService.checkTaskReadPermission(task);

        WfTaskRead read = new WfTaskRead();
        read.setTenantId(task.getTenantId());
        read.setTaskId(taskId);
        read.setUserId(userId);
        read.setReadTime(LocalDateTime.now());
        taskReadMapper.insertIfAbsent(read);
    }

    private void markCompletedTaskReadAsNoop(String taskId, Long userId) {
        WfTaskHistory history = taskHistoryMapper.selectPage(new Page<>(1, 1, false), new LambdaQueryWrapper<WfTaskHistory>()
                .eq(WfTaskHistory::getTaskId, taskId)
                .orderByDesc(WfTaskHistory::getCreateTime))
                .getRecords().stream().findFirst().orElse(null);
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
        nodePolicy.assertTaskAllowed(task, "allowUrge");

        WfTaskUrge urge = new WfTaskUrge();
        urge.setTenantId(instance.getTenantId());
        urge.setTaskId(taskId);
        urge.setSenderId(currentUserId);
        urge.setRecipientId(task.getAssignee());
        urge.setReason(reason);
        urge.setCreateTime(LocalDateTime.now());
        taskUrgeMapper.insert(urge);

        sysNoticeService.send(task.getAssignee(), "任务催办提醒",
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

        SysUser delegateUser = delegationReturns.target(task, delegateId);
        hParticipantPolicy.assertParticipantChange(task, List.of(delegateId));
        String delegateUserName = StringUtils.hasText(delegateUser.getNickName())
            ? delegateUser.getNickName()
            : delegateUser.getUserName();

        WfTask newTask = new WfTask();
        newTask.setTaskType(WfTaskType.TRANSFER.name());
        newTask.setTaskId(UUID.randomUUID().toString());
        newTask.setInstanceId(task.getInstanceId());
        newTask.setNodeName(task.getNodeName());
        newTask.setNodeKey(task.getNodeKey());
        newTask.setCandidateRoles(task.getCandidateRoles());
        newTask.setAssignee(delegateId);
        newTask.setAssigneeName(delegateUserName);
        newTask.setTenantId(task.getTenantId());
        newTask.setStatus(WfTaskStatus.TODO.getCode());
        newTask.setCreateTime(LocalDateTime.now());
        hParticipantPolicy.assertTaskAssignment(newTask, newTask.getAssignee());
        agents.createTask(newTask);
        addSignGroups.transferred(task, newTask);
        createTaskMonitor(instance, newTask);

        sysNoticeService.send(delegateId, "任务转办通知",
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

        String countersignResult = countersignService.vote(taskId, task.getAssignee(), task.getAssigneeName(), voteResult, comment);

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
        history.setTaskType(task.getTaskType());
        history.setCreateTime(LocalDateTime.now());
        applyAdminOverrideMetadata(history, task, currentUserId);
        if (task.getCreateTime() != null) {
            history.setDurationSeconds((int) java.time.Duration.between(task.getCreateTime(), LocalDateTime.now()).getSeconds());
        }
        historyState.record(requireTaskInstanceForOperation(task, "会签记录"), task, history);
        taskHistoryMapper.insert(history);
        completeTaskMonitor(task, history.getCreateTime(), "COUNTERSIGN_" + voteResult);

        if ("PASSED".equals(countersignResult) || "REJECTED".equals(countersignResult)) {
            completeCountersignFlow(task, countersignResult, variables, "COUNTERSIGN_" + voteResult,
                    comment, history.getTaskType());
        }
        return R.ok(countersignResult);
    }

    private void completeCountersignFlow(WfTask task, String countersignResult, Map<String, Object> variables,
                                         String action, String comment, String taskType) {
            WfProcessInstance instance = requireTaskInstanceForOperation(task, "会签处理");
            nodeExecutionService.saveProcessSnapshot(instance, task.getNodeKey(), task.getNodeName());

            if ("REJECTED".equals(countersignResult)) {
                WfNodeConfig node = resolveTaskNode(task, instance);
                if (node != null && node.getRejectStrategy() != null) {
                    WfTask rejectionTask = new WfTask();
                    rejectionTask.setTaskId(UUID.randomUUID().toString());
                    rejectionTask.setTenantId(task.getTenantId());
                    rejectionTask.setInstanceId(task.getInstanceId());
                    rejectionTask.setNodeKey(task.getNodeKey());
                    rejectionTask.setNodeName(task.getNodeName());
                    rejectionTask.setAssignee(task.getAssignee());
                    rejectionTask.setAssigneeName(task.getAssigneeName());
                    rejectionTask.setProxyUserId(task.getProxyUserId());
                    rejectionTask.setTaskType(WfTaskType.REJECT.name());
                    rejectionTask.setStatus(WfTaskStatus.TODO.getCode());
                    rejectionTask.setCreateTime(LocalDateTime.now());
                    hParticipantPolicy.assertTaskAssignment(rejectionTask, rejectionTask.getAssignee());
                    agents.createTask(rejectionTask);
                    TaskSemanticContext.callWithType(taskType != null && taskType.startsWith("AUTO_") ? taskType : null,
                            () -> doRejectByStrategy(rejectionTask.getTaskId(), null,
                                    StringUtils.hasText(comment) ? comment : "会签未通过", node.getRejectStrategy()));
                } else {
                    nodeExecutionService.completeInstance(instance, WfProcessStatus.REJECTED.getCode());
                    workflowEventPublisher.publishProcessRejected(instance, task.getNodeName(), comment);
                    notifyInitiator(instance, task.getNodeName(), "REJECT", "会签未通过");
                }
            } else {
                Map<String, Object> mergedVariables = mergeVariables(instance, variables, task);
                WfProcessDefinition def = resolveDefinitionByInstance(instance);
                try {
                    if (def != null && StringUtils.hasText(def.getModelJson())) {
                        WfNodeConfig root = workflowGraphModelResolver.parseRuntimeRoot(def.getModelJson());
                        WfNodeConfig completedNode = nodeExecutionService.findNode(root, task.getNodeKey());
                        nodeExecutionService.advanceAfterNode(instance, completedNode, task.getNodeKey(), mergedVariables, 0, root);
                    } else {
                        nodeExecutionService.completeInstance(instance, WfProcessStatus.PASSED.getCode());
                    }
                } catch (Exception e) {
                    throw new WorkflowException("COUNTERSIGN_FLOW_FAILED", "会签后流程流转失败: " + e.getMessage(), e);
                }
                notifyInitiator(instance, task.getNodeName(), "APPROVE", "会签已通过");
            }
            workflowEventPublisher.publishTaskCompleted(instance, task.getTaskId(), task.getNodeKey(), task.getNodeName(),
                action, comment, taskType);
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
     * 合并审批变量与实例变量。
     * 带乐观锁重试：并行分支同时审批时，冲突方重读实例、基于最新变量重新合并，
     * 避免后提交方的变量被静默丢弃；重试耗尽则抛异常回滚本次审批。
     */
    private Map<String, Object> mergeVariables(WfProcessInstance instance, Map<String, Object> newVariables) {
        return mergeVariables(instance, newVariables, null);
    }

    private Map<String, Object> mergeVariables(WfProcessInstance instance, Map<String, Object> newVariables, WfTask task) {
        hParticipantPolicy.assertTaskVariables(instance, newVariables);
        if (task == null && (newVariables == null || newVariables.isEmpty())) {
            return parseInstanceVariables(instance);
        }

        final int maxRetries = 3;
        WfProcessInstance current = instance;
        for (int attempt = 0; attempt < maxRetries; attempt++) {
            Map<String, Object> instanceVars = parseInstanceVariables(current);
            Map<String, Object> changes = newVariables == null ? Map.of() : newVariables;
            if (task != null) changes = formAccess.approval(task, current, changes, isTaskNodeAllowEdit(task)).changes();
            if (changes.isEmpty()) return instanceVars;
            for (Map.Entry<String, Object> entry : changes.entrySet()) {
                if (!entry.getKey().startsWith("_")) {
                    instanceVars.put(entry.getKey(), entry.getValue());
                }
            }
            hParticipantPolicy.assertRuntimeVariables(current, instanceVars);
            try {
                current.setVariables(objectMapper.writeValueAsString(instanceVars));
            } catch (Exception e) {
                throw WorkflowException.validationError("流程变量序列化失败: " + e.getMessage());
            }
            if (processInstanceMapper.updateById(current) > 0) {
                if (current != instance) {
                    // 将最新变量与乐观锁版本同步回调用方持有的实例对象，保证后续流转不因版本陈旧而失败
                    instance.setVariables(current.getVariables());
                    instance.setVersion(current.getVersion());
                }
                return instanceVars;
            }
            log.warn("[mergeVariables] 实例变量乐观锁冲突，重读后重试 (第 {}/{} 次), instanceId={}",
                    attempt + 1, maxRetries, instance.getInstanceId());
            current = processInstanceMapper.selectById(instance.getInstanceId());
            if (current == null) {
                throw WorkflowException.instanceNotFound(instance.getInstanceId());
            }
        }
        throw WorkflowException.invalidState("流程变量更新冲突次数过多，请稍后重试");
    }

    /**
     * 反序列化实例变量 JSON，失败返回空 Map
     */
    private Map<String, Object> parseInstanceVariables(WfProcessInstance instance) {
        Map<String, Object> instanceVars = new HashMap<>();
        if (StringUtils.hasText(instance.getVariables())) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> parsedVars = objectMapper.readValue(instance.getVariables(), Map.class);
                instanceVars = parsedVars;
            } catch (Exception e) { log.warn("[mergeVariables] 反序列化失败"); }
        }
        return instanceVars;
    }

    /**
     * 仅允许在节点开启 allowEdit 时提交业务变量；系统变量（_前缀）始终忽略。
     */
    private Map<String, Object> normalizeEditableVariables(WfTask task, Map<String, Object> variables, String action) {
        // 仅“同意”动作允许回写变量，拒绝/转办忽略客户端变量，避免误伤历史客户端调用。
        if (!"APPROVE".equalsIgnoreCase(action)) {
            return Collections.emptyMap();
        }

        Map<String, Object> editableVariables = new HashMap<>();
        for (Map.Entry<String, Object> entry : (variables == null ? Map.<String, Object>of() : variables).entrySet()) {
            String key = entry.getKey();
            if (StringUtils.hasText(key) && !key.startsWith("_")) {
                editableVariables.put(key, entry.getValue());
            }
        }

        WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
        if (instance == null) throw WorkflowException.instanceNotFound(task.getInstanceId());
        boolean allowEdit = isTaskNodeAllowEdit(task);
        if (formAccess.approval(task, instance, editableVariables, allowEdit).formBound()) return editableVariables;
        if (editableVariables.isEmpty()) {
            return Collections.emptyMap();
        }

        if (!allowEdit) {
            throw WorkflowException.validationError("当前节点不允许修改表单数据");
        }

        return editableVariables;
    }

    /**
     * WfTask.allowEdit 是列表展示用的非持久字段，处理任务时需从实例锁定的流程定义回读节点配置。
     */
    private boolean isTaskNodeAllowEdit(WfTask task) {
        if (task == null || !StringUtils.hasText(task.getInstanceId()) || !StringUtils.hasText(task.getNodeKey())) {
            return false;
        }
        if (Boolean.TRUE.equals(task.getAllowEdit())) {
            return true;
        }

        WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
        WfProcessDefinition def = resolveDefinitionByInstance(instance);
        if (def == null || !StringUtils.hasText(def.getModelJson())) {
            return false;
        }

        try {
            WfNodeConfig root = workflowGraphModelResolver.parseRuntimeRoot(def.getModelJson());
            WfNodeConfig node = nodeExecutionService.findNode(root, task.getNodeKey());
            return node != null && Boolean.TRUE.equals(node.getAllowEdit());
        } catch (Exception e) {
            log.warn("[isTaskNodeAllowEdit] 解析节点编辑权限失败, taskId={}, nodeKey={}: {}",
                    task.getTaskId(), task.getNodeKey(), e.getMessage());
            return false;
        }
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
                sysNoticeService.send(initiatorId, "审批进度通知", content, "1", currentUserId, UserContext.getUserName());
            }
        } catch (Exception e) {
            log.warn("[notifyInitiator] 通知失败: {}", e.getMessage());
        }
    }

    /**
     * 校验驳回目标节点合法性：
     * 1) 图拓扑校验——目标必须是当前节点沿入边反向可达的上游节点（祖先），
     *    并行兄弟分支的节点不在祖先集内，杜绝跨分支驳回导致的错误分支重建任务与汇聚计数错乱；
     * 2) 历史校验——目标节点必须实际执行过。
     */
    private void validateRejectTarget(String instanceId, String currentNodeKey, String targetNodeKey) {
        if (!StringUtils.hasText(targetNodeKey)) {
            throw WorkflowException.validationError("驳回目标节点不能为空");
        }
        if (targetNodeKey.equals(currentNodeKey)) {
            throw WorkflowException.validationError("驳回目标不能是当前节点");
        }

        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            throw WorkflowException.instanceNotFound(instanceId);
        }
        WfProcessDefinition def = resolveDefinitionByInstance(instance);
        if (def == null || !StringUtils.hasText(def.getModelJson())) {
            throw WorkflowException.processNotFound(instance.getProcessDefKey());
        }
        WfNodeConfig root = workflowGraphModelResolver.parseRuntimeRoot(def.getModelJson());
        WorkflowRuntimeGraph graph = workflowGraphModelResolver.resolveRuntimeGraph(root);
        if (graph == null) {
            throw WorkflowException.validationError("流程运行时图索引缺失，无法校验驳回目标");
        }

        // 反向 BFS 收集当前节点的全部祖先
        Set<String> ancestors = new HashSet<>();
        Deque<String> queue = new ArrayDeque<>();
        queue.add(currentNodeKey);
        while (!queue.isEmpty()) {
            String nodeId = queue.poll();
            for (WorkflowRuntimeGraph.EdgeLink edge : graph.getIncomingEdges(nodeId)) {
                String sourceId = edge.getSourceId();
                if (sourceId != null && ancestors.add(sourceId)) {
                    queue.add(sourceId);
                }
            }
        }
        if (!ancestors.contains(targetNodeKey)) {
            throw WorkflowException.validationError("驳回目标必须是当前节点的上游节点（不允许驳回到并行兄弟分支或下游节点）");
        }

        Long executedCount = taskHistoryMapper.selectCount(
            new LambdaQueryWrapper<WfTaskHistory>()
                .eq(WfTaskHistory::getInstanceId, instanceId)
                .eq(WfTaskHistory::getNodeKey, targetNodeKey));
        if (executedCount == null || executedCount == 0) {
            throw WorkflowException.validationError("只能驳回到已实际执行过的上游节点");
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
        agents.annotateHistory(history, task, operatorId);
        if (history.getOnBehalfOfUserId() != null || Objects.equals(task.getAssignee(), operatorId) || !permissionService.isAdmin(operatorId)) {
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
            if (task.getProxyUserId() != null) agents.canRead(task, task.getProxyUserId());
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
                        task.setNodePermissions(WorkflowNodePolicy.permissions(currentNode));
                        task.setRejectStrategy(currentNode.getRejectStrategy());
                        task.setRejectToNodeKey(currentNode.getRejectToNodeKey());
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
            task.setHistoryId(history.getHistoryId());
            task.setTaskType(history.getTaskType());
            task.setTaskId(history.getTaskId());
            task.setTenantId(history.getTenantId());
            task.setInstanceId(history.getInstanceId());
            task.setNodeKey(history.getNodeKey());
            task.setNodeName(history.getNodeName());
            task.setAssignee(WorkflowHistoryAttribution.owner(history));
            task.setAssigneeName(history.getOnBehalfOfUserId() == null ? history.getOperatorName() : history.getOnBehalfOfUserName());
            task.setOperatorId(history.getOperatorId());
            task.setOperatorName(history.getOperatorName());
            task.setOnBehalfOfUserId(history.getOnBehalfOfUserId());
            task.setOnBehalfOfUserName(history.getOnBehalfOfUserName());
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
                    WfTaskHistory history = historiesByInstance.getOrDefault(instance.getInstanceId(), List.of()).stream()
                            .filter(candidate -> Objects.equals(candidate.getHistoryId(), task.getHistoryId())).findFirst().orElse(null);
                    WfNodeConfig historyNode = nodeExecutionService.findNode(root, task.getNodeKey());
                    task.setCanWithdraw(WfProcessStatus.isActive(instance.getStatus()) && history != null
                            && Objects.equals(history.getOperatorId(), UserContext.getUserId())
                            && WorkflowHistoryState.effectiveApproval(instance, history) && historyNode != null
                            && WorkflowNodePolicy.allows(historyNode, "allowRollback"));
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
    public R<?> addSignature(String taskId, java.util.List<Long> userIds, String comment) {
        return executeSignatureChange(taskId, () -> doAddSignature(taskId, userIds, comment));
    }

    private R<?> doAddSignature(String taskId, java.util.List<Long> userIds, String comment) {
        Long currentUserId = UserContext.getUserId();
        log.info("[addSignature] 开始加签, taskId={}, userIds={}, userId={}", taskId, userIds, currentUserId);

        // 参数校验
        if (!StringUtils.hasText(taskId)) {
            throw WorkflowException.validationError("任务ID不能为空");
        }
        if (userIds == null || userIds.isEmpty() || userIds.size() > 100
                || userIds.stream().anyMatch(userId -> userId == null || userId <= 0)
                || new HashSet<>(userIds).size() != userIds.size()) {
            throw WorkflowException.validationError("请选择1至100个不同的加签用户");
        }
        if (!StringUtils.hasText(comment)) {
            throw WorkflowException.validationError("加签说明不能为空");
        }

        WfTask task = agents.lockTask(taskId);
        if (task == null) {
            throw WorkflowException.taskNotFound(taskId);
        }
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && !Objects.equals(currentTenantId, task.getTenantId())) {
            throw new PermissionDeniedException("无权访问该租户任务");
        }

        // 权限校验：只有当前任务处理人可以加签
        permissionService.checkTaskPermission(task);
        nodePolicy.assertTaskAllowed(task, "allowAddSign");
        hParticipantPolicy.assertFrozenParticipants(task.getInstanceId());

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
        BusinessLock lock = businessLocks.getLock("lock:countersign:" + countersignId);
        try {
            if (lock.tryLock(5, TimeUnit.SECONDS)) {
                // 锁内重新查询会签任务，确保数据最新
                csTask = countersignTaskMapper.selectForUpdate(task.getTenantId(), countersignId);
                if (csTask == null || !"VOTING".equals(csTask.getStatus())) {
                    throw WorkflowException.invalidState("会签状态已变更，无法加签");
                }

                int addedCount = 0;
                WfProcessInstance addSignInstance = requireTaskInstanceForOperation(task, "加签");
                // 为每个新增人员创建会签任务
                for (Long userId : userIds) {
                    // 检查用户是否已经是会签人
                    Long existingTaskCount = taskMapper.selectCount(
                        new LambdaQueryWrapper<WfTask>()
                            .eq(WfTask::getInstanceId, task.getInstanceId())
                            .eq(WfTask::getNodeKey, task.getNodeKey())
                            .eq(WfTask::getAssignee, userId)
                    );
                    if (existingTaskCount > 0 || countersignService.hasUserVoted(countersignId, userId)) {
                        log.warn("[addSignature] 用户{}已是会签人，跳过", userId);
                        continue;
                    }

                    // 创建新的会签任务
                    WfTask newTask = new WfTask();
                    newTask.setTaskType(WfTaskType.ADD_SIGN.name());
                    newTask.setTaskId(UUID.randomUUID().toString());
                    newTask.setInstanceId(task.getInstanceId());
                    newTask.setNodeName(task.getNodeName());
                    newTask.setNodeKey(task.getNodeKey());
                    newTask.setExecutionContext(task.getExecutionContext());
                    newTask.setAssignee(userId);
                    newTask.setTenantId(task.getTenantId());
                    newTask.setStatus(WfTaskStatus.TODO.getCode());
                    newTask.setCreateTime(LocalDateTime.now());
                    newTask.setCandidateRoles("CS:" + countersignId);

                    addedCount++;

                    SysUser toUser = delegationReturns.target(task, userId);
                    String toUserName = WorkflowDelegationReturnService.display(toUser);
                    newTask.setAssigneeName(toUserName);
                    hParticipantPolicy.assertTaskAssignment(newTask, newTask.getAssignee());
                    agents.createTask(newTask);
                    countersignService.addWeightParticipant(csTask, newTask);
                    createTaskMonitor(addSignInstance, newTask);
                    WfTaskHistory history = new WfTaskHistory();
                    history.setHistoryId(UUID.randomUUID().toString());
                    history.setTenantId(task.getTenantId());
                    history.setTaskId(newTask.getTaskId());
                    history.setInstanceId(task.getInstanceId());
                    history.setNodeKey(task.getNodeKey());
                    history.setNodeName(task.getNodeName());
                    history.setOperatorId(currentUserId);
                    history.setOperatorName(UserContext.getUserName());
                    history.setAction("ADD_SIGN");
                    history.setTaskType(WfTaskType.ADD_SIGN.name());
                    history.setComment(comment);
                    history.setCreateTime(LocalDateTime.now());
                    agents.annotateHistory(history, task, currentUserId);
                    historyState.recordDetails(addSignInstance, task, history, Map.of("countersignId", countersignId,
                            "addedUserId", userId, "addedUserName", toUserName));
                    if (taskHistoryMapper.insert(history) != 1) throw WorkflowException.invalidState("加签记录保存失败");
                    workflowEventPublisher.publishTaskAssigned(addSignInstance, newTask.getTaskId(), newTask.getNodeKey(), newTask.getNodeName(),
                            newTask.getAssignee(), newTask.getAssigneeName(), newTask.getTaskType());

                    // 发送通知
                    sysNoticeService.send(userId, "加签通知",
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
            if (lock != null) {
                lock.close();
            }
        }
    }

    @Override
    public R<?> reductionSignature(String taskId, java.util.List<Long> userIds, String comment) {
        return executeSignatureChange(taskId, () -> doReductionSignature(taskId, userIds, comment));
    }

    private R<?> doReductionSignature(String taskId, java.util.List<Long> userIds, String comment) {
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

        WfTask task = agents.lockTask(taskId);
        if (task == null) {
            throw WorkflowException.taskNotFound(taskId);
        }
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && !Objects.equals(currentTenantId, task.getTenantId())) {
            throw new PermissionDeniedException("无权访问该租户任务");
        }

        // 权限校验：只有当前任务处理人或管理员可以减签
        permissionService.checkTaskPermission(task);
        nodePolicy.assertTaskAllowed(task, "allowReduceSign");
        hParticipantPolicy.assertFrozenParticipants(task.getInstanceId());

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
        BusinessLock lock = businessLocks.getLock("lock:countersign:" + countersignId);
        try {
            if (lock.tryLock(5, TimeUnit.SECONDS)) {
                // 锁内重新查询会签任务，确保数据最新
                csTask = countersignTaskMapper.selectForUpdate(task.getTenantId(), countersignId);
                if (csTask == null || !"VOTING".equals(csTask.getStatus())) {
                    throw WorkflowException.invalidState("会签状态已变更，无法减签");
                }

                int removedCount = 0;
                for (Long userId : userIds) {
                    // 不能减签自己
                    if (userId.equals(task.getAssignee())) {
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
                        userTask = agents.lockTask(userTask.getTaskId());
                        countersignService.removeWeightParticipant(csTask, userTask);
                        agents.completeRelations(userTask);
                        if (taskMapper.deleteById(userTask.getTaskId()) != 1) throw WorkflowException.invalidState("减签任务已被处理，请重新读取");
                        
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
                        agents.annotateHistory(history, task, currentUserId);
                        history.setComment("减签: " + comment);
                        history.setAction("REDUCTION_SIGN");
                        history.setTaskType(WfTaskType.REDUCE_SIGN.name());
                        history.setCreateTime(LocalDateTime.now());
                        historyState.record(requireTaskInstanceForOperation(task, "减签"), userTask, history);
                        taskHistoryMapper.insert(history);
                        completeTaskMonitor(userTask, history.getCreateTime(), "REDUCTION_SIGN");
                        taskReminderJob.cancelAfterCommit(userTask.getTaskId());
                        cleanupTaskReadData(userTask.getTaskId());

                        removedCount++;
                    }

                    // 发送通知
                    sysNoticeService.send(userId, "减签通知",
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
                if ("WEIGHT".equals(csTask.getSignType()) && !"VOTING".equals(csTask.getStatus())) {
                    String result = csTask.getStatus();
                    String semantic = "PASSED".equals(result) ? "AUTO_PASS" : "AUTO_REJECT";
                    WorkflowCompletionContext.automatically(() -> {
                        completeCountersignFlow(task, result, Map.of(), semantic, "减签后票签达到结束条件", semantic);
                        return null;
                    });
                }

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
            if (lock != null) {
                lock.close();
            }
        }
    }

    private R<?> executeSignatureChange(String taskId, java.util.function.Supplier<R<?>> operation) {
        if (!StringUtils.hasText(taskId)) throw WorkflowException.validationError("任务ID不能为空");
        WfTask probe = taskMapper.selectById(taskId);
        if (probe == null) throw WorkflowException.taskNotFound(taskId);
        if (!Objects.equals(UserContext.getTenantId(), probe.getTenantId())) throw new PermissionDeniedException("无权访问该租户任务");
        if (!countersignService.isCountersignTask(probe)) throw WorkflowException.validationError("只有会签节点支持加减签操作");
        String countersignId = countersignService.extractCountersignId(probe);
        BusinessLock lock = businessLocks.getLock("lock:countersign:" + countersignId);
        try {
            if (!lock.tryLock(5, TimeUnit.SECONDS)) throw WorkflowException.invalidState("会签正在处理中，请稍后重试");
            return businessLocks.execute(transactionTemplate, status -> {
                WfTask locked = agents.lockTask(taskId);
                WorkflowExecutionContext.Frame context = WorkflowExecutionContext.parse(locked.getExecutionContext());
                gateways.assertActive(requireTaskInstanceForOperation(locked, "加减签"), context);
                return WorkflowExecutionContext.call(context, operation);
            });
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new WorkflowException("SYSTEM_BUSY", "系统繁忙，请稍后重试");
        } finally {
            if (lock != null) lock.close();
        }
    }

    /**
     * 统一校验任务归属的流程实例，防止异常数据导致跨租户误操作。
     */
    private WfProcessInstance requireTaskInstanceForOperation(WfTask task, String operation) {
        if (task == null || !StringUtils.hasText(task.getInstanceId())) {
            throw WorkflowException.validationError("任务缺少关联的流程实例信息");
        }

        WfProcessInstance instance = processInstanceMapper.selectForExecution(task.getTenantId(), task.getInstanceId());
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
        WfNodeConfig node = nodePolicy.resolveNode(instance, task.getNodeKey());
        taskReminderJob.registerAfterCommit(task.getTaskId(), node == null ? null : node.getSlaHours());
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
        agents.completeRelations(task);
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
            monitor.setStatus("REDUCTION_SIGN".equals(action) ? "CANCELLED" : "COMPLETED");
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
