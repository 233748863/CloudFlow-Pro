package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessCopy;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.vo.DraftLaunchContextVO;
import com.cloudflow.workflow.domain.vo.FieldPermissionVO;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.exception.WorkflowFormValidationException;
import com.cloudflow.workflow.mapper.WfFormDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessCopyMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class WorkflowFormAccessService {
    private final WfProcessInstanceMapper instances;
    private final WfProcessDefinitionMapper definitions;
    private final WfFormDefinitionMapper forms;
    private final WfTaskMapper tasks;
    private final WfTaskHistoryMapper histories;
    private final WfProcessCopyMapper copies;
    private final WorkflowPermissionService authorization;
    private final WorkflowFieldPermissionCache fieldPermissions;
    private final WorkflowGraphModelResolver graphs;
    private final WorkflowDraftJson json;
    private final WorkflowFormInputService inputs;
    private final WorkflowFormSecurityAudit audit;
    private final FormDataPermissionFilter filter;

    public ReadContext instance(String instanceId, String taskId) {
        WfProcessInstance instance = instances.selectById(instanceId);
        if (instance == null) throw WorkflowException.instanceNotFound(instanceId);
        requireTenant(instance.getTenantId());
        authorization.checkViewInstancePermission(instance);
        WfProcessDefinition definition = definition(instance.getDefinitionId());
        Set<String> nodes = new LinkedHashSet<>();
        for (String node : readerNodes(instance, taskId)) nodes.add(canonicalNodeKey(definition, node));
        boolean editable = nodes.size() == 1 && nodeAllowsEdit(definition, nodes.iterator().next());
        List<FieldPermissionVO> permissions = fieldPermissions.get(definition.getTenantId(), definition.getDefinitionId());
        if (nodes.isEmpty()) {
            nodes = new LinkedHashSet<>();
            nodes.add("__START__");
            for (FieldPermissionVO permission : permissions) nodes.add(permission.nodeKey());
        }
        return new ReadContext(definition, form(definition, instance.getFormVersion()), instance.getInstanceId(), nodes, editable, permissions, getRawVariables(instance), instance.getFormVersion() == null);
    }

    public ReadContext start(String definitionId) {
        WfProcessDefinition definition = definition(definitionId);
        if (!"PUBLISHED".equals(definition.getStatus()) || Integer.valueOf(1).equals(definition.getIsArchived()) || Integer.valueOf(1).equals(definition.getDeleted()) || !authorization.canStartProcess(WorkflowLaunchContextService.requireUser(),
                definition.getStartPermissionType(), definition.getStartPermissionValue())) throw WorkflowException.permissionDenied("无权读取该流程的发起表单");
        return new ReadContext(definition, form(definition), null, Set.of("__START__"), true,
                fieldPermissions.get(definition.getTenantId(), definitionId), Map.of(), false);
    }

    public ReadContext form(String formId, String instanceId, String definitionId, String taskId) {
        ReadContext context;
        if (StringUtils.hasText(instanceId)) context = instance(instanceId, taskId);
        else if (StringUtils.hasText(definitionId)) context = start(definitionId);
        else {
            List<WfProcessDefinition> accessible = definitions.selectList(new LambdaQueryWrapper<WfProcessDefinition>()
                            .eq(WfProcessDefinition::getTenantId, WorkflowLaunchContextService.requireTenant())
                            .eq(WfProcessDefinition::getFormId, formId).eq(WfProcessDefinition::getStatus, "PUBLISHED"))
                    .stream().filter(definition -> authorization.canStartProcess(WorkflowLaunchContextService.requireUser(), definition.getStartPermissionType(), definition.getStartPermissionValue())).toList();
            if (accessible.size() != 1) throw WorkflowException.permissionDenied("请指定有权访问的流程定义或实例后读取表单");
            context = start(accessible.get(0).getDefinitionId());
        }
        if (context.form() == null || !Objects.equals(formId, context.form().getFormId())) throw WorkflowException.permissionDenied("表单与流程上下文不匹配");
        return context;
    }

    public ApprovalData approval(WfTask task, WfProcessInstance instance, Map<String, Object> supplied, boolean defaultEditable) {
        requireTenant(instance.getTenantId());
        if (!Objects.equals(task.getInstanceId(), instance.getInstanceId()) || !Objects.equals(task.getTenantId(), instance.getTenantId())) throw WorkflowException.permissionDenied("任务与流程上下文不匹配");
        WfProcessDefinition definition = definition(instance.getDefinitionId());
        WfFormDefinition form = form(definition, instance.getFormVersion());
        if (form == null) return new ApprovalData(false, supplied == null ? Map.of() : supplied);
        Map<String, Object> original = getRawVariables(instance);
        String nodeKey = canonicalNodeKey(definition, task.getNodeKey());
        List<FieldPermissionVO> permissions = fieldPermissions.get(definition.getTenantId(), definition.getDefinitionId()).stream()
                .filter(permission -> Objects.equals(permission.nodeKey(), nodeKey)).toList();
        DraftLaunchContextVO context = new DraftLaunchContextVO(definition.getDefinitionId(), definition.getProcessKey(), definition.getProcessName(),
                form.getFormId(), Map.of("fields", fields(form)), permissions, List.of(), "");
        try {
            Map<String, Object> normalized = inputs.validateApproval(context, original, supplied, defaultEditable || "__START__".equals(nodeKey), instance.getInstanceId());
            Map<String, Object> changes = new LinkedHashMap<>();
            normalized.forEach((key, value) -> { if (!original.containsKey(key) || !json.canonical(original.get(key)).equals(json.canonical(value))) changes.put(key, value); });
            return new ApprovalData(true, changes);
        } catch (WorkflowFormValidationException rejected) {
            if (!rejected.getTamperedFields().isEmpty()) audit.rejected(task, rejected.getTamperedFields());
            throw rejected;
        }
    }

    public Map<String, Object> getRawVariables(WfProcessInstance instance) {
        return StringUtils.hasText(instance.getVariables()) ? json.readData(instance.getVariables()) : Map.of();
    }

    public Map<String, Object> getVisibleVariables(ReadContext context, Map<String, Object> raw) {
        if (context.form() != null) return projection(context, raw).values();
        Map<String, Object> visible = new LinkedHashMap<>();
        raw.forEach((key, value) -> { if (!key.startsWith("_")) visible.put(key, value); });
        return visible;
    }

    public FormDataPermissionFilter.Projection projection(ReadContext context, Map<String, Object> values) {
        if (context.form() == null) throw WorkflowException.invalidState("流程未绑定表单定义");
        return filter.filter(schema(context.form()), values, context.permissions(), context.nodeKeys(), context.defaultEditable());
    }

    public Map<String, Object> visibleForm(ReadContext context, FormDataPermissionFilter.Projection projection) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", context.form().getFormId());
        result.put("name", context.form().getFormName());
        result.put("version", context.form().getVersion());
        result.put("versionLock", context.form().getVersionLock());
        result.put("versionUnknownFlag", context.versionUnknown());
        result.put("fields", projection.fields());
        return result;
    }

    public boolean designer() { return authorization.isAdmin(UserContext.getUserId()); }

    public void assertTaskWrite(WfTask task) {
        authorization.checkTaskPermission(task);
    }

    private Set<String> readerNodes(WfProcessInstance instance, String taskId) {
        Long userId = WorkflowLaunchContextService.requireUser();
        Set<String> nodes = new LinkedHashSet<>();
        if (StringUtils.hasText(taskId)) {
            WfTask task = tasks.selectById(taskId);
            if (task == null || !Objects.equals(task.getInstanceId(), instance.getInstanceId()) || !Objects.equals(task.getTenantId(), instance.getTenantId())) throw WorkflowException.permissionDenied("任务与流程不匹配");
            authorization.checkTaskReadPermission(task);
            nodes.add(task.getNodeKey());
            return nodes;
        }
        tasks.selectList(new LambdaQueryWrapper<WfTask>().eq(WfTask::getTenantId, instance.getTenantId())
                .eq(WfTask::getInstanceId, instance.getInstanceId()).eq(WfTask::getStatus, "TODO")
                .and(task -> task.eq(WfTask::getAssignee, userId).or().eq(WfTask::getProxyUserId, userId)))
                .stream().filter(authorization::canReadTask).map(WfTask::getNodeKey).filter(StringUtils::hasText).forEach(nodes::add);
        if (!nodes.isEmpty()) return nodes;
        List<WfTaskHistory> history = histories.selectList(new LambdaQueryWrapper<WfTaskHistory>().eq(WfTaskHistory::getTenantId, instance.getTenantId())
                .eq(WfTaskHistory::getInstanceId, instance.getInstanceId())
                .and(historyOwner -> historyOwner.eq(WfTaskHistory::getOperatorId, userId).or().eq(WfTaskHistory::getOnBehalfOfUserId, userId))
                .orderByDesc(WfTaskHistory::getCreateTime));
        history.stream().map(WfTaskHistory::getNodeKey).filter(StringUtils::hasText).findFirst().ifPresent(nodes::add);
        if (!nodes.isEmpty()) return nodes;
        if (Objects.equals(userId, instance.getStartUserId())) return Set.of("__START__");
        copies.selectList(new LambdaQueryWrapper<WfProcessCopy>().eq(WfProcessCopy::getTenantId, instance.getTenantId())
                .eq(WfProcessCopy::getInstanceId, instance.getInstanceId()).eq(WfProcessCopy::getUserId, userId).orderByDesc(WfProcessCopy::getCreateTime))
                .stream().map(WfProcessCopy::getNodeId).filter(StringUtils::hasText).findFirst().ifPresent(nodes::add);
        return nodes;
    }

    private boolean nodeAllowsEdit(WfProcessDefinition definition, String nodeKey) {
        if ("__START__".equals(nodeKey)) return true;
        WfNodeConfig node = graphs.parseRuntimeGraph(definition.getModelJson()).getNode(nodeKey);
        return node != null && Boolean.TRUE.equals(node.getAllowEdit());
    }

    private String canonicalNodeKey(WfProcessDefinition definition, String nodeKey) {
        if ("__START__".equals(nodeKey)) return nodeKey;
        WfNodeConfig node = graphs.parseRuntimeGraph(definition.getModelJson()).getNode(nodeKey);
        if (node == null) throw WorkflowException.invalidState("流程节点不在绑定版本中");
        return "START".equals(node.getType()) ? "__START__" : nodeKey;
    }

    private WfProcessDefinition definition(String definitionId) {
        if (!StringUtils.hasText(definitionId)) throw WorkflowException.invalidState("流程实例缺少绑定定义");
        WfProcessDefinition definition = definitions.selectById(definitionId);
        if (definition == null) throw WorkflowException.processNotFound(definitionId);
        requireTenant(definition.getTenantId());
        return definition;
    }

    private WfFormDefinition form(WfProcessDefinition definition) {
        return form(definition, null);
    }

    private WfFormDefinition form(WfProcessDefinition definition, Integer version) {
        if (!StringUtils.hasText(definition.getFormId())) return null;
        WfFormDefinition form = version == null ? forms.selectLatest(definition.getTenantId(), definition.getFormId())
                : forms.selectVersion(definition.getTenantId(), definition.getFormId(), version);
        if (form == null) throw WorkflowException.invalidState("绑定表单定义不存在");
        requireTenant(form.getTenantId());
        return form;
    }

    private com.fasterxml.jackson.databind.JsonNode fields(WfFormDefinition form) {
        JsonNode root = json.tree(schema(form));
        return root.isArray() ? root : root.path("fields");
    }

    private String schema(WfFormDefinition form) { return StringUtils.hasText(form.getFieldsJson()) ? form.getFieldsJson() : form.getFormSchema(); }
    private void requireTenant(Long tenantId) { if (!Objects.equals(WorkflowLaunchContextService.requireTenant(), tenantId)) throw WorkflowException.permissionDenied("无权访问其他租户的流程表单"); }

    public record ReadContext(WfProcessDefinition definition, WfFormDefinition form, String instanceId, Set<String> nodeKeys,
                              boolean defaultEditable, List<FieldPermissionVO> permissions, Map<String, Object> rawValues, boolean versionUnknown) {
        public String nodeKey() { return nodeKeys.size() == 1 ? nodeKeys.iterator().next() : "__READ__"; }
    }
    public record ApprovalData(boolean formBound, Map<String, Object> changes) { }
}
