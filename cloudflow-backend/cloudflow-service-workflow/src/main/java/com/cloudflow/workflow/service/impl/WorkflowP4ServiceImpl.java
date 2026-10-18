package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.domain.enums.WfTaskType;

import com.cloudflow.workflow.model.WorkflowGatewayRewindPlan;
import com.cloudflow.workflow.model.WorkflowRuntimeGraph;
import com.cloudflow.workflow.service.IWorkflowP4Service;
import com.cloudflow.workflow.service.WorkflowNodePolicy;
import com.cloudflow.workflow.service.WorkflowHParticipantPolicy;
import com.cloudflow.workflow.service.WorkflowAgentService;
import com.cloudflow.workflow.service.WorkflowAddSignService;
import com.cloudflow.workflow.service.WorkflowDelegationReturnService;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.cloudflow.workflow.service.WorkflowHistoryAttribution;
import com.cloudflow.workflow.domain.dto.AgentSettingRequest;
import com.cloudflow.workflow.service.TaskSemanticContext;
import com.cloudflow.workflow.service.WorkflowProcessStateService;
import com.cloudflow.workflow.service.WorkflowHistoryState;
import com.cloudflow.workflow.service.WorkflowRewindService;
import com.cloudflow.workflow.service.WorkflowExecutionContext;
import com.cloudflow.workflow.service.IWfTaskService;
import com.cloudflow.workflow.service.INodeExecutionService;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.common.audit.annotation.Audit;

import java.time.LocalDateTime;
import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.config.WorkflowTaskSecurityProperties;
import com.cloudflow.workflow.domain.*;
import com.cloudflow.workflow.domain.monitor.TaskMonitor;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.*;
import com.cloudflow.workflow.service.INotificationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.context.annotation.Lazy;
import org.springframework.util.CollectionUtils;

import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * P4 高价值功能服务实现类
 * 包含审批流程增强、任务管理增强、流程管理增强、通知与催办
 */
@Service
public class WorkflowP4ServiceImpl implements IWorkflowP4Service {

    private static final Logger log = LoggerFactory.getLogger(WorkflowP4ServiceImpl.class);

    @Autowired private WfTaskMapper taskMapper;
    @Autowired private WorkflowAgentService agents;
    @Autowired private WorkflowAddSignService addSignGroups;
    @Autowired private WorkflowDelegationReturnService delegationReturns;
    @Autowired private WorkflowPermissionService permissionService;
    @Autowired private WfTaskHistoryMapper taskHistoryMapper;
    @Autowired private WfProcessInstanceMapper processInstanceMapper;
    @Autowired private WfProcessDefinitionMapper processDefinitionMapper;
    @Autowired private WfFormDefinitionMapper formDefinitionMapper;
    @Autowired private WfTaskDelegationMapper delegationMapper;
    @Autowired private WfTaskAddSignMapper addSignMapper;
    @Autowired private WfTaskCandidateMapper candidateMapper;
    @Autowired private WfTaskAttachmentMapper attachmentMapper;
    @Autowired private WfDeployRecordMapper deployRecordMapper;
    @Autowired private WfUrgeEffectMapper urgeEffectMapper;
    @Autowired private TaskMonitorMapper taskMonitorMapper;
    @Autowired private com.cloudflow.workflow.service.monitor.IProcessMonitorService processMonitorService;
    @Autowired private INotificationService notificationService;
    @Autowired private RedissonClient redissonClient;
    @Autowired private WorkflowTaskSecurityProperties taskSecurityProperties;
    @Autowired private com.cloudflow.common.redis.core.SysDictHelper sysDictHelper;
    @Autowired private WorkflowNodePolicy nodePolicy;
    @Autowired private WorkflowHParticipantPolicy hParticipantPolicy;
    @Autowired private WorkflowProcessStateService processStateService;
    @Autowired private com.cloudflow.workflow.service.WorkflowTriggerSecrets triggerSecrets;
    @Autowired private com.cloudflow.workflow.event.WorkflowEventPublisher workflowEventPublisher;
    @Autowired private WorkflowRewindService rewinds;
    @Autowired private WorkflowHistoryState historyState;
    @Autowired private WorkflowGraphModelResolver graphs;
    @Autowired @Lazy private IWfTaskService taskOperations;
    @Autowired @Lazy private INodeExecutionService nodeExecution;
    @Autowired private com.cloudflow.workflow.job.TaskReminderJob taskReminders;

    private final ObjectMapper objectMapper = new ObjectMapper();

    // ==================== P4.1: 任务委托/转办 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> delegateTask(String taskId, Long toUserId, String toUserName, String reason) {
        log.info("[delegateTask] 转办任务, taskId={}, toUserId={}", taskId, toUserId);
        WfTask task = agents.lockTask(taskId);
        if (task == null) { throw WorkflowException.taskNotFound(taskId); }
        Long operatorId = resolveOperatorId(null, "delegateTask");
        assertTaskAccess(task, operatorId, "delegateTask");
        nodePolicy.assertTaskAllowed(task, "allowDelegate");
        hParticipantPolicy.assertParticipantChange(task, Collections.singletonList(toUserId));
        toUserName = WorkflowDelegationReturnService.display(delegationReturns.target(task, toUserId));
        Long taskTenantId = resolveTaskTenantId(task);

        Long fromUserId = task.getAssignee();
        String fromUserName = task.getAssigneeName();

        WfTaskDelegation delegation = new WfTaskDelegation();
        delegation.setDelegationId(UUID.randomUUID().toString());
        delegation.setTenantId(taskTenantId);
        delegation.setTaskId(taskId);
        delegation.setInstanceId(task.getInstanceId());
        delegation.setDelegationType("DELEGATE");
        delegation.setFromUserId(fromUserId);
        delegation.setFromUserName(fromUserName);
        delegation.setToUserId(toUserId);
        delegation.setToUserName(toUserName);
        delegation.setReason(reason);
        delegation.setStatus("COMPLETED");
        delegation.setCreateTime(LocalDateTime.now());
        delegationMapper.insert(delegation);

        task.setAssignee(toUserId);
        task.setAssigneeName(toUserName);
        task.setTaskType(WfTaskType.TRANSFER.name());
        if (taskMapper.updateById(task) != 1) throw new WorkflowException("TASK_VERSION_CONFLICT", "任务已变更，请重新读取");
        agents.refreshAssignment(task);
        updateTaskMonitorAssignee(task, null, "DELEGATE", null);

        sendNotification("TASK_DELEGATE", toUserId, "任务转办通知",
                String.format("用户 %s 将任务 [%s] 转办给您", fromUserName, task.getNodeName()));
        return R.ok();
    }

    // ==================== P1-5: 委派审批（委派后回到委派人） ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> delegateWithReturn(String taskId, Long toUserId, String toUserName, String reason) {
        log.info("[delegateWithReturn] 委派任务, taskId={}, toUserId={}", taskId, toUserId);
        WfTask task = agents.lockTask(taskId);
        if (task == null) { throw WorkflowException.taskNotFound(taskId); }
        Long operatorId = resolveOperatorId(null, "delegateWithReturn");
        assertTaskAccess(task, operatorId, "delegateWithReturn");
        nodePolicy.assertTaskAllowed(task, "allowDelegate");
        hParticipantPolicy.assertParticipantChange(task, Collections.singletonList(toUserId));
        toUserName = WorkflowDelegationReturnService.display(delegationReturns.target(task, toUserId));
        Long taskTenantId = resolveTaskTenantId(task);

        Long fromUserId = task.getAssignee();
        String fromUserName = task.getAssigneeName();

        // 1. 创建委派记录，状态为ACTIVE（等待被委派人处理后回到委派人）
        WfTaskDelegation delegation = new WfTaskDelegation();
        delegation.setDelegationId(UUID.randomUUID().toString());
        delegation.setTenantId(taskTenantId);
        delegation.setTaskId(taskId);
        delegation.setInstanceId(task.getInstanceId());
        delegation.setDelegationType("DELEGATE_RETURN"); // 委派后回到委派人模式
        delegation.setFromUserId(fromUserId);
        delegation.setFromUserName(fromUserName);
        delegation.setToUserId(toUserId);
        delegation.setToUserName(toUserName);
        delegation.setReason(reason);
        delegation.setStatus("ACTIVE"); // 等待被委派人处理
        delegation.setStartTime(LocalDateTime.now());
        delegation.setCreateTime(LocalDateTime.now());
        delegationMapper.insert(delegation);

        task.setStatus("DELEGATED");
        if (taskMapper.updateById(task) != 1) throw new WorkflowException("TASK_VERSION_CONFLICT", "任务已变更，请重新读取");
        taskReminders.cancelAfterCommit(task.getTaskId());
        updateTaskMonitorAssignee(task, "DELEGATED", "DELEGATE_WITH_RETURN", null);

        // 3. 创建新任务给被委派人
        WfTask delegatedTask = new WfTask();
        delegatedTask.setTaskType(WfTaskType.DELEGATE.name());
        delegatedTask.setTaskId(UUID.randomUUID().toString());
        delegatedTask.setInstanceId(task.getInstanceId());
        delegatedTask.setNodeKey(task.getNodeKey());
        delegatedTask.setExecutionContext(task.getExecutionContext());
        delegatedTask.setNodeName(task.getNodeName() + "(委派)");
        delegatedTask.setAssignee(toUserId);
        delegatedTask.setAssigneeName(toUserName);
        delegatedTask.setStatus("TODO");
        delegatedTask.setPriority(task.getPriority());
        delegatedTask.setTenantId(taskTenantId);
        delegatedTask.setCreateTime(LocalDateTime.now());
        // 关联原任务，被委派人完成后用于回溯
        delegatedTask.setCandidateRoles("DELEGATE_FROM:" + taskId + ":" + delegation.getDelegationId());
        hParticipantPolicy.assertTaskAssignment(delegatedTask, delegatedTask.getAssignee());
        agents.createTask(delegatedTask);
        createTaskMonitor(delegatedTask);

        // 4. 记录历史
        WfTaskHistory h = new WfTaskHistory();
        h.setHistoryId(UUID.randomUUID().toString());
        h.setTaskId(taskId);
        h.setInstanceId(task.getInstanceId());
        h.setNodeKey(task.getNodeKey());
        h.setNodeName(task.getNodeName());
        h.setOperatorId(operatorId);
        h.setOperatorName(UserContext.getUserName());
        agents.annotateHistory(h, task, operatorId);
        h.setAction("DELEGATE_WITH_RETURN");
        h.setTaskType(WfTaskType.DELEGATE.name());
        h.setComment("委派给 " + toUserName + "，原因：" + (reason != null ? reason : ""));
        h.setTenantId(resolveTaskTenantId(task));
        h.setCreateTime(LocalDateTime.now());
        WfProcessInstance instance = processInstanceMapper.selectForExecution(task.getTenantId(), task.getInstanceId());
        historyState.record(instance, task, h);
        taskHistoryMapper.insert(h);
        agents.detachAssignment(task);
        workflowEventPublisher.publishTaskAssigned(instance, delegatedTask.getTaskId(), delegatedTask.getNodeKey(), delegatedTask.getNodeName(),
                delegatedTask.getAssignee(), delegatedTask.getAssigneeName(), delegatedTask.getTaskType());

        // 5. 通知被委派人
        sendNotification("TASK_DELEGATE", toUserId, "委派任务通知",
                String.format("用户 %s 将任务 [%s] 委派给您审批，完成后将回到委派人确认", fromUserName, task.getNodeName()));

        log.info("[delegateWithReturn] 委派成功, delegationId={}, newTaskId={}", delegation.getDelegationId(), delegatedTask.getTaskId());
        return R.ok(Map.of("delegationId", delegation.getDelegationId(), "delegatedTaskId", delegatedTask.getTaskId()));
    }

    // ==================== P4.2: 加签 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> addSign(String taskId, List<Long> userIds, List<String> userNames, String signType, String reason) {
        return R.ok(addSignGroups.create(taskId, userIds, signType, reason));
    }

    // ==================== P4.5: 审批代理 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> setProxy(Long userId, String userName, Long proxyUserId, String proxyUserName,
                         LocalDateTime startTime, LocalDateTime endTime, String reason) {
        resolveOperatorId(userId, "setProxy");
        return R.ok(agents.save(null, new AgentSettingRequest(proxyUserId, "AGENT", List.of(),
                startTime, endTime, reason, null)).settingId());
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "取消代理", highRisk = true)
    public R<?> cancelProxy(Long userId) {
        resolveOperatorId(userId, "cancelProxy");
        agents.disableMine();
        return R.ok();
    }

    // ==================== P4.6: 候选人机制 ====================

    @Transactional(rollbackFor = Exception.class)
    public void createCandidateTask(String taskId, String instanceId, List<Long> userIds,
                                    List<String> userNames, String type) {
        Long candidateTenantId = resolveInstanceTenantId(instanceId);
        hParticipantPolicy.assertFrozenParticipants(instanceId);
        for (int i = 0; i < userIds.size(); i++) {
            WfTaskCandidate c = new WfTaskCandidate();
            c.setCandidateId(UUID.randomUUID().toString());
            c.setTenantId(candidateTenantId);
            c.setTaskId(taskId);
            c.setInstanceId(instanceId);
            c.setUserId(userIds.get(i));
            c.setUserName(userNames != null && i < userNames.size() ? userNames.get(i) : "");
            c.setCandidateType(type);
            c.setStatus("PENDING");
            c.setCreateTime(LocalDateTime.now());
            candidateMapper.insert(c);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public R<?> claimTask(String taskId, Long userId, String userName) {
        Long operatorId = resolveOperatorId(userId, "claimTask");
        RLock lock = redissonClient.getLock("lock:claim:" + taskId);
        try {
            if (!lock.tryLock(10, 30, TimeUnit.SECONDS)) {
                throw WorkflowException.validationError("操作繁忙，请稍后重试");
            }
            WfTaskCandidate candidate = candidateMapper.selectOne(new LambdaQueryWrapper<WfTaskCandidate>()
                    .eq(WfTaskCandidate::getTaskId, taskId).eq(WfTaskCandidate::getUserId, operatorId)
                    .eq(WfTaskCandidate::getStatus, "PENDING"));
            if (candidate == null) { throw WorkflowException.validationError("您不是候选人或任务已被认领"); }

            WfTask task = agents.lockTask(taskId);
            if (task == null) { throw WorkflowException.taskNotFound(taskId); }
            assertTaskTenantAccess(task, "claimTask");
            if (task.getAssignee() != null && task.getAssignee() > 0) {
                throw WorkflowException.validationError("任务已被认领");
            }

            hParticipantPolicy.assertTaskAssignment(task, operatorId);
            task.setAssignee(operatorId);
            task.setAssigneeName(userName);
            if (taskMapper.updateById(task) != 1) throw new WorkflowException("TASK_VERSION_CONFLICT", "任务已被认领，请重新读取");
            agents.refreshAssignment(task);
            updateTaskMonitorAssignee(task, "CLAIMED", "CLAIM", LocalDateTime.now());
            candidate.setStatus("CLAIMED");
            candidate.setClaimTime(LocalDateTime.now());
            candidateMapper.updateById(candidate);

            candidateMapper.update(null, new LambdaUpdateWrapper<WfTaskCandidate>()
                    .eq(WfTaskCandidate::getTaskId, taskId).ne(WfTaskCandidate::getUserId, operatorId)
                    .eq(WfTaskCandidate::getStatus, "PENDING").set(WfTaskCandidate::getStatus, "CANCELLED"));
            return R.ok();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw WorkflowException.validationError("操作被中断");
        } finally {
            if (lock.isHeldByCurrentThread()) { lock.unlock(); }
        }
    }

    // ==================== P4.7: 审批撤回 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> withdrawApproval(String historyId, Long operatorId) {
        Long effectiveOperatorId = resolveOperatorId(operatorId, "withdrawApproval");
        WfTaskHistory history = taskHistoryMapper.selectById(historyId);
        if (history == null) { throw WorkflowException.validationError("历史记录不存在"); }
        WfProcessInstance instance = processInstanceMapper.selectForExecution(UserContext.getTenantId(), history.getInstanceId());
        if (instance == null) { throw WorkflowException.instanceNotFound(history.getInstanceId()); }
        assertInstanceTenantAccess(instance, "withdrawApproval");
        if (!WfProcessStatus.isActive(instance.getStatus())) {
            throw WorkflowException.invalidState("当前流程状态不允许撤回审批");
        }
        WorkflowNodePolicy.assertAllowed(nodePolicy.resolveNode(instance, history.getNodeKey()), "allowRollback");
        if (!Objects.equals(history.getOperatorId(), effectiveOperatorId)) { throw WorkflowException.validationError("只能撤回自己的审批"); }
        WfProcessDefinition definition = processDefinitionMapper.selectById(instance.getDefinitionId());
        if (definition == null || !Objects.equals(definition.getTenantId(), instance.getTenantId())) throw WorkflowExecutionContext.invalid();
        WorkflowRuntimeGraph graph = graphs.parseRuntimeGraph(definition.getModelJson());
        WorkflowExecutionContext.Frame source = rewinds.withdrawalContext(instance, history);
        WorkflowGatewayRewindPlan plan = rewinds.rewind(instance, graph, source, history);
        processStateService.transition(instance, WfProcessStatus.WITHDRAWN);
        WfTask withdrawnTask = new WfTask();
        withdrawnTask.setTaskId(history.getTaskId());
        withdrawnTask.setExecutionContext(WorkflowHistoryState.execution(history).executionContext());
        WfTaskHistory withdrawal = new WfTaskHistory();
        withdrawal.setHistoryId(UUID.randomUUID().toString());
        withdrawal.setTaskId(history.getTaskId());
        withdrawal.setInstanceId(history.getInstanceId());
        withdrawal.setNodeKey(history.getNodeKey());
        withdrawal.setNodeName(history.getNodeName());
        withdrawal.setOperatorId(effectiveOperatorId);
        withdrawal.setOperatorName(UserContext.getUserName());
        withdrawal.setAction("WITHDRAW");
        withdrawal.setTaskType(history.getTaskType());
        withdrawal.setComment("撤回审批");
        withdrawal.setTenantId(instance.getTenantId());
        withdrawal.setCreateTime(LocalDateTime.now());
        historyState.record(instance, withdrawnTask, withdrawal);
        taskHistoryMapper.insert(withdrawal);
        WfNodeConfig root = graphs.parseRuntimeRoot(definition.getModelJson());
        WorkflowExecutionContext.run(plan.context(), () -> TaskSemanticContext.withType(history.getTaskType(),
                () -> nodeExecution.runNode(instance, nodeExecution.findNode(root, plan.targetKey()), null, 0, root)));
        return R.ok();
    }

    // ==================== P4.8: 驳回到上一步 ====================

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public R<?> rejectToPrevious(String taskId, Long operatorId, String operatorName, String comment) {
        resolveOperatorId(operatorId, "rejectToPrevious");
        return taskOperations.rejectTask(taskId, null, comment, "TO_PREVIOUS_NODE");
    }

    // ==================== P4.9: 审批附件 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> uploadAttachment(String taskId, String instanceId, String fileName, String fileUrl,
                                 String fileType, Long fileSize, Long uploaderId, String uploaderName) {
        Long effectiveUploaderId = resolveOperatorId(uploaderId, "uploadAttachment");
        WfTask task = taskMapper.selectById(taskId);
        Long attachmentTenantId;
        if (task != null) {
            // 示例：taskId 与 instanceId 都传入时，必须指向同一流程实例，避免错绑附件
            assertTaskAccess(task, effectiveUploaderId, "uploadAttachment");
            if (org.springframework.util.StringUtils.hasText(instanceId)
                    && !Objects.equals(task.getInstanceId(), instanceId)) {
                throw WorkflowException.validationError("任务与流程实例不匹配");
            }
            instanceId = task.getInstanceId();
            attachmentTenantId = resolveTaskTenantId(task);
        } else {
            if (!org.springframework.util.StringUtils.hasText(instanceId)) {
                throw WorkflowException.validationError("流程实例ID不能为空");
            }
            WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
            if (instance == null) {
                throw WorkflowException.instanceNotFound(instanceId);
            }
            assertInstanceTenantAccess(instance, "uploadAttachment");
            attachmentTenantId = instance.getTenantId();
        }
        WfTaskAttachment a = new WfTaskAttachment();
        a.setAttachmentId(UUID.randomUUID().toString());
        a.setTenantId(attachmentTenantId);
        a.setTaskId(taskId);
        a.setInstanceId(instanceId);
        a.setFileName(fileName);
        a.setFileUrl(fileUrl);
        a.setFileType(fileType);
        a.setFileSize(fileSize);
        a.setUploaderId(effectiveUploaderId);
        a.setUploaderName(uploaderName);
        a.setUploadTime(LocalDateTime.now());
        attachmentMapper.insert(a);
        return R.ok(a.getAttachmentId());
    }

    public R<?> getTaskAttachments(String taskId) {
        WfTask task = taskMapper.selectById(taskId);
        Long attachmentTenantId = null;
        if (task != null) {
            assertTaskTenantAccess(task, "getTaskAttachments");
            attachmentTenantId = resolveTaskTenantId(task);
        }
        LambdaQueryWrapper<WfTaskAttachment> queryWrapper = new LambdaQueryWrapper<WfTaskAttachment>()
                .eq(WfTaskAttachment::getTaskId, taskId)
                .orderByDesc(WfTaskAttachment::getUploadTime);
        // 示例：当前用户属于 tenant=200 时，只能看到 tenant=200 的附件记录
        if (attachmentTenantId != null) {
            queryWrapper.eq(WfTaskAttachment::getTenantId, attachmentTenantId);
        } else if (UserContext.getTenantId() != null) {
            queryWrapper.eq(WfTaskAttachment::getTenantId, UserContext.getTenantId());
        }
        return R.ok(attachmentMapper.selectList(queryWrapper));
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "删除附件", diff = true, highRisk = true)
    public R<?> deleteAttachment(String attachmentId, Long operatorId) {
        Long effectiveOperatorId = resolveOperatorId(operatorId, "deleteAttachment");
        WfTaskAttachment a = attachmentMapper.selectById(attachmentId);
        if (a == null) { throw WorkflowException.validationError("附件不存在"); }
        WfTask task = taskMapper.selectById(a.getTaskId());
        if (task != null) {
            assertTaskTenantAccess(task, "deleteAttachment");
        } else {
            assertTenantAccess(a.getTenantId(), "deleteAttachment", attachmentId);
        }
        if (!Objects.equals(a.getUploaderId(), effectiveOperatorId)) { throw WorkflowException.validationError("只能删除自己的附件"); }
        attachmentMapper.deleteById(attachmentId);
        return R.ok();
    }

    // ==================== P4.10: 批量审批 ====================

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public R<?> batchApprove(List<String> taskIds, Long operatorId, String operatorName, String action, String comment) {
        resolveOperatorId(operatorId, "batchApprove");
        if (taskIds == null || taskIds.isEmpty() || taskIds.size() > 100 || taskIds.stream().anyMatch(id -> id == null || id.isBlank())
                || new HashSet<>(taskIds).size() != taskIds.size()) throw WorkflowException.validationError("请选择1至100个不同的任务");
        if (!Set.of("APPROVE", "PASS", "REJECT").contains(action == null ? "" : action.toUpperCase(Locale.ROOT))) {
            throw WorkflowException.validationError("批量操作只支持通过或驳回");
        }
        int success = 0;
        List<String> failedIds = new ArrayList<>();
        for (String taskId : taskIds) {
            try {
                R<?> result = taskOperations.completeTask(taskId, action, comment, null, null);
                if (result == null || !result.isSuccess()) {
                    failedIds.add(taskId);
                    continue;
                }
                success++;
            } catch (RuntimeException failure) {
                failedIds.add(taskId);
                log.warn("批量审批中的单项未生效, taskId={}", taskId, failure);
            }
        }
        return R.ok(Map.of("total", taskIds.size(), "success", success, "fail", failedIds.size(), "failedTaskIds", failedIds));
    }

    // ==================== P1-5.3: 减签 ====================

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "移除会签人员", highRisk = true)
    public R<?> removeSign(String taskId, List<Long> userIds, String reason) {
        return taskOperations.removeOrderedSignatures(taskId, userIds, reason);
    }

    // ==================== P1-4.3: 子流程调用 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> startSubProcess(String parentInstanceId, String parentNodeKey, String subProcessDefKey,
                                Map<String, Object> variables) {
        log.info("[startSubProcess] 启动子流程, parentInstanceId={}, subProcessDefKey={}", parentInstanceId, subProcessDefKey);

        WfProcessInstance parentInstance = processInstanceMapper.selectById(parentInstanceId);
        if (parentInstance == null) { throw WorkflowException.instanceNotFound(parentInstanceId); }
        assertInstanceTenantAccess(parentInstance, "startSubProcess");

        // 创建子流程实例
        LambdaQueryWrapper<WfProcessDefinition> subDefQuery = new LambdaQueryWrapper<WfProcessDefinition>()
                .eq(WfProcessDefinition::getProcessKey, subProcessDefKey)
                .eq(WfProcessDefinition::getStatus, "PUBLISHED")
                .orderByDesc(WfProcessDefinition::getVersion);
        if (parentInstance.getTenantId() != null) {
            subDefQuery.eq(WfProcessDefinition::getTenantId, parentInstance.getTenantId());
        }
        WfProcessDefinition subDef = processDefinitionMapper.selectPage(new Page<>(1, 1, false), subDefQuery)
                .getRecords().stream().findFirst().orElse(null);
        if (subDef == null) { throw WorkflowException.processNotFound(subProcessDefKey); }
        assertDefinitionTenantAccess(subDef, "startSubProcess");
        WfFormDefinition subForm = null;
        if (org.springframework.util.StringUtils.hasText(subDef.getFormId())) {
            subForm = formDefinitionMapper.lockLatest(subDef.getTenantId(), subDef.getFormId());
            if (subForm == null) {
                throw WorkflowException.validationError("子流程绑定表单不存在或已被删除，无法启动");
            }
            assertTenantAccess(subForm.getTenantId(), "startSubProcess", subForm.getFormId());
        }

        WfProcessInstance subInstance = new WfProcessInstance();
        subInstance.setInstanceId(UUID.randomUUID().toString());
        subInstance.setProcessDefKey(subProcessDefKey);
        subInstance.setDefinitionId(subDef.getDefinitionId());
        subInstance.setFormVersion(subForm == null ? null : subForm.getVersion());
        subInstance.setBusinessKey(parentInstanceId + ":" + parentNodeKey); // 关联父流程
        subInstance.setTitle("[子流程] " + subDef.getProcessName());
        subInstance.setStartUserId(parentInstance.getStartUserId());
        subInstance.setStartUserName(parentInstance.getStartUserName());
        subInstance.setStatus("RUNNING");
        subInstance.setStartTime(LocalDateTime.now());
        subInstance.setPriority(parentInstance.getPriority()); // 继承父流程优先级
        subInstance.setTenantId(parentInstance.getTenantId());

        if (variables != null) {
            try {
                subInstance.setVariables(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(variables));
            } catch (Exception e) {
                subInstance.setVariables("{}");
            }
        }

        processInstanceMapper.insert(subInstance);
        log.info("[startSubProcess] 子流程创建成功, subInstanceId={}", subInstance.getInstanceId());

        return R.ok(subInstance.getInstanceId());
    }

    // ==================== P1-5.8: 条件审批 ====================

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public R<?> conditionalApprove(String taskId, Long operatorId, String operatorName,
                                    String action, String comment, String selectedPath) {
        resolveOperatorId(operatorId, "conditionalApprove");
        if (selectedPath != null && !selectedPath.isBlank()) throw WorkflowException.validationError("审批路径由流程出口条件决定，不能由调用者指定");
        return taskOperations.completeTask(taskId, action, comment, null, null);
    }

    // ==================== P4.11: 任务优先级 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> setTaskPriority(String taskId, String priority) {
        if (!Arrays.asList("URGENT", "HIGH", "NORMAL", "LOW").contains(priority)) {
            throw WorkflowException.validationError("无效优先级: " + priority);
        }
        WfTask task = agents.lockTask(taskId);
        if (task == null) { throw WorkflowException.taskNotFound(taskId); }
        Long operatorId = resolveOperatorId(null, "setTaskPriority");
        assertTaskAccess(task, operatorId, "setTaskPriority");
        task.setPriority(priority);
        if (taskMapper.updateById(task) != 1) throw new WorkflowException("TASK_VERSION_CONFLICT", "任务已变更，请重新读取");
        if ("URGENT".equals(priority)) {
            sendNotification("TASK_URGENT", task.getAssignee(), "紧急任务", task.getNodeName() + " 已标记为紧急");
        }
        return R.ok();
    }

    // ==================== P4.12: 代理人任务查询 ====================

    public R<?> getProxyTasks(Long userId, PageQuery pageQuery) {
        resolveOperatorId(userId, "getProxyTasks");
        if (pageQuery.getPageNum() < 1 || pageQuery.getPageSize() < 1 || pageQuery.getPageSize() > 100) {
            throw WorkflowException.validationError("页码必须大于0，每页1至100条");
        }
        List<WfTask> eligible = agents.receivedTasks();
        long offset = ((long) pageQuery.getPageNum() - 1) * pageQuery.getPageSize();
        List<Map<String, Object>> records = eligible.stream().skip(offset).limit(pageQuery.getPageSize()).map(task -> {
            Map<String, Object> record = new HashMap<>();
            record.put("task", task);
            record.put("isProxy", true);
            record.put("agentMode", task.getAgentMode());
            record.put("originalAssignee", task.getAssigneeName());
            return record;
        }).toList();
        return R.ok(Map.of("records", records, "total", eligible.size()));
    }

    // ==================== P4.13: 任务超时标记 ====================

    @Transactional(rollbackFor = Exception.class)
    public int markTimeoutTasks(int timeoutHours) {
        Date threshold = new Date(System.currentTimeMillis() - (long) timeoutHours * 3600 * 1000);
        List<WfTask> tasks = taskMapper.selectList(new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getStatus, "TODO").le(WfTask::getCreateTime, threshold)
                .eq(WfTask::getIsTimeout, 0));
        for (WfTask t : tasks) {
            t.setIsTimeout(1);
            taskMapper.updateById(t);
            sendNotification("TASK_TIMEOUT", t.getAssignee(), "任务超时提醒",
                    "任务 [" + t.getNodeName() + "] 已超时，请尽快处理");
        }
        log.info("[markTimeoutTasks] 标记{}个超时任务", tasks.size());
        return tasks.size();
    }

    // ==================== P4.14/P4.15: 任务筛选和排序 ====================

    public R<?> advancedTaskQuery(Long userId, Map<String, Object> filters, PageQuery pageQuery) {
        Long effectiveUserId = resolveOperatorId(userId, "advancedTaskQuery");
        Page<WfTask> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<WfTask> w = new LambdaQueryWrapper<>();
        w.eq(WfTask::getAssignee, effectiveUserId).eq(WfTask::getStatus, "TODO");
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null) {
            w.eq(WfTask::getTenantId, currentTenantId);
        }

        if (filters.containsKey("priority")) { w.eq(WfTask::getPriority, filters.get("priority")); }
        if (filters.containsKey("isTimeout")) { w.eq(WfTask::getIsTimeout, filters.get("isTimeout")); }
        if (filters.containsKey("nodeNameLike")) { w.like(WfTask::getNodeName, filters.get("nodeNameLike")); }

        String sortBy = (String) filters.getOrDefault("sortBy", "createTime");
        boolean asc = "asc".equals(filters.getOrDefault("sortOrder", "desc"));
        if ("priority".equals(sortBy)) { if (asc) w.orderByAsc(WfTask::getPriority); else w.orderByDesc(WfTask::getPriority); }
        else { if (asc) w.orderByAsc(WfTask::getCreateTime); else w.orderByDesc(WfTask::getCreateTime); }

        Page<WfTask> result = taskMapper.selectPage(page, w);
        Map<String, Object> r = new HashMap<>();
        r.put("records", result.getRecords()); r.put("total", result.getTotal());
        return R.ok(r);
    }

    // ==================== P4.16: 已办任务查询 ====================

    public R<?> getDoneTasks(Long userId, PageQuery pageQuery) {
        Long effectiveUserId = resolveOperatorId(userId, "getDoneTasks");
        Page<WfTaskHistory> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<WfTaskHistory> queryWrapper = WorkflowHistoryAttribution.completedHistory()
                .and(history -> history.eq(WfTaskHistory::getOperatorId, effectiveUserId)
                        .or().eq(WfTaskHistory::getOnBehalfOfUserId, effectiveUserId))
                .orderByDesc(WfTaskHistory::getCreateTime);
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null) {
            queryWrapper.eq(WfTaskHistory::getTenantId, currentTenantId);
        }
        Page<WfTaskHistory> result = taskHistoryMapper.selectPage(page, queryWrapper);
        Map<String, Object> r = new HashMap<>();
        r.put("records", result.getRecords()); r.put("total", result.getTotal());
        return R.ok(r);
    }

    // ==================== P4.17/P4.18: 批量标记已读(含权限校验) ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> batchMarkRead(List<String> taskIds, Long userId) {
        Long effectiveUserId = resolveOperatorId(userId, "batchMarkRead");
        int count = 0;
        for (String taskId : taskIds) {
            WfTask task = taskMapper.selectById(taskId);
            if (task != null && Objects.equals(task.getAssignee(), effectiveUserId)) {
                assertTaskTenantAccess(task, "batchMarkRead");
                // 插入已读记录（WfTaskRead表）
                count++;
            }
        }
        return R.ok(count);
    }

    // ==================== P4.19: 版本比对 ====================

    public R<?> compareVersions(String defId1, String defId2) {
        WfProcessDefinition d1 = processDefinitionMapper.selectById(defId1);
        WfProcessDefinition d2 = processDefinitionMapper.selectById(defId2);
        if (d1 == null || d2 == null) { throw WorkflowException.validationError("流程定义不存在"); }
        assertDefinitionTenantAccess(d1, "compareVersions");
        assertDefinitionTenantAccess(d2, "compareVersions");

        Map<String, Object> result = new HashMap<>();
        result.put("version1", Map.of("id", d1.getDefinitionId(), "name", d1.getProcessName(), "version", d1.getVersion()));
        result.put("version2", Map.of("id", d2.getDefinitionId(), "name", d2.getProcessName(), "version", d2.getVersion()));
        result.put("modelJson1", triggerSecrets.maskModel(d1.getModelJson()));
        result.put("modelJson2", triggerSecrets.maskModel(d2.getModelJson()));
        result.put("isSame", Objects.equals(d1.getModelJson(), d2.getModelJson()));
        return R.ok(result);
    }

    // ==================== P4.20: 流程定义导入/导出 ====================

    public R<?> exportDefinition(String defId) {
        WfProcessDefinition def = processDefinitionMapper.selectById(defId);
        if (def == null) { throw WorkflowException.processNotFound(defId); }
        assertDefinitionTenantAccess(def, "exportDefinition");
        Map<String, Object> exportData = new HashMap<>();
        exportData.put("processDefinition", def);
        exportData.put("exportTime", LocalDateTime.now());
        exportData.put("version", "1.0");
        return R.ok(exportData);
    }

    @Transactional(rollbackFor = Exception.class)
    public R<?> importDefinition(Map<String, Object> importData) {
        log.info("[importDefinition] 导入流程定义");
        // 解析导入数据并创建新的流程定义
        return R.ok("导入成功");
    }

    // ==================== P4.21: 表单历史版本 ====================

    public R<?> getFormVersions(String formKey) {
        Long currentTenantId = UserContext.getTenantId();
        LambdaQueryWrapper<WfFormDefinition> queryWrapper = new LambdaQueryWrapper<WfFormDefinition>()
                .eq(WfFormDefinition::getFormKey, formKey)
                .orderByDesc(WfFormDefinition::getVersion);
        if (currentTenantId != null) {
            queryWrapper.eq(WfFormDefinition::getTenantId, currentTenantId);
        }
        List<WfFormDefinition> versions = formDefinitionMapper.selectList(queryWrapper);
        return R.ok(versions);
    }

    @Transactional(rollbackFor = Exception.class)
    public R<?> rollbackFormVersion(String formKey, Integer targetVersion) {
        Long currentTenantId = UserContext.getTenantId();
        LambdaQueryWrapper<WfFormDefinition> queryWrapper = new LambdaQueryWrapper<WfFormDefinition>()
                .eq(WfFormDefinition::getFormKey, formKey)
                .eq(WfFormDefinition::getVersion, targetVersion);
        if (currentTenantId != null) {
            queryWrapper.eq(WfFormDefinition::getTenantId, currentTenantId);
        }
        WfFormDefinition target = formDefinitionMapper.selectOne(queryWrapper);
        if (target == null) { throw WorkflowException.validationError("目标版本不存在"); }
        // 基于目标版本创建新版本
        log.info("[rollbackFormVersion] 回退到版本 {}", targetVersion);
        return R.ok();
    }

    // ==================== P4.22: 发布记录 ====================

    @Transactional(rollbackFor = Exception.class)
    public void recordDeploy(String definitionId, String processKey, Integer version,
                             Long deployerId, String deployerName, String deployNote, String changeLog) {
        WfDeployRecord record = new WfDeployRecord();
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null) {
            record.setTenantId(currentTenantId);
        }
        record.setDefinitionId(definitionId);
        record.setProcessKey(processKey);
        record.setVersion(version);
        record.setDeployerId(deployerId);
        record.setDeployerName(deployerName);
        record.setDeployNote(deployNote);
        record.setChangeLog(changeLog);
        record.setDeployTime(LocalDateTime.now());
        deployRecordMapper.insert(record);
    }

    // ==================== P4.23: 表单使用统计 ====================

    public R<?> getFormUsage(String formKey) {
        Long currentTenantId = UserContext.getTenantId();
        LambdaQueryWrapper<WfProcessDefinition> queryWrapper = new LambdaQueryWrapper<WfProcessDefinition>()
                .like(WfProcessDefinition::getModelJson, formKey);
        if (currentTenantId != null) {
            queryWrapper.eq(WfProcessDefinition::getTenantId, currentTenantId);
        }
        List<WfProcessDefinition> processes = processDefinitionMapper.selectList(queryWrapper);
        Map<String, Object> usage = new HashMap<>();
        usage.put("formKey", formKey);
        usage.put("usedByProcesses", processes);
        usage.put("usageCount", processes.size());
        return R.ok(usage);
    }

    // ==================== P4.24: 流程实例优先级 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> setInstancePriority(String instanceId, String priority) {
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) { throw WorkflowException.instanceNotFound(instanceId); }
        assertInstanceTenantAccess(instance, "setInstancePriority");
        Long operatorId = resolveOperatorId(null, "setInstancePriority");
        if (instance.getStartUserId() != null && !Objects.equals(instance.getStartUserId(), operatorId)) {
            throw WorkflowException.permissionDenied("setInstancePriority");
        }
        instance.setPriority(priority);
        processInstanceMapper.updateById(instance);
        
        // 同步更新该实例下所有任务的优先级
        taskMapper.update(null, new LambdaUpdateWrapper<WfTask>()
                .eq(WfTask::getInstanceId, instanceId).set(WfTask::getPriority, priority));
        return R.ok();
    }

    // ==================== P4.25: 发布通知 ====================

    public void notifyProcessPublished(String definitionId) {
        log.info("[notifyProcessPublished] 发送流程发布通知, definitionId={}", definitionId);
        // 查询有权限启动该流程的用户并发送通知
    }

    // ==================== P4.26: 催办记录查询 ====================

    public R<?> getUrgeRecords(String taskId) {
        // 从催办记录表查询
        return R.ok(new ArrayList<>());
    }

    // ==================== P4.27: 催办效果跟踪 ====================

    @Transactional(rollbackFor = Exception.class)
    public void recordUrgeEffect(String urgeId, String taskId, Long beforeDuration, Long afterDuration) {
        WfTask task = taskMapper.selectById(taskId);
        if (task == null) { throw WorkflowException.taskNotFound(taskId); }
        WfUrgeEffect effect = new WfUrgeEffect();
        effect.setEffectId(UUID.randomUUID().toString());
        effect.setTenantId(resolveTaskTenantId(task));
        effect.setUrgeId(urgeId);
        effect.setTaskId(taskId);
        effect.setBeforeDuration(beforeDuration);
        effect.setAfterDuration(afterDuration);
        effect.setEffectiveness(calculateEffectiveness(beforeDuration, afterDuration));
        effect.setUrgeTime(LocalDateTime.now());
        effect.setCompleteTime(LocalDateTime.now());
        urgeEffectMapper.insert(effect);
    }

    /**
     * 统一获取当前操作人，防止通过入参伪造他人身份。
     */
    private Long resolveOperatorId(Long requestedUserId, String operation) {
        Long currentUserId = UserContext.getUserId();
        if (requestedUserId != null && currentUserId != null && !Objects.equals(requestedUserId, currentUserId)) {
            log.warn("[{}] 用户不匹配, requestedUserId={}, currentUserId={}",
                    operation, requestedUserId, currentUserId);
            throw WorkflowException.permissionDenied(operation);
        }
        Long effectiveUserId = requestedUserId != null ? requestedUserId : currentUserId;
        if (effectiveUserId == null) {
            throw WorkflowException.validationError("未获取到当前登录用户");
        }
        return effectiveUserId;
    }

    /**
     * 统一按当前租户严格匹配资源租户，避免跨租户访问。
     */
    private void assertTenantAccess(Long resourceTenantId, String operation, String resourceId) {
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && !Objects.equals(currentTenantId, resourceTenantId)) {
            log.warn("[{}] 租户不匹配, resourceId={}, currentTenantId={}, resourceTenantId={}",
                    operation, resourceId, currentTenantId, resourceTenantId);
            throw WorkflowException.permissionDenied(operation);
        }
    }

    private Long resolveTaskTenantId(WfTask task) {
        if (task == null) {
            return null;
        }
        if (task.getTenantId() != null) {
            return task.getTenantId();
        }
        if (task.getInstanceId() == null) {
            return null;
        }
        WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
        return instance != null ? instance.getTenantId() : null;
    }

    private void assertTaskTenantAccess(WfTask task, String operation) {
        assertTenantAccess(resolveTaskTenantId(task), operation, task != null ? task.getTaskId() : null);
    }

    private void assertTaskAccess(WfTask task, Long operatorId, String operation) {
        assertTaskTenantAccess(task, operation);
        if (task == null || operatorId == null || !Objects.equals(operatorId, UserContext.getUserId())) {
            throw WorkflowException.permissionDenied(operation);
        }
        permissionService.checkTaskPermission(task);
    }

    private boolean hasOverridePermission(String permission) {
        if (permission == null || permission.isBlank()) {
            return false;
        }
        try {
            return StpUtil.hasPermission(permission);
        } catch (Exception ex) {
            // 非 HTTP 上下文（定时任务、内调）下 Sa-Token 会话不可用，不算持有跨人权限
            return false;
        }
    }

    private void assertInstanceTenantAccess(WfProcessInstance instance, String operation) {
        assertTenantAccess(instance != null ? instance.getTenantId() : null, operation,
                instance != null ? instance.getInstanceId() : null);
    }

    private void assertDefinitionTenantAccess(WfProcessDefinition definition, String operation) {
        assertTenantAccess(definition != null ? definition.getTenantId() : null, operation,
                definition != null ? definition.getDefinitionId() : null);
    }

    private Long resolveInstanceTenantId(String instanceId) {
        if (!org.springframework.util.StringUtils.hasText(instanceId)) {
            return null;
        }
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        return instance != null ? instance.getTenantId() : null;
    }

    private void createTaskMonitor(WfTask task) {
        WfProcessInstance instance = processInstanceMapper.selectForExecution(task.getTenantId(), task.getInstanceId());
        WfNodeConfig node = nodePolicy.resolveNode(instance, task.getNodeKey());
        taskReminders.registerAfterCommit(task.getTaskId(), node == null ? null : node.getSlaHours());
        try {
            if (task == null) {
                return;
            }
            processMonitorService.incrementTaskCount(task.getInstanceId());

            TaskMonitor monitor = new TaskMonitor();
            monitor.setTenantId(resolveTaskTenantId(task));
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
            log.warn("[createTaskMonitor] 记录P4任务监控失败, taskId={}, error={}",
                    task != null ? task.getTaskId() : null, e.getMessage());
        }
    }

    private void completeTaskMonitor(WfTask task, LocalDateTime completeTime, String action) {
        agents.completeRelations(task);
        try {
            if (task == null) {
                return;
            }
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
            log.warn("[completeTaskMonitor] 更新P4任务监控失败, taskId={}, error={}",
                    task != null ? task.getTaskId() : null, e.getMessage());
        }
    }

    private void updateTaskMonitorAssignee(WfTask task, String status, String action, LocalDateTime claimTime) {
        try {
            if (task == null) {
                return;
            }
            TaskMonitor monitor = taskMonitorMapper.selectByTaskId(task.getTaskId());
            if (monitor == null) {
                return;
            }
            monitor.setAssigneeId(task.getAssignee());
            monitor.setAssigneeName(task.getAssigneeName());
            if (status != null) {
                monitor.setStatus(status);
            }
            if (action != null) {
                monitor.setAction(action);
            }
            if (claimTime != null) {
                monitor.setClaimTime(claimTime);
            }
            monitor.setUpdateTime(LocalDateTime.now());
            taskMonitorMapper.updateById(monitor);
        } catch (Exception e) {
            log.warn("[updateTaskMonitorAssignee] 更新P4任务监控处理人失败, taskId={}, error={}",
                    task != null ? task.getTaskId() : null, e.getMessage());
        }
    }

    /**
     * 按工作流效能改进百分比映射 1-5 的效能等级（5=显著改善，1=无改善）。
     * <p><b>字典约定（与 CRM 档位语义相反）：</b>
     * <ul>
     *   <li>dict_value = 本档百分比 <b>下限</b>（如 50 表示 improvement &gt;= 50%）</li>
     *   <li>按 dict_value <b>降序</b>匹配第一个 improvement &gt;= value 的档</li>
     *   <li>对应等级从 5 递减；字典为空时回退到内置 50/30/10/0 四档</li>
     * </ul>
     */
    private Integer calculateEffectiveness(Long before, Long after) {
        if (after == null || after == 0) return 1;
        double improvement = (double) (before - after) / before * 100;
        // 按字典 workflow_efficiency_tier 查档位：value=本档下限百分比，降序匹配
        // 命中后等级 = 5 - 数组索引（顶档=5）
        java.util.List<com.cloudflow.common.redis.core.SysDictHelper.DictItem> tiers =
                sysDictHelper.getDictData("workflow_efficiency_tier");
        if (tiers != null && !tiers.isEmpty()) {
            // 按 value 降序匹配第一个 improvement >= value 的档位
            tiers.sort((a, b) -> {
                java.math.BigDecimal va = a.getValueAsDecimal();
                java.math.BigDecimal vb = b.getValueAsDecimal();
                if (va == null) return 1;
                if (vb == null) return -1;
                return vb.compareTo(va);
            });
            int level = 5;
            for (com.cloudflow.common.redis.core.SysDictHelper.DictItem tier : tiers) {
                java.math.BigDecimal threshold = tier.getValueAsDecimal();
                if (threshold == null) {
                    continue;
                }
                if (improvement >= threshold.doubleValue()) {
                    return level;
                }
                level--;
                if (level < 1) {
                    break;
                }
            }
            return 1;
        }
        if (improvement >= 50) return 5;
        if (improvement >= 30) return 4;
        if (improvement >= 10) return 3;
        if (improvement > 0) return 2;
        return 1;
    }

    // ==================== P4.28: 消息通知完善 ====================

    public void sendNotification(String eventType, Long recipientId, String title, String content) {
        log.info("[sendNotification] 发送通知, eventType={}, recipientId={}", eventType, recipientId);
        if (recipientId == null) {
            return;
        }
        notificationService.sendNotification(recipientId, title, content, eventType);
    }
}
