package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.service.WorkflowBusinessLockService;
import com.cloudflow.workflow.service.WorkflowBusinessLockService.BusinessLock;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.workflow.domain.vo.DraftLaunchContextVO;
import com.cloudflow.workflow.domain.vo.WorkflowGatewayTrace;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.workflow.domain.*;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;
import com.cloudflow.workflow.domain.enums.WfTaskType;
import com.cloudflow.workflow.domain.vo.DynamicMapVO;
import com.cloudflow.workflow.domain.vo.UserBriefVO;
import com.cloudflow.workflow.event.WorkflowEventPublisher;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.listener.GlobalListenerDispatcher;
import com.cloudflow.workflow.mapper.*;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.model.WorkflowRuntimeGraph;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.cloudflow.workflow.service.*;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.dao.DuplicateKeyException;
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
 * 流程实例管理服务实现
 * 从原工作流服务拆分而来，负责流程的启动、撤回、暂停、恢复、查询等操作
 * 参考 RuoYi-Cloud-Plus IFlwInstanceService 设计
 *
 * @author CloudFlow
 */
@Service
public class WfInstanceServiceImpl implements IWfInstanceService {

    private static final Logger log = LoggerFactory.getLogger(WfInstanceServiceImpl.class);

    @Autowired
    private WorkflowBusinessLockService businessLocks;

    @Autowired
    private RedissonClient redissonClient;
    @Autowired
    private WorkflowProcessNumberService processNumbers;
    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;
    @Autowired
    private WfProcessDefinitionMapper processDefinitionMapper;
    @Autowired
    private WfFormDefinitionMapper formDefinitionMapper;
    @Autowired
    private WfTaskMapper taskMapper;
    @Autowired
    private WfTaskHistoryMapper taskHistoryMapper;
    @Autowired
    private WfNodeRecordMapper nodeRecordMapper;
    @Autowired
    private WorkflowPermissionService permissionService;
    @Autowired
    private RateLimiterService rateLimiterService;
    @Autowired
    private WorkflowAuditService auditService;
    @Autowired
    private WorkflowSecurityUtils securityUtils;
    @Autowired
    private MessageSender sysNoticeService;
    @Autowired
    private INodeExecutionService nodeExecutionService;
    @Autowired
    private WorkflowEventPublisher workflowEventPublisher;
    @Autowired
    private GlobalListenerDispatcher globalListenerDispatcher;
    @Autowired
    private com.cloudflow.workflow.service.monitor.IProcessMonitorService processMonitorService;
    @Autowired
    private WfCountersignTaskMapper countersignTaskMapper;
    @Autowired
    private WfCountersignVoteMapper countersignVoteMapper;
    @Autowired(required = false)
    private TimerSchedulerService timerSchedulerService;
    @Autowired
    private WorkflowGraphModelResolver workflowGraphModelResolver;

    @Autowired
    private IWorkflowCacheService workflowCacheService;

    @Autowired
    private TransactionTemplate transactionTemplate;
    @Autowired
    private InitiatorSelectionService initiatorSelectionService;
    @Autowired
    private com.cloudflow.workflow.mapper.WfFormDraftMapper formDraftMapper;
    @Autowired
    private com.cloudflow.workflow.service.WorkflowLaunchContextService launchContexts;
    @Autowired
    private com.cloudflow.workflow.service.WorkflowFormInputService formInputs;
    @Autowired
    private com.cloudflow.workflow.service.WorkflowFormFileService formFiles;
    @Autowired
    private WorkflowProcessStateService processStateService;
    @Autowired
    private WorkflowGatewayService gateways;
    @Autowired
    private WorkflowHParticipantPolicy hParticipantPolicy;
    @Autowired
    @org.springframework.context.annotation.Lazy
    private IWfTaskService timerTaskService;

    /** 父流程变量中记录"已处理的子流程结束事件"的幂等标记前缀（值为子流程实例ID） */
    private static final String SUBPROCESS_DONE_VARIABLE_PREFIX = "_subprocessDone_";

    private final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> startProcess(String processDefKey, String businessKey, Map<String, Object> variables) {
        return startProcess(processDefKey, businessKey, variables, null);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> startProcess(String processDefKey, String businessKey, Map<String, Object> variables,
                             Map<String, List<Long>> nodeAssignees) {
        if (businessKey != null && businessKey.startsWith("WF_DRAFT:")) {
            throw WorkflowException.validationError("该业务键前缀仅供草稿提交使用");
        }
        if (variables != null && variables.keySet().stream().anyMatch(key -> key.startsWith("_") && !"_title".equals(key))) {
            throw WorkflowException.validationError("流程发起不能携带服务端保留变量");
        }
        return doStartProcess(processDefKey, businessKey, UserContext.getUserId(), UserContext.getUserName(),
                UserContext.getTenantId(), variables, true, nodeAssignees, null);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> startProcessFromDraft(String expectedDefinitionId, String processDefKey, String businessKey,
                                      Map<String, Object> variables, Map<String, List<Long>> nodeAssignees) {
        if (!StringUtils.hasText(expectedDefinitionId) || businessKey == null || !businessKey.startsWith("WF_DRAFT:")) {
            throw WorkflowException.validationError("草稿启动上下文无效");
        }
        return doStartProcess(processDefKey, businessKey, UserContext.getUserId(), UserContext.getUserName(),
                UserContext.getTenantId(), variables, true, nodeAssignees, expectedDefinitionId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> startProcessInternal(Long tenantId, String processDefKey, String businessKey, Long startUserId,
                                     String startUserName, Map<String, Object> variables) {
        return startProcessInternal(tenantId, processDefKey, businessKey, startUserId, startUserName, variables, null);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> startProcessInternal(Long tenantId, String processDefKey, String businessKey, Long startUserId,
                                     String startUserName, Map<String, Object> variables,
                                     Map<String, List<Long>> nodeAssignees) {
        if (tenantId == null) {
            throw WorkflowException.validationError("tenantId不能为空");
        }
        Long contextTenantId = UserContext.getTenantId();
        if (contextTenantId == null || !Objects.equals(contextTenantId, tenantId)) {
            throw WorkflowException.validationError("租户上下文不一致，无法启动流程");
        }
        UserBriefVO user = resolveStartUser(startUserId);
        Long effectiveUserId = user != null && user.getUserId() != null ? user.getUserId() : startUserId;
        String effectiveUserName = StringUtils.hasText(startUserName)
                ? startUserName
                : user != null && StringUtils.hasText(user.getNickName()) ? user.getNickName()
                : user != null ? user.getUsername() : null;
        return doStartProcess(processDefKey, businessKey, effectiveUserId, effectiveUserName, tenantId,
                variables, false, nodeAssignees, null);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> recallProcess(String instanceId) {
        log.info("[recallProcess] 开始撤回流程, instanceId={}", instanceId);

        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            throw WorkflowException.instanceNotFound(instanceId);
        }
        checkInstanceTenantAccess(instance, "撤回");

        // 只有发起人或管理员可以撤回
        permissionService.checkRecallPermission(instance);

        if (!WfProcessStatus.isActive(instance.getStatus())) {
            throw WorkflowException.invalidState("只有运行中的流程可以撤回");
        }

        // 检查是否只在第一个审批节点（未被审批过）
        List<WfTaskHistory> histories = taskHistoryMapper.selectList(
            new LambdaQueryWrapper<WfTaskHistory>()
                .eq(WfTaskHistory::getInstanceId, instanceId)
                .orderByAsc(WfTaskHistory::getCreateTime)
        );
        if (histories != null && !histories.isEmpty()) {
            throw WorkflowException.invalidState("流程已有审批记录，无法撤回");
        }

        // 更新实例状态（乐观锁：0 行说明与审批等操作并发冲突，回滚并提示重试）
        processStateService.transition(instance, WfProcessStatus.CANCELLED);

        // 撤回后发布事件，驱动 OA 业务状态同步回写。
        workflowEventPublisher.publishProcessRevoked(instance);
        // 若本实例是子流程，通知父流程按终态决策（异常终态将挂起父流程）
        workflowEventPublisher.publishSubprocessFinishedIfChild(instance, WfProcessStatus.CANCELLED.getCode());

        auditService.log(WorkflowAuditService.AuditAction.PROCESS_RECALL, instanceId, "");
        return R.ok();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> pauseProcess(String instanceId) {
        log.info("[pauseProcess] 暂停流程, instanceId={}", instanceId);

        permissionService.checkDefinitionPermission("暂停流程");

        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            throw WorkflowException.instanceNotFound(instanceId);
        }
        checkInstanceTenantAccess(instance, "暂停");
        if (!WfProcessStatus.isActive(instance.getStatus())) {
            throw WorkflowException.invalidState("只有运行中的流程可以暂停");
        }

        processStateService.transition(instance, WfProcessStatus.PAUSED);

        auditService.log(WorkflowAuditService.AuditAction.PROCESS_PAUSE, instanceId, "");
        return R.ok();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> resumeProcess(String instanceId) {
        log.info("[resumeProcess] 恢复流程, instanceId={}", instanceId);

        permissionService.checkDefinitionPermission("恢复流程");

        WfProcessInstance instance = processInstanceMapper.selectForExecution(UserContext.getTenantId(), instanceId);
        if (instance == null) {
            throw WorkflowException.instanceNotFound(instanceId);
        }
        checkInstanceTenantAccess(instance, "恢复");
        if (!WfProcessStatus.PAUSED.getCode().equals(instance.getStatus())
                && !WfProcessStatus.FAILED.getCode().equals(instance.getStatus())) {
            throw WorkflowException.invalidState("只有暂停中的流程可以恢复");
        }

        // 若因自动节点执行失败被挂起，恢复时清除失败标记并从失败节点重跑
        String failedNodeKey = null;
        WorkflowExecutionContext.Frame failedContext = null;
        Map<String, Object> variables = new HashMap<>();
        if (StringUtils.hasText(instance.getVariables())) {
            try {
                variables = objectMapper.readValue(instance.getVariables(), Map.class);
                Object failed = variables.remove(INodeExecutionService.FAILED_NODE_KEY_VARIABLE);
                if (failed instanceof String && StringUtils.hasText((String) failed)) {
                    failedNodeKey = (String) failed;
                    failedContext = WorkflowExecutionContext.parse((String) variables.remove(WorkflowWaitState.FAILED_CONTEXT));
                    instance.setVariables(objectMapper.writeValueAsString(variables));
                }
            } catch (Exception e) {
                throw WorkflowException.invalidState("流程恢复记录无效，请核对持久执行状态");
            }
        }

        processStateService.transition(instance, WfProcessStatus.RUNNING);

        if (failedNodeKey != null) {
            WfProcessDefinition def = resolveDefinitionByInstance(instance);
            if (def == null || !StringUtils.hasText(def.getModelJson())) {
                throw WorkflowException.processNotFound(instance.getProcessDefKey());
            }
            WfNodeConfig root = workflowGraphModelResolver.parseRuntimeRoot(def.getModelJson());
            WfNodeConfig failedNode = nodeExecutionService.findNode(root, failedNodeKey);
            if (failedNode == null) {
                throw WorkflowException.validationError(
                    "恢复流程失败：流程定义中找不到失败节点 " + failedNodeKey);
            }
            log.info("[resumeProcess] 从失败节点重跑, instanceId={}, nodeKey={}", instanceId, failedNodeKey);
            gateways.assertActive(instance, failedContext);
            Map<String, Object> resumedVariables = variables;
            WorkflowExecutionContext.run(failedContext, () -> nodeExecutionService.runNode(instance, failedNode, resumedVariables, 0, root));
        }

        auditService.log(WorkflowAuditService.AuditAction.PROCESS_RESUME, instanceId, "");
        return R.ok();
    }

    @Override
    public WfProcessInstance getProcessInstance(String instanceId) {
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            throw WorkflowException.instanceNotFound(instanceId);
        }
        permissionService.checkViewInstancePermission(instance);
        return instance;
    }

    @Override
    public DynamicMapVO getProcessTrace(String instanceId) {
        log.info("[getProcessTrace] 查询流程追踪, instanceId={}", instanceId);

        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            throw WorkflowException.instanceNotFound(instanceId);
        }
        permissionService.checkViewInstancePermission(instance);

        // 查询历史记录
        List<WfTaskHistory> histories = taskHistoryMapper.selectList(
            new LambdaQueryWrapper<WfTaskHistory>()
                .eq(WfTaskHistory::getInstanceId, instanceId)
                .orderByAsc(WfTaskHistory::getCreateTime)
        );

        // 查询当前活动任务
        List<WfTask> activeTasks = taskMapper.selectList(
            new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getInstanceId, instanceId)
                .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode())
        );

        // 已完成节点
        List<WfNodeRecord> nodeRecords = nodeRecordMapper.selectList(
            new LambdaQueryWrapper<WfNodeRecord>()
                .eq(WfNodeRecord::getInstanceId, instanceId)
                .orderByAsc(WfNodeRecord::getStartTime)
        );
        List<String> finishedNodeKeys = new ArrayList<>(
            collectFinishedNodeKeys(instance.getStatus(), histories, nodeRecords));

        // 活动节点
        List<String> activeNodeKeys = new ArrayList<>(
            collectActiveNodeKeys(instance.getStatus(), activeTasks, nodeRecords));

        // 构建历史详情
        List<Map<String, Object>> historyDetails = buildTraceHistoryDetails(
            histories, nodeRecords, instance.getStatus());

        // 构建活动任务详情（统一聚合：人工任务、自动节点与网关节点都进入 trace）
        List<Map<String, Object>> activeDetails = buildTraceActiveDetails(
            activeTasks, nodeRecords, instance.getStatus());
        List<WorkflowGatewayTrace> gatewayRounds = gateways.trace(instance);

        // 构建步骤详情
        List<Map<String, Object>> stepsDetail = null;
        try {
            WfProcessDefinition def = resolveDefinitionByInstance(instance);
            if (def != null && StringUtils.hasText(def.getModelJson())) {
                WfNodeConfig root = workflowGraphModelResolver.parseRuntimeRoot(def.getModelJson());
                List<Map<String, String>> steps = nodeExecutionService.extractApprovalSteps(root);
                for (WorkflowGatewayTrace round : gatewayRounds) {
                    WfNodeConfig gatewayNode = nodeExecutionService.findNode(root, round.getNodeKey());
                    round.setNodeName(gatewayNode == null ? round.getNodeKey() : gatewayNode.getTitle());
                }
                for (Map<String, Object> detail : activeDetails) {
                    WfNodeConfig activeNode = nodeExecutionService.findNode(root, String.valueOf(detail.get("nodeKey")));
                    detail.put("allowUrge", com.cloudflow.workflow.service.WorkflowNodePolicy.allows(activeNode, "allowUrge"));
                    if (activeNode != null) detail.put("nodeType", activeNode.getType());
                }
                Set<String> stepNodeKeys = steps.stream()
                    .map(step -> step.get("nodeKey"))
                    .filter(StringUtils::hasText)
                    .collect(Collectors.toSet());
                String currentNodeKey = activeNodeKeys.stream()
                    .filter(stepNodeKeys::contains)
                    .findFirst()
                    .orElse(null);
                stepsDetail = nodeExecutionService.buildAllStepsDetail(steps, histories, currentNodeKey);
            }
        } catch (Exception e) {
            log.warn("[getProcessTrace] 构建步骤详情失败: {}", e.getMessage());
        }

        // 检测并行分支
        List<Map<String, Object>> parallelBranches = new ArrayList<>();
        if (activeNodeKeys.size() > 1) {
            for (Map<String, Object> detail : activeDetails) {
                Map<String, Object> branch = new HashMap<>();
                branch.put("nodeKey", detail.get("nodeKey"));
                branch.put("nodeName", detail.get("nodeName"));
                branch.put("assignee", firstNotBlank(
                    detail.get("assigneeName") != null ? String.valueOf(detail.get("assigneeName")) : null,
                    detail.get("assigneeId") != null ? String.valueOf(detail.get("assigneeId")) : null,
                    detail.get("assignee") != null ? String.valueOf(detail.get("assignee")) : null
                ));
                parallelBranches.add(branch);
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("instanceId", instanceId);
        result.put("status", instance.getStatus());
        result.put("finished", finishedNodeKeys);
        result.put("active", activeNodeKeys);
        result.put("historyDetails", historyDetails);
        result.put("activeDetails", activeDetails);
        result.put("parallelBranches", parallelBranches);
        result.put("gatewayRounds", gatewayRounds);
        if (stepsDetail != null) {
            result.put("stepsDetail", stepsDetail);
        }
        return DynamicMapVO.from(result);
    }

    private Set<String> collectFinishedNodeKeys(String processStatus,
                                                List<WfTaskHistory> histories,
                                                List<WfNodeRecord> nodeRecords) {
        Set<String> finishedNodeKeys = new LinkedHashSet<>();
        if (histories != null) {
            histories.stream()
                .filter(com.cloudflow.workflow.service.WorkflowHistoryAttribution::countsAsCompletion)
                .map(WfTaskHistory::getNodeKey)
                .filter(StringUtils::hasText)
                .forEach(finishedNodeKeys::add);
        }
        if (nodeRecords != null) {
            nodeRecords.stream()
                .filter(record -> shouldTreatNodeRecordAsCompleted(record, processStatus))
                .map(WfNodeRecord::getNodeKey)
                .filter(StringUtils::hasText)
                .forEach(finishedNodeKeys::add);
        }
        return finishedNodeKeys;
    }

    private Set<String> collectActiveNodeKeys(String processStatus,
                                              List<WfTask> activeTasks,
                                              List<WfNodeRecord> nodeRecords) {
        Set<String> activeNodeKeys = new LinkedHashSet<>();
        if (!isDisplayActiveProcess(processStatus)) {
            return activeNodeKeys;
        }
        if (activeTasks != null) {
            activeTasks.stream()
                .map(WfTask::getNodeKey)
                .filter(StringUtils::hasText)
                .forEach(activeNodeKeys::add);
        }
        if (nodeRecords != null) {
            nodeRecords.stream()
                .filter(record -> record != null
                    && "RUNNING".equalsIgnoreCase(record.getStatus())
                    && StringUtils.hasText(record.getNodeKey()))
                .map(WfNodeRecord::getNodeKey)
                .forEach(activeNodeKeys::add);
        }
        return activeNodeKeys;
    }

    private List<Map<String, Object>> buildTraceHistoryDetails(List<WfTaskHistory> histories,
                                                               List<WfNodeRecord> nodeRecords,
                                                               String processStatus) {
        List<Map<String, Object>> historyDetails = new ArrayList<>();
        if (histories != null) {
            for (WfTaskHistory history : histories) {
                Map<String, Object> detail = new HashMap<>();
                detail.put("historyId", history.getHistoryId());
                detail.put("taskId", history.getTaskId());
                detail.put("nodeKey", history.getNodeKey());
                detail.put("nodeName", history.getNodeName());
                detail.put("operatorId", history.getOperatorId());
                detail.put("operatorName", history.getOperatorName());
                detail.put("onBehalfOfUserId", history.getOnBehalfOfUserId());
                detail.put("onBehalfOfUserName", history.getOnBehalfOfUserName());
                detail.put("action", history.getAction());
                detail.put("taskType", history.getTaskType());
                detail.put("comment", history.getComment());
                detail.put("createTime", history.getCreateTime());
                detail.put("completeTime", history.getCreateTime());
                detail.put("durationSeconds", history.getDurationSeconds());
                applyHistoryMetadata(detail, history.getVariablesChanged());
                historyDetails.add(detail);
            }
        }
        if (nodeRecords != null) {
            for (WfNodeRecord record : nodeRecords) {
                if (!isTraceAutoNodeRecord(record) || !shouldTreatNodeRecordAsCompleted(record, processStatus)) {
                    continue;
                }
                Map<String, Object> detail = new HashMap<>();
                detail.put("nodeKey", record.getNodeKey());
                detail.put("nodeName", record.getNodeName());
                detail.put("operatorId", record.getExecutorId());
                detail.put("operatorName", firstNotBlank(record.getExecutorName(), resolveSystemNodeActor(record)));
                detail.put("action", "COMPLETE");
                detail.put("taskType", record.getEventType());
                detail.put("createTime", record.getStartTime());
                detail.put("completeTime", record.getEndTime() != null ? record.getEndTime() : record.getStartTime());
                detail.put("durationSeconds", record.getDurationMs() != null ? record.getDurationMs() / 1000 : null);
                detail.put("nodeType", record.getNodeType());
                historyDetails.add(detail);
            }
        }
        historyDetails.sort(Comparator.comparing(
            this::extractTraceSortTime,
            Comparator.nullsLast(Comparator.naturalOrder())));
        return historyDetails;
    }

    private void applyHistoryMetadata(Map<String, Object> detail, String variablesChanged) {
        if (!StringUtils.hasText(variablesChanged)) {
            return;
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> metadata = objectMapper.readValue(variablesChanged, Map.class);
            Object adminOverride = metadata.get("adminOverride");
            if (Boolean.TRUE.equals(adminOverride) || "true".equalsIgnoreCase(String.valueOf(adminOverride))) {
                detail.put("adminOverride", true);
                detail.put("originalAssigneeId", metadata.get("originalAssigneeId"));
                detail.put("originalAssigneeName", metadata.get("originalAssigneeName"));
            }
        } catch (Exception e) {
            log.debug("[applyHistoryMetadata] 忽略无法解析的历史元数据: {}", e.getMessage());
        }
    }

    private List<Map<String, Object>> buildTraceActiveDetails(List<WfTask> activeTasks,
                                                              List<WfNodeRecord> nodeRecords,
                                                              String processStatus) {
        List<Map<String, Object>> activeDetails = new ArrayList<>();
        if (!isDisplayActiveProcess(processStatus)) {
            return activeDetails;
        }

        Set<String> taskNodeKeys = new HashSet<>();
        if (activeTasks != null) {
            for (WfTask task : activeTasks) {
                if (StringUtils.hasText(task.getNodeKey())) {
                    taskNodeKeys.add(task.getNodeKey());
                }
                Map<String, Object> detail = new HashMap<>();
                detail.put("taskId", task.getTaskId());
                detail.put("taskType", task.getTaskType());
                detail.put("nodeKey", task.getNodeKey());
                detail.put("nodeName", task.getNodeName());
                detail.put("assignee", task.getAssignee());
                detail.put("assigneeId", task.getAssignee());
                detail.put("assigneeName", StringUtils.hasText(task.getAssigneeName())
                    ? task.getAssigneeName()
                    : (task.getAssignee() != null ? String.valueOf(task.getAssignee()) : null));
                detail.put("createTime", task.getCreateTime());
                activeDetails.add(detail);
            }
        }

        if (nodeRecords != null) {
            for (WfNodeRecord record : nodeRecords) {
                if (!isTraceAutoNodeRecord(record)
                        || !"RUNNING".equalsIgnoreCase(record.getStatus())
                        || taskNodeKeys.contains(record.getNodeKey())) {
                    continue;
                }
                Map<String, Object> detail = new HashMap<>();
                detail.put("nodeKey", record.getNodeKey());
                detail.put("nodeName", record.getNodeName());
                detail.put("assigneeId", record.getExecutorId());
                detail.put("assigneeName", firstNotBlank(record.getExecutorName(), resolveSystemNodeActor(record)));
                detail.put("createTime", record.getStartTime());
                detail.put("nodeType", record.getNodeType());
                activeDetails.add(detail);
            }
        }

        activeDetails.sort(Comparator.comparing(
            this::extractTraceSortTime,
            Comparator.nullsLast(Comparator.naturalOrder())));
        return activeDetails;
    }

    private boolean shouldTreatNodeRecordAsCompleted(WfNodeRecord record, String processStatus) {
        if (record == null || !StringUtils.hasText(record.getNodeKey())) {
            return false;
        }
        if ("COMPLETED".equalsIgnoreCase(record.getStatus())) {
            return true;
        }
        // 监听器异步收口时，终态流程里残留的 RUNNING 记录按已完成展示，避免自动节点长期 pending。
        return !isDisplayActiveProcess(processStatus) && "RUNNING".equalsIgnoreCase(record.getStatus());
    }

    private boolean isTraceAutoNodeRecord(WfNodeRecord record) {
        if (record == null) {
            return false;
        }
        String nodeType = record.getNodeType();
        if (!StringUtils.hasText(nodeType)) {
            return true;
        }
        return !"APPROVAL".equalsIgnoreCase(nodeType)
            && !"MANUAL".equalsIgnoreCase(nodeType)
            && !"START".equalsIgnoreCase(nodeType);
    }

    private boolean isDisplayActiveProcess(String processStatus) {
        return WfProcessStatus.isOpen(processStatus);
    }

    private String resolveSystemNodeActor(WfNodeRecord record) {
        String nodeType = record != null ? record.getNodeType() : null;
        if ("TIMER".equalsIgnoreCase(nodeType)) {
            return "系统定时器";
        }
        if ("SCRIPT".equalsIgnoreCase(nodeType)) {
            return "系统脚本";
        }
        if ("NOTIFICATION".equalsIgnoreCase(nodeType)) {
            return "系统通知";
        }
        if ("PARALLEL".equalsIgnoreCase(nodeType) || "CONDITION".equalsIgnoreCase(nodeType)) {
            return "系统网关";
        }
        if ("END".equalsIgnoreCase(nodeType)) {
            return "系统完成";
        }
        return "系统";
    }

    private LocalDateTime extractTraceSortTime(Map<String, Object> detail) {
        if (detail == null) {
            return null;
        }
        Object completeTime = detail.get("completeTime");
        if (completeTime instanceof LocalDateTime) {
            return (LocalDateTime) completeTime;
        }
        Object createTime = detail.get("createTime");
        if (createTime instanceof LocalDateTime) {
            return (LocalDateTime) createTime;
        }
        return null;
    }

    @Override
    public PageResult<WfProcessInstance> getMyInstances(Long userId, PageQuery pageQuery) {
        Page<WfProcessInstance> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        Map<String, Object> params = pageQuery.getParams() != null ? pageQuery.getParams() : Collections.emptyMap();
        LambdaQueryWrapper<WfProcessInstance> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(WfProcessInstance::getStartUserId, userId);
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null) {
            queryWrapper.eq(WfProcessInstance::getTenantId, currentTenantId);
        }

        String status = (String) params.get("status");
        if (StringUtils.hasText(status)) {
            queryWrapper.eq(WfProcessInstance::getStatus, status);
        }

        String keyword = (String) params.get("keyword");
        if (StringUtils.hasText(keyword)) {
            queryWrapper.and(w -> w
                .like(WfProcessInstance::getTitle, keyword)
                .or()
                .like(WfProcessInstance::getProcessNo, keyword)
            );
        }

        // 与前端筛选参数对齐：流程类型
        String processDefKey = (String) params.get("processDefKey");
        if (StringUtils.hasText(processDefKey)) {
            queryWrapper.eq(WfProcessInstance::getProcessDefKey, processDefKey);
        }

        // 与前端筛选参数对齐：优先级
        String priority = (String) params.get("priority");
        if (StringUtils.hasText(priority)) {
            queryWrapper.eq(WfProcessInstance::getPriority, priority);
        }

        // 与前端筛选参数对齐：流程编号（单独搜索）
        String processNo = (String) params.get("processNo");
        if (StringUtils.hasText(processNo)) {
            queryWrapper.like(WfProcessInstance::getProcessNo, processNo);
        }

        // 与前端筛选参数对齐：发起人姓名（我的申请场景通常为当前用户，但保持兼容）
        String startUserName = (String) params.get("startUserName");
        if (StringUtils.hasText(startUserName)) {
            queryWrapper.like(WfProcessInstance::getStartUserName, startUserName);
        }

        // 与前端筛选参数对齐：开始时间范围（yyyy-MM-dd）
        String startTimeFrom = (String) params.get("startTimeFrom");
        if (StringUtils.hasText(startTimeFrom)) {
            try {
                LocalDateTime fromDate = java.time.LocalDate
                    .parse(startTimeFrom, DateTimeFormatter.ofPattern("yyyy-MM-dd"))
                    .atStartOfDay();
                queryWrapper.ge(WfProcessInstance::getStartTime, fromDate);
            } catch (Exception e) {
                log.warn("[getMyInstances] 解析开始时间失败: {}", startTimeFrom);
            }
        }

        String startTimeTo = (String) params.get("startTimeTo");
        if (StringUtils.hasText(startTimeTo)) {
            try {
                LocalDateTime toDate = java.time.LocalDate
                    .parse(startTimeTo, DateTimeFormatter.ofPattern("yyyy-MM-dd"))
                    .atStartOfDay();
                LocalDateTime endOfDay = toDate.withHour(23).withMinute(59).withSecond(59);
                queryWrapper.le(WfProcessInstance::getStartTime, endOfDay);
            } catch (Exception e) {
                log.warn("[getMyInstances] 解析结束时间失败: {}", startTimeTo);
            }
        }

        queryWrapper.orderByDesc(WfProcessInstance::getStartTime);

        Page<WfProcessInstance> resultPage = processInstanceMapper.selectPage(page, queryWrapper);
        List<WfProcessInstance> instances = resultPage.getRecords();
        if (instances != null && !instances.isEmpty()) {
            enrichMyInstances(instances);
        }
        return new PageResult<>(instances, resultPage.getTotal(), resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    public boolean continueFromTimerNode(String instanceId, String nodeKey, Map<String, Object> variables) {
        return executeTimerContinuation(instanceId, nodeKey, variables, false, null);
    }

    @Override
    public void finishTimerNode(String instanceId, String nodeKey, String reason) {
        if (!permissionService.isAdmin(UserContext.getUserId())) {
            throw WorkflowException.permissionDenied("仅管理员可提前结束定时节点");
        }
        if (!StringUtils.hasText(reason) || reason.length() > 500) {
            throw WorkflowException.validationError("提前结束原因必填且不能超过500字");
        }
        executeTimerContinuation(instanceId, nodeKey, Map.of(), true, reason);
    }

    private boolean executeTimerContinuation(String instanceId, String nodeKey, Map<String, Object> variables,
                                           boolean manual, String reason) {
        log.info("[continueFromTimerNode] 定时节点到期, instanceId={}, nodeKey={}", instanceId, nodeKey);

        BusinessLock instanceLock = businessLocks.getLock("lock:instance:" + instanceId);
        RLock lock = redissonClient.getLock("lock:timer:" + instanceId + ":" + nodeKey);
        try {
            if (!instanceLock.tryLock(5, TimeUnit.SECONDS)) {
                throw WorkflowException.invalidState("流程实例正在处理，请稍后重试");
            }
            // watchdog 模式（不设 leaseTime），锁覆盖整个事务生命周期，提交后才释放。
            if (!lock.tryLock(5, TimeUnit.SECONDS)) {
                throw WorkflowException.invalidState("定时节点正在处理，请稍后重试: " + instanceId + "/" + nodeKey);
            }
            return Boolean.TRUE.equals(businessLocks.execute(transactionTemplate, status ->
                    doContinueFromTimerNode(instanceId, nodeKey, variables, manual, reason)));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("[continueFromTimerNode] 被中断", e);
            throw WorkflowException.invalidState("定时节点处理被中断: " + instanceId + "/" + nodeKey);
        } finally {
            try { if (lock.isHeldByCurrentThread()) lock.unlock(); }
            finally { instanceLock.close(); }
        }
    }

    private boolean doContinueFromTimerNode(String instanceId, String nodeKey, Map<String, Object> variables,
                                         boolean manual, String reason) {
        WfProcessInstance instance = processInstanceMapper.selectForExecution(UserContext.getTenantId(), instanceId);
        if (instance == null) {
            throw WorkflowException.instanceNotFound(instanceId);
        }
        if (!Objects.equals(instance.getTenantId(), UserContext.getTenantId())) {
            throw WorkflowException.permissionDenied("无权操作其他租户的定时节点");
        }
        if (!WfProcessStatus.isActive(instance.getStatus())) {
            throw WorkflowException.invalidState("当前流程状态不能结束定时等待");
        }
        List<WorkflowWaitState.Pending> candidates = WorkflowWaitState.list(instance, "TIMER").stream()
                .filter(pending -> nodeKey.equals(pending.nodeKey())).toList();
        WorkflowWaitState.Pending pending;
        if (manual) {
            if (candidates.size() != 1) throw WorkflowException.invalidState("该节点没有唯一的待处理定时等待，请重新读取流程状态");
            pending = candidates.get(0);
        } else {
            String waitId = variables == null ? null : (String) variables.get("waitId");
            pending = candidates.stream().filter(candidate -> candidate.waitId().equals(waitId)).findFirst().orElse(null);
            if (pending == null) return false;
            if (!Objects.equals(pending.executionContext(), variables.get("executionContext"))) throw WorkflowExecutionContext.invalid();
            if (Boolean.TRUE.equals(pending.payload().get("blocked")) || Boolean.TRUE.equals(pending.payload().get("notified"))) return false;
            Number expireAt = (Number) pending.payload().getOrDefault("nextRetryAt", pending.payload().get("expireAt"));
            if (expireAt == null || expireAt.longValue() > System.currentTimeMillis()) return false;
        }
        gateways.assertActive(instance, pending.context());
        Map<String, Object> mergedVariables = WorkflowWaitState.variables(instance);

        WfProcessDefinition def = resolveDefinitionByInstance(instance);
        if (def == null || !StringUtils.hasText(def.getModelJson())) {
            throw WorkflowException.processNotFound(instance.getProcessDefKey());
        }

        WfNodeConfig root = workflowGraphModelResolver.parseRuntimeRoot(def.getModelJson());
        WfNodeConfig timerNode = nodeExecutionService.findNode(root, nodeKey);
        if (timerNode == null || !"TIMER".equals(timerNode.getType())) {
            throw WorkflowException.validationError("定时节点不存在: " + nodeKey);
        }
        String timerAction = manual ? "AUTO_PASS" : String.valueOf(pending.payload().getOrDefault("timerAction", "AUTO_PASS"));
        if ("NOTIFY_ONLY".equals(timerAction)) {
            if (!Boolean.TRUE.equals(pending.payload().get("notified"))) {
                sysNoticeService.send(instance.getStartUserId(), "定时节点已到期",
                        "流程「" + instance.getTitle() + "」的「" + timerNode.getTitle() + "」已到期，等待管理员结束等待",
                        "1", 0L, "系统定时任务");
                Map<String, Object> payload = new HashMap<>(pending.payload());
                payload.put("notified", true);
                WorkflowWaitState.change(instance, mergedVariables, pending, payload);
                processStateService.transition(instance, WfProcessStatus.PENDING);
            }
            timerSchedulerService.completeAfterCommit(instanceId, pending);
            return true;
        }
        if (!"AUTO_PASS".equals(timerAction) && !"AUTO_REJECT".equals(timerAction)) {
            throw WorkflowException.validationError("未知定时到期动作");
        }
        WorkflowWaitState.finish(instance, mergedVariables, pending.waitId());
        processStateService.transition(instance, WfProcessStatus.RUNNING);
        WfTask timerTask = new WfTask();
        timerTask.setTaskId(UUID.randomUUID().toString());
        timerTask.setTenantId(instance.getTenantId());
        timerTask.setInstanceId(instanceId);
        timerTask.setNodeKey(nodeKey);
        timerTask.setNodeName(timerNode.getTitle());
        timerTask.setExecutionContext(pending.executionContext());
        timerTask.setTaskType(manual ? WfTaskType.MANUAL.name() : timerAction);
        timerTask.setAssignee(UserContext.getUserId());
        timerTask.setAssigneeName(UserContext.getUserName());
        timerTask.setStatus(WfTaskStatus.TODO.getCode());
        timerTask.setCreateTime(LocalDateTime.now());
        taskMapper.insert(timerTask);
        String action = "AUTO_REJECT".equals(timerAction) ? "REJECT" : "APPROVE";
        R<?> result = manual
                ? timerTaskService.completeTask(timerTask.getTaskId(), action, "管理员提前结束等待: " + reason, Map.of(), null)
                : timerTaskService.completeAutomaticTask(timerTask.getTaskId(), action, "定时节点到期自动处理", Map.of());
        if (result == null || result.getCode() != 200) {
            throw WorkflowException.invalidState("定时节点完成失败");
        }
        if (manual) {
            auditService.log(WorkflowAuditService.AuditAction.TIMER_FINISH, instanceId, "nodeKey=" + nodeKey + ", reason=" + reason);
        } else if (instance.getStartUserId() != null) {
            // 到期处理与成功通知共同提交，登记失败时保留等待记录供扫描重试。
            String content = "SCHEDULE".equals(pending.payload().get("timerType"))
                    ? String.format("您发起的流程「%s」中的定时节点已到达预定时间（%s），流程已继续流转。",
                            instance.getTitle(), pending.payload().getOrDefault("scheduleTime", ""))
                    : String.format("您发起的流程「%s」中的延迟节点已到期，流程已继续流转。", instance.getTitle());
            sysNoticeService.send(instance.getStartUserId(), "定时节点触发通知", content, "1", 0L, "系统定时任务");
        }
        timerSchedulerService.completeAfterCommit(instanceId, pending);
        return true;
    }

    @Override
    public void handleSubprocessFinished(String parentInstanceId, String parentNodeKey,
                                         String childInstanceId, String childStatus) {
        log.info("[handleSubprocessFinished] 子流程结束, parentInstanceId={}, parentNodeKey={}, childInstanceId={}, childStatus={}",
                parentInstanceId, parentNodeKey, childInstanceId, childStatus);

        BusinessLock lock = businessLocks.getLock("lock:instance:" + parentInstanceId);
        try {
            // 按原归属持续续期，锁覆盖整个事务并核验提交，完成后释放
            if (!lock.tryLock(10, TimeUnit.SECONDS)) {
                throw WorkflowException.invalidState("父流程正在被其他操作处理，请稍后重试: " + parentInstanceId);
            }
            try {
                businessLocks.executeWithoutResult(transactionTemplate, txStatus -> {
                    if (WfProcessStatus.AUTO_PASSED.getCode().equals(childStatus)) {
                        WorkflowCompletionContext.automatically(() -> {
                            doHandleSubprocessFinished(parentInstanceId, parentNodeKey, childInstanceId, childStatus);
                            return null;
                        });
                    } else {
                        doHandleSubprocessFinished(parentInstanceId, parentNodeKey, childInstanceId, childStatus);
                    }
                });
            } finally {
                if (lock != null) {
                    lock.close();
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw WorkflowException.invalidState("获取父流程锁被中断: " + parentInstanceId);
        }
    }

    /**
     * handleSubprocessFinished 的事务内业务段（外层已持有 lock:instance:{parentInstanceId}）
     */
    @SuppressWarnings("unchecked")
    private void doHandleSubprocessFinished(String parentInstanceId, String parentNodeKey,
                                            String childInstanceId, String childStatus) {
        WfProcessInstance parentInstance = processInstanceMapper.selectForExecution(UserContext.getTenantId(), parentInstanceId);
        if (parentInstance == null) {
            log.warn("[handleSubprocessFinished] 父流程实例不存在, parentInstanceId={}", parentInstanceId);
            return;
        }
        if (!WfProcessStatus.isActive(parentInstance.getStatus())) {
            log.warn("[handleSubprocessFinished] 父流程不在运行状态, parentInstanceId={}, status={}",
                    parentInstanceId, parentInstance.getStatus());
            return;
        }

        WorkflowWaitState.Pending pending = WorkflowWaitState.find(parentInstance, childInstanceId);
        if (pending == null) return;
        WfProcessInstance child = processInstanceMapper.selectById(childInstanceId);
        if (!"SUBPROCESS".equals(pending.kind()) || !parentNodeKey.equals(pending.nodeKey()) || child == null
                || !Objects.equals(child.getTenantId(), parentInstance.getTenantId())
                || !parentInstanceId.equals(child.getParentInstanceId()) || !parentNodeKey.equals(child.getParentNodeKey())
                || !Objects.equals(childStatus, child.getStatus()) || !WfProcessStatus.fromCode(childStatus).isTerminal()) {
            throw WorkflowExecutionContext.invalid();
        }
        if (!gateways.isActive(parentInstance, pending.context())) {
            WorkflowWaitState.finish(parentInstance, null, childInstanceId);
            if (processInstanceMapper.updateById(parentInstance) != 1) throw WorkflowExecutionContext.invalid();
            return;
        }
        WorkflowExecutionContext.run(pending.context(), () -> resumeSubprocess(parentInstance, parentNodeKey, childInstanceId, childStatus));
    }

    private void resumeSubprocess(WfProcessInstance parentInstance, String parentNodeKey, String childInstanceId, String childStatus) {
        String parentInstanceId = parentInstance.getInstanceId();
        Map<String, Object> variables = WorkflowWaitState.variables(parentInstance);
        String idempotentKey = SUBPROCESS_DONE_VARIABLE_PREFIX + parentNodeKey;
        String idempotentValue = StringUtils.hasText(childInstanceId) ? childInstanceId : String.valueOf(childStatus);
        if (idempotentValue.equals(String.valueOf(variables.get(idempotentKey)))) {
            log.info("[handleSubprocessFinished] 子流程结束事件已处理过，跳过, parentInstanceId={}, childInstanceId={}",
                    parentInstanceId, childInstanceId);
            return;
        }

        // 子流程异常终态（驳回/撤回/作废/终止）：挂起父流程，人工处理后可恢复重跑子流程节点
        if (!WfProcessStatus.isSuccess(childStatus)) {
            WorkflowWaitState.finish(parentInstance, variables, childInstanceId);
            markSubprocessEventHandled(parentInstance, variables, idempotentKey, idempotentValue);
            nodeExecutionService.suspendInstanceForNodeFailure(parentInstance, parentNodeKey,
                    "子流程", "子流程 " + childInstanceId + " 以状态 " + childStatus + " 结束");
            return;
        }

        // 父流程定义严格按实例锁定的 definitionId 解析，缺失即挂起（不回退最新版本）
        WfProcessDefinition parentDef = StringUtils.hasText(parentInstance.getDefinitionId())
                ? processDefinitionMapper.selectById(parentInstance.getDefinitionId())
                : null;
        if (parentDef == null || !StringUtils.hasText(parentDef.getModelJson())) {
            log.error("[handleSubprocessFinished] 父流程定义缺失或模型为空, parentInstanceId={}, definitionId={}",
                    parentInstanceId, parentInstance.getDefinitionId());
            nodeExecutionService.suspendInstanceForNodeFailure(parentInstance, parentNodeKey,
                    "子流程", "父流程定义缺失(definitionId=" + parentInstance.getDefinitionId() + ")，无法恢复流转");
            return;
        }

        WfNodeConfig rootNode = workflowGraphModelResolver.parseRuntimeRoot(parentDef.getModelJson());
        WfNodeConfig subprocessNode = nodeExecutionService.findNode(rootNode, parentNodeKey);
        if (subprocessNode == null) {
            log.error("[handleSubprocessFinished] 父流程模型中未找到子流程节点, parentNodeKey={}", parentNodeKey);
            nodeExecutionService.suspendInstanceForNodeFailure(parentInstance, parentNodeKey,
                    "子流程", "父流程模型中未找到节点 " + parentNodeKey + "，无法恢复流转");
            return;
        }

        // 记录幂等标记后继续流转（同事务）
        WorkflowWaitState.finish(parentInstance, variables, childInstanceId);
        markSubprocessEventHandled(parentInstance, variables, idempotentKey, idempotentValue);

        // 子流程节点在等待模式下此前未发布 NodeCompleted，真正完成时刻在此补发
        workflowEventPublisher.publishNodeCompleted(parentInstance, subprocessNode);
        nodeExecutionService.advanceAfterNode(parentInstance, subprocessNode, parentNodeKey, variables, 0, rootNode);
        log.info("[handleSubprocessFinished] 父流程恢复流转成功, parentInstanceId={}", parentInstanceId);
    }

    private void markSubprocessEventHandled(WfProcessInstance parentInstance,
                                            Map<String, Object> variables,
                                            String idempotentKey,
                                            String idempotentValue) {
        variables.put(idempotentKey, idempotentValue);
        try {
            WorkflowWaitState.save(parentInstance, variables);
            if (processInstanceMapper.updateById(parentInstance) <= 0) {
                throw WorkflowException.invalidState("子流程结束幂等标记写入失败，请稍后重试");
            }
            WfProcessInstance refreshed = processInstanceMapper.selectById(parentInstance.getInstanceId());
            if (refreshed == null) {
                throw WorkflowException.instanceNotFound(parentInstance.getInstanceId());
            }
            parentInstance.setVariables(refreshed.getVariables());
            parentInstance.setVersion(refreshed.getVersion());
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            throw WorkflowException.validationError("子流程结束幂等标记序列化失败: " + e.getMessage());
        }
    }

    // ==================== P1-6: 流程图渲染数据 ====================

    @Override
    public DynamicMapVO getFlowchartData(String instanceId) {
        log.info("[getFlowchartData] 获取流程图数据, instanceId={}", instanceId);

        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            throw WorkflowException.instanceNotFound(instanceId);
        }
        permissionService.checkViewInstancePermission(instance);

        // 查询流程定义获取模型JSON
        WfProcessDefinition def = resolveDefinitionByInstance(instance);
        if (def == null || !StringUtils.hasText(def.getModelJson())) {
            throw WorkflowException.processNotFound(instance.getProcessDefKey());
        }

        // 查询运行时状态
        List<WfTaskHistory> histories = taskHistoryMapper.selectList(
            new LambdaQueryWrapper<WfTaskHistory>()
                .eq(WfTaskHistory::getInstanceId, instanceId)
                .orderByAsc(WfTaskHistory::getCreateTime)
        );
        List<WfNodeRecord> nodeRecords = nodeRecordMapper.selectList(
            new LambdaQueryWrapper<WfNodeRecord>()
                .eq(WfNodeRecord::getInstanceId, instanceId)
                .orderByAsc(WfNodeRecord::getStartTime)
        );
        List<WfTask> activeTasks = taskMapper.selectList(
            new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getInstanceId, instanceId)
                .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode())
        );

        // 已完成节点Key集合
        Set<String> finishedNodeKeys = collectFinishedNodeKeys(
            instance.getStatus(), histories, nodeRecords);

        // 活动节点Key集合
        Set<String> activeNodeKeys = collectActiveNodeKeys(
            instance.getStatus(), activeTasks, nodeRecords);

        // 解析模型JSON，递归构建节点和连线
        List<Map<String, Object>> nodes = new ArrayList<>();
        List<Map<String, Object>> edges = new ArrayList<>();

        try {
            JsonNode graphRoot = objectMapper.readTree(def.getModelJson());
            if (!workflowGraphModelResolver.isGraphModel(graphRoot)) {
                throw WorkflowException.validationError("仅支持 nodes+edges 图模型");
            }

            JsonNode modelNodes = graphRoot.path("nodes");
            JsonNode modelEdges = graphRoot.path("edges");
            Map<String, String> nodeStatus = new HashMap<>();
            int index = 0;
            for (JsonNode node : modelNodes) {
                String nodeId = jsonText(node, "id");
                if (!StringUtils.hasText(nodeId)) {
                    continue;
                }

                String status = resolveNodeRuntimeStatus(
                    nodeId,
                    jsonText(node, "type"),
                    finishedNodeKeys,
                    activeNodeKeys,
                    instance.getStatus()
                );
                nodeStatus.put(nodeId, status);

                Map<String, Object> nodeData = new HashMap<>();
                nodeData.put("id", nodeId);
                nodeData.put("type", jsonText(node, "type"));
                nodeData.put("label", firstNotBlank(jsonText(node, "title"), jsonText(node, "label"), "未命名节点"));
                nodeData.put("status", status);
                nodeData.put("x", node.hasNonNull("x") ? node.get("x").asInt() : 250);
                nodeData.put("y", node.hasNonNull("y") ? node.get("y").asInt() : (index * 120 + 60));

                String icon = firstNotBlank(jsonText(node, "icon"), jsonText(node.path("props"), "icon"));
                if (StringUtils.hasText(icon)) {
                    nodeData.put("icon", icon);
                }
                if (StringUtils.hasText(jsonText(node, "approverType"))) {
                    nodeData.put("approverType", jsonText(node, "approverType"));
                }
                for (String displayField : List.of("signType", "joinNodeKey")) {
                    if (StringUtils.hasText(jsonText(node, displayField))) {
                        nodeData.put(displayField, jsonText(node, displayField));
                    }
                }
                nodes.add(nodeData);
                index++;
            }

            for (JsonNode edge : modelEdges) {
                String source = firstNotBlank(jsonText(edge, "source"), jsonText(edge, "from"));
                String target = firstNotBlank(jsonText(edge, "target"), jsonText(edge, "to"));
                if (!StringUtils.hasText(source) || !StringUtils.hasText(target)) {
                    continue;
                }
                Map<String, Object> edgeData = new HashMap<>();
                edgeData.put("id", firstNotBlank(jsonText(edge, "id"), source + "->" + target));
                edgeData.put("source", source);
                edgeData.put("target", target);
                if (edge.hasNonNull("isDefault")) {
                    edgeData.put("isDefault", Set.of("true", "1", "yes", "y")
                            .contains(jsonText(edge, "isDefault").toLowerCase(java.util.Locale.ROOT)));
                }

                String targetStatus = nodeStatus.getOrDefault(target, "pending");
                edgeData.put("status", ("completed".equals(targetStatus) || "active".equals(targetStatus)) ? "active" : "pending");

                String condition = firstNotBlank(
                    jsonText(edge, "condition"),
                    jsonText(edge, "expression"),
                    jsonText(edge, "expr"),
                    jsonText(edge, "label")
                );
                if (StringUtils.hasText(condition)) {
                    edgeData.put("label", condition);
                }
                edges.add(edgeData);
            }
        } catch (Exception e) {
            log.error("[getFlowchartData] 解析流程模型失败: {}", e.getMessage(), e);
            throw new WorkflowException("PARSE_FAILED", "解析流程模型失败", e);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("instanceId", instanceId);
        result.put("processStatus", instance.getStatus());
        result.put("nodes", nodes);
        result.put("edges", edges);
        return DynamicMapVO.from(result);
    }

    private String resolveNodeRuntimeStatus(String nodeId, String nodeType,
                                            Set<String> finishedNodeKeys,
                                            Set<String> activeNodeKeys,
                                            String processStatus) {
        if (finishedNodeKeys.contains(nodeId)) {
            return "completed";
        }
        if (activeNodeKeys.contains(nodeId)) {
            return "active";
        }
        if ("END".equalsIgnoreCase(nodeType) && WfProcessStatus.isSuccess(processStatus)) {
            return "completed";
        }
        if ("START".equalsIgnoreCase(nodeType)) {
            return "completed";
        }
        return "pending";
    }

    private String jsonText(JsonNode node, String field) {
        if (node == null || node.isNull() || node.isMissingNode() || !node.has(field) || node.get(field).isNull()) {
            return null;
        }
        String value = node.get(field).asText();
        return StringUtils.hasText(value) ? value : null;
    }

    private String firstNotBlank(String... values) {
        if (values == null || values.length == 0) {
            return null;
        }
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value;
            }
        }
        return null;
    }

    // ==================== P1-7: 作废流程 ====================

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> invalidateProcess(String instanceId, String reason) {
        permissionService.checkDefinitionPermission("作废流程");
        return doInvalidateProcess(instanceId, reason);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> invalidateProcessByBusiness(Long tenantId, String instanceId, String businessType, Long businessId, String reason) {
        if (tenantId == null) {
            throw WorkflowException.validationError("tenantId不能为空");
        }
        if (!StringUtils.hasText(instanceId)) {
            throw WorkflowException.validationError("processInstanceId不能为空");
        }
        if (!StringUtils.hasText(businessType)) {
            throw WorkflowException.validationError("businessType不能为空");
        }
        if (businessId == null) {
            throw WorkflowException.validationError("businessId不能为空");
        }
        Long contextTenantId = UserContext.getTenantId();
        if (contextTenantId == null || !Objects.equals(contextTenantId, tenantId)) {
            throw WorkflowException.validationError("租户上下文不一致，无法作废流程");
        }

        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            throw WorkflowException.instanceNotFound(instanceId);
        }
        if (!Objects.equals(tenantId, instance.getTenantId())) {
            throw new PermissionDeniedException("无权作废该租户流程实例");
        }
        checkBusinessBinding(instance, businessType, businessId);
        if (WfProcessStatus.fromCode(instance.getStatus()).isTerminal()) return R.ok();
        return doInvalidateProcess(instanceId, StringUtils.hasText(reason) ? reason : "业务单据撤销");
    }

    private R<?> doInvalidateProcess(String instanceId, String reason) {
        if (!StringUtils.hasText(reason)) {
            throw WorkflowException.validationError("作废原因不能为空");
        }
        String sanitizedReason = securityUtils.sanitizeXss(reason.trim());
        log.info("[invalidateProcess] 作废流程, instanceId={}, reason={}", instanceId, sanitizedReason);

        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            throw WorkflowException.instanceNotFound(instanceId);
        }
        checkInstanceTenantAccess(instance, "作废");

        // 只有运行中或暂停中的流程可以作废
        String currentStatus = instance.getStatus();
        if (!WfProcessStatus.isOpen(currentStatus)) {
            throw WorkflowException.invalidState("只有运行中或暂停中的流程可以作废，当前状态: " + currentStatus);
        }

        // 1. 删除所有待办任务
        List<WfTask> pendingTasks = taskMapper.selectList(
            new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getInstanceId, instanceId)
                .in(WfTask::getStatus, Arrays.asList(
                    WfTaskStatus.TODO.getCode(),
                    WfTaskStatus.SUSPENDED.getCode(),
                    WfTaskStatus.DELEGATED.getCode()))
        );
        for (WfTask task : pendingTasks) {
            // 记录任务作废历史
            WfTaskHistory h = new WfTaskHistory();
            h.setHistoryId(UUID.randomUUID().toString());
            h.setTenantId(task.getTenantId() != null ? task.getTenantId() : instance.getTenantId());
            h.setTaskId(task.getTaskId());
            h.setInstanceId(instanceId);
            h.setNodeKey(task.getNodeKey());
            h.setNodeName(task.getNodeName());
            h.setOperatorId(UserContext.getUserId());
            h.setOperatorName(UserContext.getUserName());
            h.setAction("INVALIDATE");
            h.setTaskType(task.getTaskType());
            h.setComment("流程作废: " + sanitizedReason);
            h.setCreateTime(LocalDateTime.now());
            taskHistoryMapper.insert(h);
        }

        // 2. 更新实例状态为INVALIDATED（乐观锁：0 行说明与审批等操作并发冲突，回滚并提示重试）
        processStateService.transition(instance, WfProcessStatus.INVALIDATED);

        // 3. 记录审计日志
        auditService.log(WorkflowAuditService.AuditAction.PROCESS_INVALIDATE, instanceId,
            "reason=" + sanitizedReason + ", deletedTasks=" + pendingTasks.size());

        // 作废后发布事件，驱动 OA 业务状态同步回写。
        workflowEventPublisher.publishProcessInvalidated(instance, sanitizedReason, pendingTasks.size());
        // 若本实例是子流程，通知父流程按终态决策（异常终态将挂起父流程）
        workflowEventPublisher.publishSubprocessFinishedIfChild(instance, WfProcessStatus.INVALIDATED.getCode());

        // 4. 通知流程发起人
        if (instance.getStartUserId() != null) {
            Long adminUserId = UserContext.getUserId();
            String adminUserName = UserContext.getUserName();
            try {
                sysNoticeService.send(instance.getStartUserId(), "流程作废通知",
                    String.format("您发起的流程 [%s] 已被管理员作废，原因：%s", instance.getTitle(), sanitizedReason),
                    "SYSTEM", adminUserId != null ? adminUserId : 0L, adminUserName != null ? adminUserName : "系统");
            } catch (Exception ex) {
                log.warn("[invalidateProcess] 提交流程作废通知失败, instanceId={}, error={}", instanceId, ex.getMessage());
            }
        }

        log.info("[invalidateProcess] 流程作废完成, 删除{}个待办任务", pendingTasks.size());
        return R.ok(Map.of("deletedTasks", pendingTasks.size()));
    }

    // ==================== 私有方法 ====================

    private void checkInstanceTenantAccess(WfProcessInstance instance, String operation) {
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && !Objects.equals(currentTenantId, instance.getTenantId())) {
            throw new PermissionDeniedException("无权" + operation + "该租户流程实例");
        }
    }

    private R<?> doStartProcess(String processDefKey, String businessKey, Long currentUserId,
                                String currentUserName, Long currentTenantId, Map<String, Object> variables,
                                boolean externalRequest, Map<String, List<Long>> nodeAssignees, String expectedDefinitionId) {
        log.info("[startProcess] 开始发起流程, processDefKey={}, userId={}", processDefKey, currentUserId);

        if (!StringUtils.hasText(processDefKey) || processDefKey.length() > 100) {
            throw WorkflowException.validationError("流程定义Key不能为空");
        }
        if (!StringUtils.hasText(businessKey) || businessKey.length() > 64) {
            throw WorkflowException.validationError("业务主键不能为空");
        }
        if (currentUserId == null) {
            throw WorkflowException.validationError("发起人不能为空");
        }
        if (currentTenantId == null) {
            throw WorkflowException.validationError("tenantId不能为空");
        }

        if ("crm_refund_review".equals(processDefKey)) {
            if (externalRequest || variables == null || !"crm_refund".equals(variables.get("businessType"))
                    || !Objects.equals(businessKey, "crm_refund:" + variables.get("businessId"))
                    || !(variables.get("refundApproval") instanceof Map<?, ?>)) {
                throw WorkflowException.permissionDenied("退款审批只能从财务原收款页面发起，必须携带原申请的冻结依据");
            }
        } else if (variables != null && "crm_refund".equals(variables.get("businessType"))) {
            throw WorkflowException.permissionDenied("退款申请不能更换审批流程");
        }

        rateLimiterService.checkStartProcessLimit(currentUserId);

        WfProcessDefinition def = formDraftMapper.lockDefinitions(currentTenantId, processDefKey).stream()
                .filter(definition -> "PUBLISHED".equals(definition.getStatus())
                        && !Integer.valueOf(1).equals(definition.getDeleted())
                        && !Integer.valueOf(1).equals(definition.getIsArchived()))
                .max(java.util.Comparator.comparing(definition -> definition.getVersion() == null ? 0 : definition.getVersion()))
                .orElse(null);
        if (def == null) {
            throw WorkflowException.processNotFound(processDefKey);
        }

        if (expectedDefinitionId != null && !expectedDefinitionId.equals(def.getDefinitionId())) {
            throw new WorkflowException("DRAFT_STALE", "流程已发布新版本，请重新填写申请");
        }

        if (!permissionService.canStartProcess(currentUserId, def.getStartPermissionType(), def.getStartPermissionValue())) {
            throw new PermissionDeniedException("您没有权限发起该流程");
        }

        WfFormDefinition boundForm = null;
        if (StringUtils.hasText(def.getFormId())) {
            boundForm = formDraftMapper.lockForm(currentTenantId, def.getFormId());
            if (boundForm == null) {
                throw WorkflowException.validationError("流程绑定的表单不存在或已被删除，无法发起");
            }
            if (def.getTenantId() != null && !Objects.equals(def.getTenantId(), boundForm.getTenantId())) {
                throw WorkflowException.validationError("流程绑定的表单不属于当前租户，无法发起");
            }
            if (!Objects.equals(currentTenantId, boundForm.getTenantId())) {
                throw WorkflowException.validationError("流程绑定的表单租户不匹配，无法发起");
            }
        }

        WfProcessInstance existing = findExistingBusinessInstance(currentTenantId, businessKey);
        if (existing != null) {
            checkExistingStart(existing, currentUserId, processDefKey);
            return R.ok(buildStartResult(existing));
        }

        if (externalRequest) {
            if (Set.of("overtime_request", "hr_shift_request", "oa_consumable_request", "oa_meeting_booking").contains(processDefKey)) {
                throw WorkflowException.permissionDenied("请从对应业务申请页面发起审批");
            }
            DraftLaunchContextVO context = launchContexts.context(def.getDefinitionId());
            Map<String, Object> supplied = new LinkedHashMap<>(variables == null ? Map.of() : variables);
            Object title = supplied.remove("_title");
            Object draftVersion = supplied.remove("_draftVersion");
            Map<String, Object> checked = new LinkedHashMap<>(formInputs.validate(context, supplied, true));
            launchContexts.checkAssignees(context, nodeAssignees, true);
            if (title != null) {
                if (!(title instanceof String) || ((String) title).length() > 200) {
                    throw WorkflowException.validationError("申请标题必须是最多200字符的文本");
                }
                checked.put("_title", title);
            }
            if (expectedDefinitionId != null) checked.put("_draftVersion", draftVersion);
            variables = checked;
        }
        if (!externalRequest) {
            hParticipantPolicy.assertStart(currentTenantId, currentUserId, variables, nodeAssignees);
        }

        if (!externalRequest) {
            variables = hParticipantPolicy.freezeStartDefinition(currentTenantId, currentUserId, variables, def);
        }

        WfProcessInstance instance = new WfProcessInstance();
        instance.setInstanceId(UUID.randomUUID().toString());
        instance.setProcessDefKey(processDefKey);
        instance.setDefinitionId(def.getDefinitionId());
        instance.setFormVersion(boundForm == null ? null : boundForm.getVersion());
        instance.setBusinessKey(businessKey);
        instance.setStartUserId(currentUserId);
        instance.setStartUserName(StringUtils.hasText(currentUserName) ? currentUserName : String.valueOf(currentUserId));
        instance.setTenantId(currentTenantId);
        instance.setDeptId(resolveStartDeptId(currentUserId));
        instance.setStatus(WfProcessStatus.RUNNING.getCode());
        instance.setStartTime(LocalDateTime.now());

        instance.setProcessNo(processNumbers.next(currentTenantId, processDefKey));

        String title = def.getProcessName();
        if (variables != null && variables.containsKey("_title")) {
            title = String.valueOf(variables.get("_title"));
        }
        instance.setTitle(securityUtils.sanitizeXss(title));

        if (variables != null && !variables.isEmpty()) {
            try {
                instance.setVariables(objectMapper.writeValueAsString(variables));
            } catch (Exception invalidVariables) {
                throw WorkflowException.validationError("流程变量无法安全保存");
            }
        }

        for (int attempt = 0; ; attempt++) {
            try {
                processInstanceMapper.insert(instance);
                break;
            } catch (DuplicateKeyException duplicateKey) {
                WfProcessInstance duplicate = processInstanceMapper.findBusinessInstanceCurrent(currentTenantId, businessKey);
                if (duplicate != null) {
                    checkExistingStart(duplicate, currentUserId, processDefKey);
                    log.info("[startProcess] 并发启动命中唯一键，返回已有实例, businessKey={}, instanceId={}",
                            businessKey, duplicate.getInstanceId());
                    return R.ok(buildStartResult(duplicate));
                }
                if (attempt >= 2 || processInstanceMapper.findProcessNumberCurrent(currentTenantId, instance.getProcessNo()) == null) {
                    throw duplicateKey;
                }
                instance.setProcessNo(processNumbers.next(currentTenantId, processDefKey));
            }
        }
        String processNo = instance.getProcessNo();

        if (externalRequest) formFiles.bindStart(instance);

        try {
            processMonitorService.recordProcessStart(
                    instance.getInstanceId(),
                    def.getDefinitionId(),
                    processDefKey,
                    def.getProcessName(),
                    businessKey,
                    currentUserId,
                    instance.getStartUserName()
            );
        } catch (Exception monitorFailure) {
            throw new WorkflowException("START_FAILED", "流程监控记录创建失败");
        }

        initiatorSelectionService.saveSelections(instance, def.getModelJson(), nodeAssignees);
        Map<String, Object> startVariables = variables;
        withWorkflowUserContext(currentUserId, instance.getStartUserName(), instance.getTenantId(), () -> {
            workflowEventPublisher.publishProcessStarted(instance);
            globalListenerDispatcher.fireCreate(instance, startVariables);
            runFirstNode(def, instance, startVariables);
            auditService.log(WorkflowAuditService.AuditAction.PROCESS_START, instance.getInstanceId(),
                    "processDefKey=" + processDefKey + ", processNo=" + processNo);
        });

        return R.ok(buildStartResult(instance));
    }

    private void checkExistingStart(WfProcessInstance instance, Long userId, String processKey) {
        if (!Objects.equals(instance.getStartUserId(), userId) || !Objects.equals(instance.getProcessDefKey(), processKey)) {
            throw WorkflowException.permissionDenied("业务键已被其他流程申请使用");
        }
    }

    private WfProcessInstance findExistingBusinessInstance(Long tenantId, String businessKey) {
        LambdaQueryWrapper<WfProcessInstance> wrapper = new LambdaQueryWrapper<WfProcessInstance>()
                .eq(WfProcessInstance::getBusinessKey, businessKey)
                .eq(WfProcessInstance::getDeleted, 0)
                .orderByDesc(WfProcessInstance::getStartTime);
        if (tenantId != null) {
            wrapper.eq(WfProcessInstance::getTenantId, tenantId);
        }
        return processInstanceMapper.selectPage(new Page<>(1, 1, false), wrapper)
                .getRecords().stream().findFirst().orElse(null);
    }

    private Map<String, String> buildStartResult(WfProcessInstance instance) {
        Map<String, String> result = new HashMap<>();
        result.put("instanceId", instance.getInstanceId());
        result.put("processInstanceId", instance.getInstanceId());
        result.put("processNo", instance.getProcessNo());
        return result;
    }

    private void runFirstNode(WfProcessDefinition def, WfProcessInstance instance, Map<String, Object> variables) {
        try {
            if (StringUtils.hasText(def.getModelJson())) {
                WfNodeConfig root = workflowGraphModelResolver.parseRuntimeRoot(def.getModelJson());
                WorkflowRuntimeGraph runtimeGraph = workflowGraphModelResolver.resolveRuntimeGraph(root);
                String firstNodeId = runtimeGraph != null
                        ? runtimeGraph.getFirstExecutableNodeId()
                        : workflowGraphModelResolver.resolveFirstExecutableNodeId(def.getModelJson());
                WfNodeConfig firstNode = StringUtils.hasText(firstNodeId)
                        ? nodeExecutionService.findNode(root, firstNodeId)
                        : root;
                if (firstNode == null) {
                    throw WorkflowException.validationError("流程启动失败：未找到首个可执行节点");
                }
                nodeExecutionService.runNode(instance, firstNode, variables != null ? variables : new HashMap<>(), 0, root);
            }
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            log.error("[startProcess] 流程启动失败, instanceId={}, errorType={}", instance.getInstanceId(), e.getClass().getSimpleName());
            throw new WorkflowException("START_FAILED", "流程启动失败，请检查流程配置");
        }
    }

    private UserBriefVO resolveStartUser(Long startUserId) {
        if (startUserId == null) {
            return null;
        }
        try {
            return workflowCacheService.getUser(startUserId);
        } catch (Exception e) {
            log.warn("[startProcessInternal] 获取发起人信息失败, userId={}", startUserId, e);
            return null;
        }
    }

    private Long resolveStartDeptId(Long startUserId) {
        UserBriefVO user = resolveStartUser(startUserId);
        if (user != null && user.getDeptId() != null) {
            return user.getDeptId();
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private void checkBusinessBinding(WfProcessInstance instance, String businessType, Long businessId) {
        Map<String, Object> variables = Collections.emptyMap();
        if (StringUtils.hasText(instance.getVariables())) {
            try {
                variables = objectMapper.readValue(instance.getVariables(), Map.class);
            } catch (Exception e) {
                throw WorkflowException.validationError("流程变量解析失败，无法校验业务绑定");
            }
        }
        Object rawType = variables.get("businessType");
        Object rawId = variables.get("businessId");
        if (rawType == null || rawId == null) {
            throw WorkflowException.validationError("流程缺少业务绑定变量，拒绝业务作废");
        }
        String expectedType = normalizeBusinessType(businessType);
        String actualType = normalizeBusinessType(String.valueOf(rawType));
        Long actualId = parseLong(rawId);
        if (!Objects.equals(expectedType, actualType) || !Objects.equals(businessId, actualId)) {
            throw new PermissionDeniedException("业务单据与流程实例不匹配");
        }
    }

    private String normalizeBusinessType(String businessType) {
        String value = businessType == null ? "" : businessType.trim().toUpperCase(Locale.ROOT);
        return value.startsWith("HR_") ? value.substring(3) : value;
    }

    private Long parseLong(Object value) {
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }
        try {
            return Long.valueOf(String.valueOf(value));
        } catch (Exception e) {
            throw WorkflowException.validationError("businessId格式错误");
        }
    }

    private void withWorkflowUserContext(Long userId, String userName, Long tenantId, Runnable runnable) {
        Long originalUserId = UserContext.getUserId();
        String originalUserName = UserContext.getUserName();
        Long originalTenantId = UserContext.getTenantId();
        try {
            UserContext.setUserId(userId);
            UserContext.setUserName(userName);
            UserContext.setTenantId(tenantId);
            runnable.run();
        } finally {
            UserContext.setUserId(originalUserId);
            UserContext.setUserName(originalUserName);
            UserContext.setTenantId(originalTenantId);
        }
    }

    /**
     * 严格按实例锁定的 definitionId 读取流程定义。
     */
    private WfProcessDefinition resolveDefinitionByInstance(WfProcessInstance instance) {
        if (instance == null) {
            return null;
        }
        if (!StringUtils.hasText(instance.getDefinitionId())) {
            log.warn("[resolveDefinitionByInstance] instanceId={} 缺少 definitionId，跳过流程定义解析",
                instance.getInstanceId());
            return null;
        }

        Long instanceTenantId = instance.getTenantId() != null ? instance.getTenantId() : UserContext.getTenantId();
        WfProcessDefinition byId = processDefinitionMapper.selectById(instance.getDefinitionId());
        if (byId == null) {
            log.warn("[resolveDefinitionByInstance] definitionId={} 不存在，无法继续按实例版本解析",
                instance.getDefinitionId());
            return null;
        }
        if (instanceTenantId != null && !Objects.equals(instanceTenantId, byId.getTenantId())) {
            log.warn("[resolveDefinitionByInstance] definitionId={} 租户不匹配(instanceTenantId={}, defTenantId={})",
                instance.getDefinitionId(), instanceTenantId, byId.getTenantId());
            return null;
        }
        return byId;
    }

    /**
     * 批量富化“我的申请”列表，补齐前端所需展示字段。
     * 1) 补齐 formId，保证详情页可以按流程绑定表单渲染；
     * 2) 补齐当前待办节点与处理人信息，提升列表可读性。
     */
    private void enrichMyInstances(List<WfProcessInstance> instances) {
        Long currentTenantId = UserContext.getTenantId();
        // 1) 批量查询流程定义（严格按 definitionId）
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
                        // 二次防护：租户上下文下仅缓存同租户定义
                        if (currentTenantId != null && !Objects.equals(currentTenantId, def.getTenantId())) {
                            continue;
                        }
                        defById.put(def.getDefinitionId(), def);
                    }
                }
            }
        }

        // 2) 批量查询当前待办任务（每个实例取最早创建的一条 TODO 任务作为当前节点）
        List<String> instanceIds = instances.stream()
            .map(WfProcessInstance::getInstanceId)
            .filter(StringUtils::hasText)
            .distinct()
            .collect(Collectors.toList());

        Map<String, WfTask> activeTaskByInstance = new HashMap<>();
        if (!instanceIds.isEmpty()) {
            List<WfTask> activeTasks = taskMapper.selectList(
                new LambdaQueryWrapper<WfTask>()
                    .in(WfTask::getInstanceId, instanceIds)
                    .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode())
                    .orderByAsc(WfTask::getCreateTime)
            );
            for (WfTask task : activeTasks) {
                activeTaskByInstance.putIfAbsent(task.getInstanceId(), task);
            }
        }

        // 3) 回填字段
        for (WfProcessInstance instance : instances) {
            WfProcessDefinition definition = null;
            if (StringUtils.hasText(instance.getDefinitionId())) {
                definition = defById.get(instance.getDefinitionId());
            }
            if (definition != null) {
                instance.setFormId(definition.getFormId());
            }

            WfTask activeTask = activeTaskByInstance.get(instance.getInstanceId());
            if (activeTask != null) {
                instance.setTaskId(activeTask.getTaskId());
                instance.setCurrentNodeName(activeTask.getNodeName());
                instance.setAssignee(activeTask.getAssignee());
                instance.setAssigneeName(activeTask.getAssigneeName());
            }
        }
    }

    // ==================== P1-3: 终止流程 ====================

    @Override
    @Audit(name = "终止流程实例", highRisk = true)
    public R<?> terminateProcess(String instanceId, String reason) {
        log.info("[terminateProcess] 终止流程, instanceId={}, reason={}", instanceId, reason);

        // 1. 权限校验 - 仅管理员可操作
        Long currentUserId = UserContext.getUserId();
        if (!permissionService.isAdmin(currentUserId)) {
            auditService.logPermissionDenied(instanceId, "TERMINATE");
            return R.fail("仅管理员可终止流程");
        }

        // 2. 参数校验
        if (!StringUtils.hasText(instanceId)) {
            return R.fail("流程实例ID不能为空");
        }
        if (!StringUtils.hasText(reason)) {
            return R.fail("终止原因不能为空");
        }

        // XSS过滤
        String sanitizedReason = securityUtils.sanitizeXss(reason);

        // 3. 分布式锁按原归属续期并保护提交；锁覆盖整个事务，完成后才释放，
        //    避免锁在事务提交前释放导致并发方读到未提交数据（同 A4 修复模式）
        BusinessLock lock = businessLocks.getLock("lock:instance:" + instanceId);
        try {
            if (!lock.tryLock(5, TimeUnit.SECONDS)) {
                return R.fail("系统繁忙，请稍后重试");
            }
            try {
                return businessLocks.execute(transactionTemplate, txStatus ->
                        doTerminateProcess(instanceId, sanitizedReason, currentUserId));
            } finally {
                if (lock != null) {
                    lock.close();
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("终止流程被中断: instanceId={}", instanceId);
            return R.fail("操作被中断");
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            log.error("终止流程失败: instanceId={}, error={}", instanceId, e.getMessage(), e);
            return R.fail("终止流程失败，请联系管理员");
        }
    }

    /**
     * terminateProcess 的事务内业务段（外层已持有 lock:instance:{instanceId}）
     */
    private R<?> doTerminateProcess(String instanceId, String reason, Long currentUserId) {
        // 锁内重读实例，避免拿锁前读到的快照已过期
        WfProcessInstance instance = processInstanceMapper.selectForExecution(UserContext.getTenantId(), instanceId);
        if (instance == null) {
            return R.fail("流程实例不存在");
        }
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && !Objects.equals(currentTenantId, instance.getTenantId())) {
            auditService.logPermissionDenied(instanceId, "TERMINATE_TENANT");
            return R.fail("无权访问该租户流程实例");
        }

        // 状态校验
        if (!WfProcessStatus.isOpen(instance.getStatus())) {
            return R.fail("只能终止运行中或已暂停的流程，当前状态: " + instance.getStatus());
        }

        long deletedTasks = taskMapper.selectCount(
            new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getTenantId, instance.getTenantId())
                .eq(WfTask::getInstanceId, instanceId)
                .in(WfTask::getStatus,
                    WfTaskStatus.TODO.getCode(),
                    WfTaskStatus.DELEGATED.getCode(),
                    WfTaskStatus.SUSPENDED.getCode())
        );

        // 7. 更新流程实例状态（乐观锁：0 行说明与其他操作并发冲突，回滚整个终止事务）
        processStateService.transition(instance, WfProcessStatus.TERMINATED);
        log.info("终止流程，删除待办任务: instanceId={}, count={}", instanceId, deletedTasks);

        // P1修复: 更新流程监控状态
        try {
            processMonitorService.recordProcessEnd(instanceId, "TERMINATED", "管理员终止: " + reason);
        } catch (Exception e) {
            log.warn("更新流程监控失败: instanceId={}, error={}", instanceId, e.getMessage());
        }

        // 8. 记录审计日志
        auditService.log(
            WorkflowAuditService.AuditAction.PROCESS_TERMINATE,
            instanceId,
            String.format("管理员[%s]终止流程，原因: %s，删除任务数: %d",
                currentUserId, reason, deletedTasks)
        );

        // 9. 发布事件（监听器为 AFTER_COMMIT，事务提交后才实际消费）
        try {
            workflowEventPublisher.publishProcessTerminated(instance, reason);
        } catch (Exception e) {
            log.warn("发布终止事件失败: {}", e.getMessage());
        }
        // 若本实例是子流程，通知父流程按终态决策（异常终态将挂起父流程）
        try {
            workflowEventPublisher.publishSubprocessFinishedIfChild(instance, "TERMINATED");
        } catch (Exception e) {
            log.warn("发布子流程终止通知失败: {}", e.getMessage());
        }

        // 10. 发送通知
        try {
            if (instance.getStartUserId() != null) {
                sysNoticeService.send(instance.getStartUserId(), "流程终止通知",
                    String.format("您发起的流程 [%s] 已被管理员终止，原因：%s", instance.getTitle(), reason),
                    "SYSTEM", currentUserId, UserContext.getUserName());
            }
        } catch (Exception e) {
            log.warn("发送终止通知失败: {}", e.getMessage());
        }

        log.info("流程终止成功: instanceId={}, deletedTasks={}, reason={}",
                 instanceId, deletedTasks, reason);

        Map<String, Object> result = new HashMap<>();
        result.put("instanceId", instanceId);
        result.put("deletedTasks", deletedTasks);
        result.put("reason", reason);
        result.put("message", "流程已终止");
        return R.ok(result);
    }
}
