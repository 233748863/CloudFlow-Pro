package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.*;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;
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
    private RedissonClient redissonClient;
    @Autowired
    private com.cloudflow.common.redis.core.RedisCache redisCache;
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
    private ISysNoticeService sysNoticeService;
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

    /** 父流程变量中记录"已处理的子流程结束事件"的幂等标记前缀（值为子流程实例ID） */
    private static final String SUBPROCESS_DONE_VARIABLE_PREFIX = "_subprocessDone_";

    private final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> startProcess(String processDefKey, String businessKey, Map<String, Object> variables) {
        return doStartProcess(processDefKey, businessKey, UserContext.getUserId(), UserContext.getUserName(),
                UserContext.getTenantId(), variables, false);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> startProcessInternal(String processDefKey, String businessKey, Long startUserId,
                                     String startUserName, Map<String, Object> variables) {
        Long tenantId = UserContext.getTenantId();
        UserBriefVO user = resolveStartUser(startUserId);
        Long effectiveUserId = user != null && user.getUserId() != null ? user.getUserId() : startUserId;
        String effectiveUserName = StringUtils.hasText(startUserName)
                ? startUserName
                : user != null && StringUtils.hasText(user.getNickName()) ? user.getNickName()
                : user != null ? user.getUsername() : null;
        return doStartProcess(processDefKey, businessKey, effectiveUserId, effectiveUserName, tenantId,
                variables, false);
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

        if (!WfProcessStatus.RUNNING.getCode().equals(instance.getStatus())) {
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

        // 删除所有待办任务
        taskMapper.delete(new LambdaQueryWrapper<WfTask>().eq(WfTask::getInstanceId, instanceId));

        // 更新实例状态（乐观锁：0 行说明与审批等操作并发冲突，回滚并提示重试）
        instance.setStatus(WfProcessStatus.REVOKED.getCode());
        instance.setEndTime(LocalDateTime.now());
        if (processInstanceMapper.updateById(instance) <= 0) {
            throw WorkflowException.invalidState("流程状态已被其他操作变更，撤回失败，请刷新后重试");
        }

        // 撤回后发布事件，驱动 OA 业务状态同步回写。
        workflowEventPublisher.publishProcessRevoked(instance);
        // 若本实例是子流程，通知父流程按终态决策（异常终态将挂起父流程）
        workflowEventPublisher.publishSubprocessFinishedIfChild(instance, WfProcessStatus.REVOKED.getCode());

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
        if (!WfProcessStatus.RUNNING.getCode().equals(instance.getStatus())) {
            throw WorkflowException.invalidState("只有运行中的流程可以暂停");
        }

        instance.setStatus(WfProcessStatus.SUSPENDED.getCode());
        if (processInstanceMapper.updateById(instance) <= 0) {
            throw WorkflowException.invalidState("流程状态已被其他操作变更，暂停失败，请刷新后重试");
        }

        auditService.log(WorkflowAuditService.AuditAction.PROCESS_PAUSE, instanceId, "");
        return R.ok();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> resumeProcess(String instanceId) {
        log.info("[resumeProcess] 恢复流程, instanceId={}", instanceId);

        permissionService.checkDefinitionPermission("恢复流程");

        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            throw WorkflowException.instanceNotFound(instanceId);
        }
        checkInstanceTenantAccess(instance, "恢复");
        if (!WfProcessStatus.SUSPENDED.getCode().equals(instance.getStatus())) {
            throw WorkflowException.invalidState("只有暂停中的流程可以恢复");
        }

        // 若因自动节点执行失败被挂起，恢复时清除失败标记并从失败节点重跑
        String failedNodeKey = null;
        Map<String, Object> variables = new HashMap<>();
        if (StringUtils.hasText(instance.getVariables())) {
            try {
                variables = objectMapper.readValue(instance.getVariables(), Map.class);
                Object failed = variables.remove(INodeExecutionService.FAILED_NODE_KEY_VARIABLE);
                if (failed instanceof String && StringUtils.hasText((String) failed)) {
                    failedNodeKey = (String) failed;
                    instance.setVariables(objectMapper.writeValueAsString(variables));
                }
            } catch (Exception e) {
                log.warn("[resumeProcess] 解析流程变量失败, instanceId={}: {}", instanceId, e.getMessage());
            }
        }

        instance.setStatus(WfProcessStatus.RUNNING.getCode());
        if (processInstanceMapper.updateById(instance) <= 0) {
            throw WorkflowException.invalidState("流程状态已被其他操作变更，恢复失败，请刷新后重试");
        }

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
            nodeExecutionService.runNode(instance, failedNode, variables, 0, root);
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

        // 构建步骤详情
        List<Map<String, Object>> stepsDetail = null;
        try {
            WfProcessDefinition def = resolveDefinitionByInstance(instance);
            if (def != null && StringUtils.hasText(def.getModelJson())) {
                WfNodeConfig root = workflowGraphModelResolver.parseRuntimeRoot(def.getModelJson());
                List<Map<String, String>> steps = nodeExecutionService.extractApprovalSteps(root);
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
                detail.put("nodeKey", history.getNodeKey());
                detail.put("nodeName", history.getNodeName());
                detail.put("operatorId", history.getOperatorId());
                detail.put("operatorName", history.getOperatorName());
                detail.put("action", history.getAction());
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
        return WfProcessStatus.RUNNING.getCode().equals(processStatus)
            || WfProcessStatus.SUSPENDED.getCode().equals(processStatus);
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
    public void continueFromTimerNode(String instanceId, String nodeKey, Map<String, Object> variables) {
        log.info("[continueFromTimerNode] 定时节点到期, instanceId={}, nodeKey={}", instanceId, nodeKey);

        RLock lock = redissonClient.getLock("lock:timer:" + instanceId + ":" + nodeKey);
        try {
            // watchdog 模式（不设 leaseTime），锁覆盖整个事务生命周期，提交后才释放。
            if (!lock.tryLock(5, TimeUnit.SECONDS)) {
                throw WorkflowException.invalidState("定时节点正在处理，请稍后重试: " + instanceId + "/" + nodeKey);
            }
            transactionTemplate.executeWithoutResult(status ->
                    doContinueFromTimerNode(instanceId, nodeKey, variables));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("[continueFromTimerNode] 被中断", e);
            throw WorkflowException.invalidState("定时节点处理被中断: " + instanceId + "/" + nodeKey);
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    private void doContinueFromTimerNode(String instanceId, String nodeKey, Map<String, Object> variables) {
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null || !WfProcessStatus.RUNNING.getCode().equals(instance.getStatus())) {
            log.warn("[continueFromTimerNode] 实例不存在或非运行状态, instanceId={}", instanceId);
            return;
        }

        WfProcessDefinition def = resolveDefinitionByInstance(instance);
        if (def == null || !StringUtils.hasText(def.getModelJson())) {
            throw WorkflowException.processNotFound(instance.getProcessDefKey());
        }

        WfNodeConfig root = workflowGraphModelResolver.parseRuntimeRoot(def.getModelJson());
        WfNodeConfig timerNode = nodeExecutionService.findNode(root, nodeKey);
        if (timerNode == null) {
            throw WorkflowException.validationError("定时节点不存在: " + nodeKey);
        }

        // 定时节点真正完成的时刻发生在续跑触发时，不能在注册 timer 时提前记 completed。
        workflowEventPublisher.publishNodeCompleted(instance, timerNode);
        nodeExecutionService.advanceAfterNode(instance, timerNode, nodeKey, variables, 0, root);
    }

    @Override
    public void handleSubprocessFinished(String parentInstanceId, String parentNodeKey,
                                         String childInstanceId, String childStatus) {
        log.info("[handleSubprocessFinished] 子流程结束, parentInstanceId={}, parentNodeKey={}, childInstanceId={}, childStatus={}",
                parentInstanceId, parentNodeKey, childInstanceId, childStatus);

        RLock lock = redissonClient.getLock("lock:instance:" + parentInstanceId);
        try {
            // watchdog 模式（不设 leaseTime，自动续期），锁覆盖整个事务，提交后释放
            if (!lock.tryLock(10, TimeUnit.SECONDS)) {
                throw WorkflowException.invalidState("父流程正在被其他操作处理，请稍后重试: " + parentInstanceId);
            }
            try {
                transactionTemplate.executeWithoutResult(txStatus ->
                        doHandleSubprocessFinished(parentInstanceId, parentNodeKey, childInstanceId, childStatus));
            } finally {
                if (lock.isHeldByCurrentThread()) {
                    lock.unlock();
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
        WfProcessInstance parentInstance = processInstanceMapper.selectById(parentInstanceId);
        if (parentInstance == null) {
            log.warn("[handleSubprocessFinished] 父流程实例不存在, parentInstanceId={}", parentInstanceId);
            return;
        }
        if (!WfProcessStatus.RUNNING.getCode().equals(parentInstance.getStatus())) {
            log.warn("[handleSubprocessFinished] 父流程不在运行状态, parentInstanceId={}, status={}",
                    parentInstanceId, parentInstance.getStatus());
            return;
        }

        // 幂等：同一子流程实例的结束事件只处理一次（标记与流转同事务，回滚时一并撤销）
        Map<String, Object> variables = new HashMap<>();
        if (StringUtils.hasText(parentInstance.getVariables())) {
            try {
                variables = objectMapper.readValue(parentInstance.getVariables(), Map.class);
            } catch (Exception e) {
                log.warn("[handleSubprocessFinished] 解析父流程变量失败: {}", e.getMessage());
            }
        }
        String idempotentKey = SUBPROCESS_DONE_VARIABLE_PREFIX + parentNodeKey;
        String idempotentValue = StringUtils.hasText(childInstanceId) ? childInstanceId : String.valueOf(childStatus);
        if (idempotentValue.equals(String.valueOf(variables.get(idempotentKey)))) {
            log.info("[handleSubprocessFinished] 子流程结束事件已处理过，跳过, parentInstanceId={}, childInstanceId={}",
                    parentInstanceId, childInstanceId);
            return;
        }

        // 子流程异常终态（驳回/撤回/作废/终止）：挂起父流程，人工处理后可恢复重跑子流程节点
        if (!WfProcessStatus.COMPLETED.getCode().equals(childStatus)) {
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
            parentInstance.setVariables(objectMapper.writeValueAsString(variables));
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
        if ("END".equalsIgnoreCase(nodeType) && "COMPLETED".equals(processStatus)) {
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
        // 权限校验：仅管理员可作废
        permissionService.checkDefinitionPermission("作废流程");

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
        if (!WfProcessStatus.RUNNING.getCode().equals(currentStatus)
                && !WfProcessStatus.SUSPENDED.getCode().equals(currentStatus)) {
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
            h.setComment("流程作废: " + sanitizedReason);
            h.setCreateTime(LocalDateTime.now());
            taskHistoryMapper.insert(h);

            taskMapper.deleteById(task.getTaskId());
        }

        // 2. 更新实例状态为INVALIDATED（乐观锁：0 行说明与审批等操作并发冲突，回滚并提示重试）
        instance.setStatus(WfProcessStatus.INVALIDATED.getCode());
        instance.setEndTime(LocalDateTime.now());
        if (processInstanceMapper.updateById(instance) <= 0) {
            throw WorkflowException.invalidState("流程状态已被其他操作变更，作废失败，请刷新后重试");
        }

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
                sysNoticeService.sendNotice(instance.getStartUserId(), "流程作废通知",
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
                                boolean skipPermissionCheck) {
        log.info("[startProcess] 开始发起流程, processDefKey={}, userId={}", processDefKey, currentUserId);

        if (!StringUtils.hasText(processDefKey)) {
            throw WorkflowException.validationError("流程定义Key不能为空");
        }
        if (!StringUtils.hasText(businessKey)) {
            throw WorkflowException.validationError("业务主键不能为空");
        }
        if (currentUserId == null) {
            throw WorkflowException.validationError("发起人不能为空");
        }

        rateLimiterService.checkStartProcessLimit(currentUserId);

        LambdaQueryWrapper<WfProcessDefinition> startDefQuery = new LambdaQueryWrapper<WfProcessDefinition>()
                .eq(WfProcessDefinition::getProcessKey, processDefKey)
                .eq(WfProcessDefinition::getStatus, "PUBLISHED")
                .orderByDesc(WfProcessDefinition::getVersion);
        if (currentTenantId != null) {
            startDefQuery.eq(WfProcessDefinition::getTenantId, currentTenantId);
        }
        WfProcessDefinition def = processDefinitionMapper.selectPage(new Page<>(1, 1, false), startDefQuery)
                .getRecords().stream().findFirst().orElse(null);
        if (def == null) {
            throw WorkflowException.processNotFound(processDefKey);
        }

        if (!skipPermissionCheck
                && !permissionService.canStartProcess(currentUserId, def.getStartPermissionType(), def.getStartPermissionValue())) {
            throw new PermissionDeniedException("您没有权限发起该流程");
        }

        if (StringUtils.hasText(def.getFormId())) {
            WfFormDefinition boundForm = formDefinitionMapper.selectById(def.getFormId());
            if (boundForm == null) {
                throw WorkflowException.validationError("流程绑定的表单不存在或已被删除，无法发起");
            }
            if (def.getTenantId() != null && !Objects.equals(def.getTenantId(), boundForm.getTenantId())) {
                throw WorkflowException.validationError("流程绑定的表单不属于当前租户，无法发起");
            }
            if (currentTenantId != null && !Objects.equals(currentTenantId, boundForm.getTenantId())) {
                throw WorkflowException.validationError("流程绑定的表单租户不匹配，无法发起");
            }
        }

        Long effectiveTenantId = currentTenantId != null ? currentTenantId : def.getTenantId();
        WfProcessInstance existing = findExistingBusinessInstance(effectiveTenantId, businessKey);
        if (existing != null) {
            log.info("[startProcess] 流程实例已存在，直接返回, businessKey={}, instanceId={}",
                    businessKey, existing.getInstanceId());
            return R.ok(buildStartResult(existing));
        }

        WfProcessInstance instance = new WfProcessInstance();
        instance.setInstanceId(UUID.randomUUID().toString());
        instance.setProcessDefKey(processDefKey);
        instance.setDefinitionId(def.getDefinitionId());
        instance.setBusinessKey(businessKey);
        instance.setStartUserId(currentUserId);
        instance.setStartUserName(StringUtils.hasText(currentUserName) ? currentUserName : String.valueOf(currentUserId));
        instance.setTenantId(effectiveTenantId);
        instance.setStatus(WfProcessStatus.RUNNING.getCode());
        instance.setStartTime(LocalDateTime.now());

        String processNo = generateProcessNo(processDefKey);
        instance.setProcessNo(processNo);

        String title = def.getProcessName();
        if (variables != null && variables.containsKey("_title")) {
            title = String.valueOf(variables.get("_title"));
        }
        instance.setTitle(securityUtils.sanitizeXss(title));

        if (variables != null && !variables.isEmpty()) {
            try {
                instance.setVariables(objectMapper.writeValueAsString(variables));
            } catch (Exception e) {
                log.warn("[startProcess] 序列化变量失败: {}", e.getMessage());
            }
        }

        try {
            processInstanceMapper.insert(instance);
        } catch (DuplicateKeyException e) {
            WfProcessInstance duplicate = findExistingBusinessInstance(effectiveTenantId, businessKey);
            if (duplicate != null) {
                log.info("[startProcess] 并发启动命中唯一键，返回已有实例, businessKey={}, instanceId={}",
                        businessKey, duplicate.getInstanceId());
                return R.ok(buildStartResult(duplicate));
            }
            throw e;
        }

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
        } catch (Exception e) {
            log.warn("[startProcess] 记录流程监控失败: {}", e.getMessage());
        }

        withWorkflowUserContext(currentUserId, instance.getStartUserName(), instance.getTenantId(), () -> {
            workflowEventPublisher.publishProcessStarted(instance);
            globalListenerDispatcher.fireCreate(instance, variables);
            runFirstNode(def, instance, variables);
            auditService.log(WorkflowAuditService.AuditAction.PROCESS_START, instance.getInstanceId(),
                    "processDefKey=" + processDefKey + ", processNo=" + processNo);
        });

        return R.ok(buildStartResult(instance));
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
            log.error("[startProcess] 流程启动失败: {}", e.getMessage(), e);
            throw new WorkflowException("START_FAILED", "流程启动失败: " + e.getMessage(), e);
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

    /**
     * 生成流程编号
     */
    private String generateProcessNo(String processDefKey) {
        String prefix = processDefKey.toUpperCase().replaceAll("[^A-Z0-9]", "");
        if (prefix.length() > 6) prefix = prefix.substring(0, 6);
        String datePart = DateTimeFormatter.ofPattern("yyyyMMdd").format(LocalDateTime.now());
        // B11: Redis 序列号保证同 key 同日单号唯一（原 4 位随机数约 118 单即 50% 概率碰撞）；
        // DB 侧另有 uk(tenant_id, process_no) 兜底
        String seqKey = "sys:wf:pno:" + prefix + ":" + datePart;
        long seq = redisCache.increment(seqKey);
        if (seq == 1) {
            redisCache.expire(seqKey, 48, TimeUnit.HOURS);
        }
        return prefix + datePart + String.format("%06d", seq);
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

        // 3. 分布式锁（watchdog 自动续期，不设 leaseTime）；锁覆盖整个事务，提交后才释放，
        //    避免锁在事务提交前释放导致并发方读到未提交数据（同 A4 修复模式）
        RLock lock = redissonClient.getLock("lock:instance:" + instanceId);
        try {
            if (!lock.tryLock(5, TimeUnit.SECONDS)) {
                return R.fail("系统繁忙，请稍后重试");
            }
            try {
                return transactionTemplate.execute(txStatus ->
                        doTerminateProcess(instanceId, sanitizedReason, currentUserId));
            } finally {
                if (lock.isHeldByCurrentThread()) {
                    lock.unlock();
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
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            return R.fail("流程实例不存在");
        }
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && !Objects.equals(currentTenantId, instance.getTenantId())) {
            auditService.logPermissionDenied(instanceId, "TERMINATE_TENANT");
            return R.fail("无权访问该租户流程实例");
        }

        // 状态校验
        if (!WfProcessStatus.RUNNING.getCode().equals(instance.getStatus()) &&
            !WfProcessStatus.SUSPENDED.getCode().equals(instance.getStatus())) {
            return R.fail("只能终止运行中或已暂停的流程，当前状态: " + instance.getStatus());
        }

        // P1修复: 删除所有未完成的任务（包括SUSPENDED状态）
        int deletedTasks = taskMapper.delete(
            new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getInstanceId, instanceId)
                .in(WfTask::getStatus,
                    WfTaskStatus.TODO.getCode(),
                    WfTaskStatus.DELEGATED.getCode(),
                    WfTaskStatus.SUSPENDED.getCode())
        );

        log.info("终止流程，删除待办任务: instanceId={}, count={}", instanceId, deletedTasks);

        // P1修复: 清理会签相关数据
        try {
            List<WfCountersignTask> csTasks = countersignTaskMapper.selectList(
                new LambdaQueryWrapper<WfCountersignTask>()
                    .eq(WfCountersignTask::getInstanceId, instanceId)
                    .eq(WfCountersignTask::getStatus, "VOTING")
            );

            for (WfCountersignTask csTask : csTasks) {
                // 删除会签投票记录
                countersignVoteMapper.delete(
                    new LambdaQueryWrapper<WfCountersignVote>()
                        .eq(WfCountersignVote::getCountersignId, csTask.getCountersignId())
                );

                // 更新会签任务状态为已终止
                csTask.setStatus("TERMINATED");
                csTask.setCompleteTime(LocalDateTime.now());
                countersignTaskMapper.updateById(csTask);
            }

            if (!csTasks.isEmpty()) {
                log.info("终止流程，清理会签数据: instanceId={}, count={}", instanceId, csTasks.size());
            }
        } catch (Exception e) {
            log.warn("清理会签数据失败: instanceId={}, error={}", instanceId, e.getMessage());
        }

        // P1修复: 取消定时器任务
        try {
            if (timerSchedulerService != null) {
                timerSchedulerService.cancelTimersForInstance(instanceId);
                log.info("终止流程，取消定时器: instanceId={}", instanceId);
            }
        } catch (Exception e) {
            log.warn("取消定时器失败: instanceId={}, error={}", instanceId, e.getMessage());
        }

        // 7. 更新流程实例状态（乐观锁：0 行说明与其他操作并发冲突，回滚整个终止事务）
        instance.setStatus("TERMINATED");
        instance.setEndTime(LocalDateTime.now());
        if (processInstanceMapper.updateById(instance) <= 0) {
            throw WorkflowException.invalidState("流程状态已被其他操作变更，终止失败，请刷新后重试");
        }

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
                sysNoticeService.sendNotice(instance.getStartUserId(), "流程终止通知",
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
