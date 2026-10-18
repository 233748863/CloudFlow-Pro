package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.workflow.domain.WfAgentSetting;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskDelegation;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.dto.AgentSettingRequest;
import com.cloudflow.workflow.domain.dto.AgentTaskRequest;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.vo.AgentSettingVO;
import com.cloudflow.workflow.domain.vo.AgentDefinitionOptionVO;
import com.cloudflow.workflow.domain.vo.AgentSettingPreviewVO;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfAgentSettingMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskDelegationMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class WorkflowAgentService {
    private final WfAgentSettingMapper settings;
    private final WfTaskMapper tasks;
    private final WfTaskDelegationMapper delegations;
    private final WfTaskHistoryMapper histories;
    private final WfProcessInstanceMapper instances;
    private final WfProcessDefinitionMapper definitions;
    private final SysUserMapper users;
    private final WorkflowNodePolicy nodes;
    private final WorkflowHParticipantPolicy participants;
    private final WorkflowSecurityUtils security;
    private final ObjectMapper json;

    public PageResult<AgentSettingVO> mine(int pageNum, int pageSize, String status) {
        requirePage(pageNum, pageSize);
        if (StringUtils.hasText(status) && !Set.of("ACTIVE", "DISABLED").contains(status)) {
            throw WorkflowException.validationError("代理设置状态无效");
        }
        Long tenantId = tenant();
        Long userId = user();
        Page<WfAgentSetting> page = settings.selectPage(new Page<>(pageNum, pageSize),
                new LambdaQueryWrapper<WfAgentSetting>().eq(WfAgentSetting::getTenantId, tenantId)
                        .eq(WfAgentSetting::getPrincipalUserId, userId)
                        .eq(StringUtils.hasText(status), WfAgentSetting::getStatus, status)
                        .orderByDesc(WfAgentSetting::getCreateTime).orderByDesc(WfAgentSetting::getSettingId));
        return new PageResult<>(page.getRecords().stream().map(this::view).toList(), page.getTotal(),
                (long) pageNum, (long) pageSize);
    }

    public AgentSettingVO detail(String settingId) {
        return view(ownedSetting(settingId));
    }

    public PageResult<AgentDefinitionOptionVO> definitionOptions(int pageNum, int pageSize) {
        requirePage(pageNum, pageSize);
        user();
        Page<WfProcessDefinition> page = definitions.selectPage(new Page<>(pageNum, pageSize),
                new LambdaQueryWrapper<WfProcessDefinition>()
                        .select(WfProcessDefinition::getDefinitionId, WfProcessDefinition::getProcessName, WfProcessDefinition::getVersion)
                        .eq(WfProcessDefinition::getTenantId, tenant()).eq(WfProcessDefinition::getStatus, "PUBLISHED")
                        .eq(WfProcessDefinition::getDeleted, 0).eq(WfProcessDefinition::getIsArchived, 0)
                        .orderByAsc(WfProcessDefinition::getProcessName).orderByDesc(WfProcessDefinition::getVersion)
                        .orderByAsc(WfProcessDefinition::getDefinitionId));
        return new PageResult<>(page.getRecords().stream().map(definition -> new AgentDefinitionOptionVO(
                definition.getDefinitionId(), definition.getProcessName(), definition.getVersion())).toList(),
                page.getTotal(), (long) pageNum, (long) pageSize);
    }

    public AgentSettingPreviewVO preview(String settingId, AgentSettingRequest request, int pageNum, int pageSize) {
        requirePage(pageNum, pageSize);
        Long tenantId = tenant();
        Long principalId = user();
        WfAgentSetting proposed = settingId == null ? new WfAgentSetting() : ownedSetting(settingId);
        List<String> scope = validateRequest(request, tenantId, principalId);
        proposed.setTenantId(tenantId);
        proposed.setPrincipalUserId(principalId);
        proposed.setAgentUserId(request.agentUserId());
        proposed.setAgentMode(request.agentMode());
        proposed.setDefinitionIds(encode(scope));
        proposed.setStartTime(request.startTime());
        proposed.setEndTime(request.endTime());
        if (settingId == null) proposed.setStatus("ACTIVE");
        LocalDateTime evaluatedAt = LocalDateTime.now();
        Page<WfTask> page = tasks.selectPage(new Page<>(pageNum, pageSize), new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getTenantId, tenantId).eq(WfTask::getAssignee, principalId).eq(WfTask::getStatus, "TODO")
                .orderByDesc(WfTask::getCreateTime).orderByAsc(WfTask::getTaskId));
        List<AgentSettingPreviewVO.Task> rows = page.getRecords().stream().map(task -> {
            String reason = eligibilityFailure(task, proposed, evaluatedAt);
            if (reason == null && settingId != null && returned(task, settingId)) reason = "本设置对应的代理任务已归还";
            return new AgentSettingPreviewVO.Task(task.getTaskId(), task.getNodeName(), reason == null,
                    reason == null ? ("AGENT_ASSIST".equals(proposed.getAgentMode()) ? "可提交协办意见" : "可代理办理") : reason);
        }).toList();
        return new AgentSettingPreviewVO(evaluatedAt, WorkflowAgentPolicy.effectiveStatus(proposed, evaluatedAt),
                rows, page.getTotal(), pageNum, pageSize);
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "保存本人审批代理设置")
    public AgentSettingVO save(String settingId, AgentSettingRequest request) {
        Long tenantId = tenant();
        Long principalId = user();
        lockPrincipal(tenantId, principalId);
        List<WfAgentSetting> owned = settings.selectPrincipalForUpdate(tenantId, principalId);
        WfAgentSetting current = settingId == null ? null : owned.stream()
                .filter(setting -> settingId.equals(setting.getSettingId())).findFirst()
                .orElseThrow(() -> forbidden("只能修改本人的代理设置"));
        List<String> scope = validateRequest(request, tenantId, principalId);
        if (current != null && (!"ACTIVE".equals(current.getStatus())
                || request.version() == null || !request.version().equals(current.getVersion()))) {
            throw settingConflict();
        }
        for (WfAgentSetting existing : owned) {
            if (!Objects.equals(existing.getSettingId(), settingId)
                    && WorkflowAgentPolicy.overlaps(existing, request, scope(existing), scope)) {
                throw new WorkflowException("AGENT_SETTING_CONFLICT", "该时间和流程范围已有代理设置，请调整后保存");
            }
        }
        boolean creating = current == null;
        if (creating) {
            current = new WfAgentSetting();
            current.setSettingId(UUID.randomUUID().toString());
            current.setTenantId(tenantId);
            current.setPrincipalUserId(principalId);
            current.setStatus("ACTIVE");
            current.setVersion(0);
        }
        current.setAgentUserId(request.agentUserId());
        current.setAgentMode(request.agentMode());
        current.setDefinitionIds(encode(scope));
        current.setStartTime(request.startTime());
        current.setEndTime(request.endTime());
        current.setReason(safeText(request.reason()));
        if ((creating ? settings.insert(current) : settings.updateById(current)) != 1) throw settingConflict();
        refreshLocked(tenantId, principalId, settings.selectPrincipalForUpdate(tenantId, principalId));
        return view(current);
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "停用本人审批代理设置", highRisk = true)
    public void disable(String settingId, Integer version) {
        Long tenantId = tenant();
        Long principalId = user();
        lockPrincipal(tenantId, principalId);
        List<WfAgentSetting> owned = settings.selectPrincipalForUpdate(tenantId, principalId);
        WfAgentSetting setting = owned.stream().filter(candidate -> Objects.equals(settingId, candidate.getSettingId()))
                .findFirst().orElseThrow(() -> forbidden("只能停用本人的代理设置"));
        if (version == null || !version.equals(setting.getVersion()) || !"ACTIVE".equals(setting.getStatus())) throw settingConflict();
        setting.setStatus("DISABLED");
        if (settings.updateById(setting) != 1) throw settingConflict();
        refreshLocked(tenantId, principalId, owned);
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "停用本人全部审批代理设置", highRisk = true)
    public void disableMine() {
        Long tenantId = tenant();
        Long principalId = user();
        lockPrincipal(tenantId, principalId);
        List<WfAgentSetting> owned = settings.selectPrincipalForUpdate(tenantId, principalId);
        for (WfAgentSetting setting : owned) {
            if (!"ACTIVE".equals(setting.getStatus())) continue;
            setting.setStatus("DISABLED");
            if (settings.updateById(setting) != 1) throw settingConflict();
        }
        refreshLocked(tenantId, principalId, owned);
    }

    @Transactional(rollbackFor = Exception.class)
    public void createTask(WfTask task) {
        if (task == null || !Objects.equals(tenant(), task.getTenantId()) || !StringUtils.hasText(task.getTaskId())) {
            throw forbidden("任务缺少有效的租户和编号");
        }
        task.setAgentSettingId(null);
        task.setProxyUserId(null);
        task.setAgentMode(null);
        if (task.getExecutionContext() == null) task.setExecutionContext(WorkflowExecutionContext.capture());
        if (task.getVersion() == null) task.setVersion(0);
        if (task.getAssignee() != null) {
            lockPrincipal(task.getTenantId(), task.getAssignee());
            WfAgentSetting setting = matching(task, settings.selectPrincipalForUpdate(task.getTenantId(), task.getAssignee()));
            if (setting != null) bind(task, setting);
        }
        if (tasks.insert(task) != 1) throw taskConflict();
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public WfTask lockTask(String taskId) {
        return lockTaskInStatus(taskId, "TODO");
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public WfTask lockDelegatedTask(String taskId) {
        return lockTaskInStatus(taskId, "DELEGATED");
    }

    private WfTask lockTaskInStatus(String taskId, String expectedStatus) {
        Long tenantId = tenant();
        WfTask probe = tasks.selectById(taskId);
        if (probe == null || !Objects.equals(tenantId, probe.getTenantId())) throw forbidden("任务不存在或无权访问");
        if (instances.selectForExecution(tenantId, probe.getInstanceId()) == null) throw forbidden("流程不存在或无权访问");
        if (probe.getAssignee() != null) lockPrincipal(tenantId, probe.getAssignee());
        WfTask task = tasks.selectForUpdate(tenantId, taskId);
        if (task == null || !expectedStatus.equals(task.getStatus()) || !Objects.equals(probe.getAssignee(), task.getAssignee())) {
            throw taskConflict();
        }
        return task;
    }

    public boolean canRead(WfTask task, Long operatorId) {
        if (task == null || operatorId == null || !Objects.equals(operatorId, task.getProxyUserId())
                || !Objects.equals(tenant(), task.getTenantId()) || !StringUtils.hasText(task.getAgentSettingId())) return false;
        WfAgentSetting setting = settings.selectCurrentSetting(task.getTenantId(), task.getAgentSettingId());
        if (!eligible(task, setting) || !Objects.equals(setting.getAgentUserId(), operatorId)) return false;
        if (!Objects.equals(task.getAssignee(), settings.selectCurrentActiveUser(task.getTenantId(), task.getAssignee()))
                || !Objects.equals(operatorId, settings.selectCurrentActiveUser(task.getTenantId(), operatorId))) return false;
        WfTaskDelegation relation = activeRelation(task);
        if (relation == null || !Objects.equals(relation.getToUserId(), operatorId)
                || !Objects.equals(relation.getFromUserId(), task.getAssignee())
                || !Objects.equals(relation.getAgentMode(), setting.getAgentMode())) return false;
        task.setAgentMode(setting.getAgentMode());
        return true;
    }

    public boolean canAct(WfTask task, Long operatorId) {
        return canRead(task, operatorId) && "AGENT".equals(task.getAgentMode());
    }

    public void assertAgentAction(WfTask task, Long operatorId) {
        if (!canAct(task, operatorId)) throw forbidden("代理资格已失效或当前为仅能提交意见的协办模式");
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "代理归还本人收到的任务", highRisk = true)
    public WfTask returnTask(AgentTaskRequest request) {
        WfTask task = lockTask(request.taskId());
        requireVersion(task, request.version());
        if (!canRead(task, user())) throw forbidden("只有当前有效代理人可以归还任务");
        record(task, "AGENT_RETURN", "DELEGATE_RETURN", request.reason());
        finishRelations(task, "CANCELLED");
        updateBinding(task, null);
        return task;
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "提交本人代理任务协办意见")
    public String assist(AgentTaskRequest request) {
        WfTask task = lockTask(request.taskId());
        requireVersion(task, request.version());
        if (!canRead(task, user()) || !"AGENT_ASSIST".equals(task.getAgentMode())) {
            throw forbidden("只有当前有效协办人可以提交协办意见");
        }
        if (!StringUtils.hasText(request.comment()) || request.comment().length() > 1000) {
            throw WorkflowException.validationError("请填写不超过1000字的协办意见");
        }
        String historyId = record(task, "AGENT_ASSIST", task.getTaskType(), request.comment());
        if (tasks.update(null, new LambdaUpdateWrapper<WfTask>().eq(WfTask::getTenantId, task.getTenantId())
                .eq(WfTask::getTaskId, task.getTaskId()).eq(WfTask::getStatus, "TODO")
                .eq(WfTask::getVersion, task.getVersion()).set(WfTask::getVersion, task.getVersion() + 1)) != 1) throw taskConflict();
        return historyId;
    }

    public void annotateHistory(WfTaskHistory history, WfTask task, Long operatorId) {
        if (!Objects.equals(task.getAssignee(), operatorId) && Objects.equals(task.getProxyUserId(), operatorId)
                && StringUtils.hasText(task.getAgentSettingId()) && StringUtils.hasText(task.getAgentMode())) {
            history.setOnBehalfOfUserId(task.getAssignee());
            history.setOnBehalfOfUserName(StringUtils.hasText(task.getAssigneeName())
                    ? task.getAssigneeName() : display(users.selectById(task.getAssignee())));
        }
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void completeRelations(WfTask task) {
        finishRelations(task, "COMPLETED");
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void refreshAssignment(WfTask task) {
        if (!Objects.equals(tenant(), task.getTenantId())) throw forbidden("任务租户不匹配");
        if (task.getAssignee() != null) lockPrincipal(task.getTenantId(), task.getAssignee());
        WfAgentSetting next = task.getAssignee() == null ? null
                : matching(task, settings.selectPrincipalForUpdate(task.getTenantId(), task.getAssignee()));
        finishRelations(task, "CANCELLED");
        updateBinding(task, next);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void detachAssignment(WfTask task) {
        if (!Objects.equals(tenant(), task.getTenantId())) throw forbidden("任务租户不匹配");
        finishRelations(task, "CANCELLED");
        updateBinding(task, null);
    }

    public List<Long> refreshPrincipals(Long afterUserId, int limit) {
        requirePage(1, limit);
        return settings.selectRefreshPrincipals(tenant(), afterUserId == null ? 0L : afterUserId, limit);
    }

    @Transactional(rollbackFor = Exception.class)
    public void refreshPrincipal(Long principalId) {
        Long tenantId = tenant();
        lockPrincipal(tenantId, principalId);
        refreshLocked(tenantId, principalId, settings.selectPrincipalForUpdate(tenantId, principalId));
    }

    public List<WfTask> receivedTasks() {
        Long operatorId = user();
        return tasks.selectList(new LambdaQueryWrapper<WfTask>().eq(WfTask::getTenantId, tenant())
                        .eq(WfTask::getProxyUserId, operatorId).eq(WfTask::getStatus, "TODO")
                        .orderByDesc(WfTask::getCreateTime).orderByDesc(WfTask::getTaskId)).stream()
                .filter(task -> canRead(task, operatorId)).toList();
    }

    private void refreshLocked(Long tenantId, Long principalId, List<WfAgentSetting> owned) {
        for (WfTask task : settings.selectPrincipalTasksForUpdate(tenantId, principalId)) {
            WfAgentSetting next = matching(task, owned);
            WfTaskDelegation relation = activeRelation(task);
            if (next != null && relation != null && Objects.equals(task.getAgentSettingId(), next.getSettingId())
                    && Objects.equals(task.getProxyUserId(), next.getAgentUserId())
                    && Objects.equals(relation.getAgentMode(), next.getAgentMode())
                    && Objects.equals(relation.getStartTime(), next.getStartTime())
                    && Objects.equals(relation.getEndTime(), next.getEndTime())) continue;
            if (task.getAgentSettingId() == null && task.getProxyUserId() == null && next == null) continue;
            finishRelations(task, "CANCELLED");
            updateBinding(task, next);
        }
    }

    private WfAgentSetting matching(WfTask task, List<WfAgentSetting> owned) {
        List<WfAgentSetting> matches = owned.stream().filter(setting -> eligible(task, setting))
                .filter(setting -> !returned(task, setting.getSettingId())).toList();
        if (matches.size() > 1) throw settingConflict();
        return matches.isEmpty() ? null : matches.get(0);
    }

    private boolean eligible(WfTask task, WfAgentSetting setting) {
        return eligibilityFailure(task, setting, LocalDateTime.now()) == null;
    }

    private String eligibilityFailure(WfTask task, WfAgentSetting setting, LocalDateTime evaluatedAt) {
        if (setting == null || !"TODO".equals(task.getStatus())
                || !Objects.equals(task.getTenantId(), setting.getTenantId())
                || !Objects.equals(task.getAssignee(), setting.getPrincipalUserId())
                || Objects.equals(setting.getPrincipalUserId(), setting.getAgentUserId())
                || !Set.of("AGENT", "AGENT_ASSIST").contains(Objects.toString(setting.getAgentMode(), ""))) return "任务或代理设置不适用";
        if (!WorkflowAgentPolicy.active(setting, evaluatedAt)) return "设置已停用、尚未生效或已到期";
        if (!activeUser(task.getTenantId(), setting.getPrincipalUserId())
                || !activeUser(task.getTenantId(), setting.getAgentUserId())) return "代理双方须为启用用户";
        WfProcessInstance instance = instances.selectById(task.getInstanceId());
        if (instance == null || !Objects.equals(task.getTenantId(), instance.getTenantId())
                || !WfProcessStatus.isActive(instance.getStatus()) || !StringUtils.hasText(instance.getDefinitionId())) return "流程当前不可办理";
        List<String> scope = scope(setting);
        if (!scope.isEmpty() && !scope.contains(instance.getDefinitionId())) return "不在指定的流程版本范围内";
        WfNodeConfig node = nodes.resolveNode(instance, task.getNodeKey());
        if (!WorkflowNodePolicy.allows(node, "allowAgent")) return "当前节点禁止代理";
        try {
            participants.assertParticipantChange(task, List.of(setting.getAgentUserId()));
            participants.assertTaskAction(task, setting.getAgentUserId(), null);
            return null;
        } catch (WorkflowException forbidden) {
            return "当前业务的参与人限制禁止代理";
        }
    }

    private void bind(WfTask task, WfAgentSetting setting) {
        task.setProxyUserId(setting.getAgentUserId());
        task.setAgentSettingId(setting.getSettingId());
        task.setAgentMode(setting.getAgentMode());
        WfTaskDelegation relation = new WfTaskDelegation();
        relation.setDelegationId(UUID.randomUUID().toString());
        relation.setTenantId(task.getTenantId());
        relation.setTaskId(task.getTaskId());
        relation.setInstanceId(task.getInstanceId());
        relation.setDelegationType("PROXY");
        relation.setAgentMode(setting.getAgentMode());
        relation.setSettingId(setting.getSettingId());
        relation.setFromUserId(task.getAssignee());
        relation.setFromUserName(display(users.selectById(task.getAssignee())));
        relation.setToUserId(setting.getAgentUserId());
        relation.setToUserName(display(users.selectById(setting.getAgentUserId())));
        relation.setReason(setting.getReason());
        relation.setStatus("ACTIVE");
        relation.setStartTime(setting.getStartTime());
        relation.setEndTime(setting.getEndTime());
        relation.setCreateTime(LocalDateTime.now());
        relation.setVersion(0);
        if (delegations.insert(relation) != 1) throw taskConflict();
    }

    private void updateBinding(WfTask task, WfAgentSetting setting) {
        int version = task.getVersion();
        task.setProxyUserId(null);
        task.setAgentSettingId(null);
        task.setAgentMode(null);
        if (setting != null) bind(task, setting);
        if (tasks.update(null, new LambdaUpdateWrapper<WfTask>().eq(WfTask::getTenantId, task.getTenantId())
                .eq(WfTask::getTaskId, task.getTaskId()).eq(WfTask::getStatus, task.getStatus())
                .eq(WfTask::getVersion, version).set(WfTask::getProxyUserId, task.getProxyUserId())
                .set(WfTask::getAgentSettingId, task.getAgentSettingId()).set(WfTask::getVersion, version + 1)) != 1) throw taskConflict();
        task.setVersion(version + 1);
    }

    private WfTaskDelegation activeRelation(WfTask task) {
        if (!StringUtils.hasText(task.getAgentSettingId())) return null;
        return settings.selectCurrentRelation(task.getTenantId(), task.getTaskId(), task.getAgentSettingId());
    }

    private void finishRelations(WfTask task, String status) {
        delegations.update(null, new LambdaUpdateWrapper<WfTaskDelegation>()
                .eq(WfTaskDelegation::getTenantId, task.getTenantId()).eq(WfTaskDelegation::getTaskId, task.getTaskId())
                .isNotNull(WfTaskDelegation::getSettingId).eq(WfTaskDelegation::getStatus, "ACTIVE")
                .set(WfTaskDelegation::getStatus, status));
    }

    private boolean returned(WfTask task, String settingId) {
        for (WfTaskHistory history : settings.selectCurrentReturns(task.getTenantId(), task.getTaskId())) {
            try {
                if (settingId.equals(json.readTree(history.getVariablesChanged()).path("agentSettingId").asText())) return true;
            } catch (Exception invalid) {
                throw forbidden("代理归还记录无法核实，暂不重新分派");
            }
        }
        return false;
    }

    private String record(WfTask task, String action, String taskType, String comment) {
        WfTaskHistory history = new WfTaskHistory();
        history.setHistoryId(UUID.randomUUID().toString());
        history.setTenantId(task.getTenantId());
        history.setTaskId(task.getTaskId());
        history.setInstanceId(task.getInstanceId());
        history.setNodeKey(task.getNodeKey());
        history.setNodeName(task.getNodeName());
        history.setTaskType(taskType);
        history.setAction(action);
        history.setComment(safeText(comment));
        history.setOperatorId(user());
        history.setOperatorName(display(requireActiveUser(task.getTenantId(), user())));
        history.setOnBehalfOfUserId(task.getAssignee());
        history.setOnBehalfOfUserName(display(users.selectById(task.getAssignee())));
        history.setVariablesChanged(encode(Map.of("agentSettingId", task.getAgentSettingId(), "agentMode", task.getAgentMode())));
        history.setCreateTime(LocalDateTime.now());
        if (histories.insert(history) != 1) throw taskConflict();
        return history.getHistoryId();
    }

    private AgentSettingVO view(WfAgentSetting setting) {
        SysUser agent = users.selectById(setting.getAgentUserId());
        List<String> affected = tasks.selectList(new LambdaQueryWrapper<WfTask>()
                        .eq(WfTask::getTenantId, setting.getTenantId()).eq(WfTask::getAssignee, setting.getPrincipalUserId())
                        .eq(WfTask::getStatus, "TODO")).stream()
                .filter(task -> eligible(task, setting) && !returned(task, setting.getSettingId())).map(WfTask::getTaskId).toList();
        return new AgentSettingVO(setting.getSettingId(), setting.getAgentUserId(),
                agent != null && Objects.equals(agent.getTenantId(), setting.getTenantId()) ? display(agent) : "用户已不可用",
                setting.getAgentMode(), scope(setting), setting.getStartTime(), setting.getEndTime(), setting.getReason(),
                setting.getStatus(), WorkflowAgentPolicy.effectiveStatus(setting, LocalDateTime.now()), setting.getVersion(), affected);
    }

    private List<String> scope(WfAgentSetting setting) {
        if (!StringUtils.hasText(setting.getDefinitionIds())) return List.of();
        try {
            List<String> scope = json.readValue(setting.getDefinitionIds(), new TypeReference<List<String>>() { });
            if (scope == null || scope.stream().anyMatch(value -> value == null || value.isBlank())) throw new IllegalArgumentException();
            return scope;
        } catch (Exception invalid) {
            throw forbidden("代理流程范围无法核实");
        }
    }

    private void lockPrincipal(Long tenantId, Long principalId) {
        if (!Objects.equals(principalId, settings.lockPrincipal(tenantId, principalId))) throw forbidden("代理负责人不存在或租户不匹配");
    }

    private WfAgentSetting ownedSetting(String settingId) {
        WfAgentSetting setting = settings.selectById(settingId);
        if (setting == null || !Objects.equals(tenant(), setting.getTenantId())
                || !Objects.equals(user(), setting.getPrincipalUserId())) throw forbidden("只能查看本人的代理设置");
        return setting;
    }

    private List<String> validateRequest(AgentSettingRequest request, Long tenantId, Long principalId) {
        List<String> scope = WorkflowAgentPolicy.validate(request, principalId);
        requireActiveUser(tenantId, principalId);
        requireActiveUser(tenantId, request.agentUserId());
        for (String definitionId : scope) {
            WfProcessDefinition definition = definitions.selectById(definitionId);
            if (definition == null || !Objects.equals(tenantId, definition.getTenantId())
                    || !"PUBLISHED".equals(definition.getStatus())
                    || Integer.valueOf(1).equals(definition.getDeleted())
                    || Integer.valueOf(1).equals(definition.getIsArchived())) {
                throw WorkflowException.validationError("流程范围只能选择本租户已发布的有效版本");
            }
        }
        return scope;
    }

    private boolean activeUser(Long tenantId, Long userId) {
        return userId != null && Objects.equals(userId, settings.selectCurrentActiveUser(tenantId, userId));
    }

    private SysUser requireActiveUser(Long tenantId, Long userId) {
        if (!activeUser(tenantId, userId)) throw forbidden("代理双方必须是本租户启用的用户");
        return users.selectById(userId);
    }

    private String encode(Object value) {
        try { return json.writeValueAsString(value); }
        catch (Exception invalid) { throw WorkflowException.validationError("代理数据格式无效"); }
    }

    private String safeText(String value) { return value == null ? null : security.sanitizeXss(value.trim()); }
    private static String display(SysUser user) { return user == null ? "用户已不可用" : StringUtils.hasText(user.getNickName()) ? user.getNickName() : user.getUserName(); }
    private static Long tenant() { return WorkflowLaunchContextService.requireTenant(); }
    private static Long user() { return WorkflowLaunchContextService.requireUser(); }
    private static void requirePage(int pageNum, int pageSize) {
        if (pageNum < 1 || pageSize < 1 || pageSize > 100) throw WorkflowException.validationError("页码必须大于0，每页1至100条");
    }
    private static void requireVersion(WfTask task, Integer version) {
        if (version == null || !Objects.equals(task.getVersion(), version)) throw taskConflict();
    }
    private static WorkflowException forbidden(String message) { return new WorkflowException("AGENT_FORBIDDEN", message); }
    private static WorkflowException settingConflict() { return new WorkflowException("AGENT_SETTING_CONFLICT", "代理设置已变更，请重新读取后操作"); }
    private static WorkflowException taskConflict() { return new WorkflowException("TASK_VERSION_CONFLICT", "任务已变更或已处理，请重新读取后操作"); }
}
