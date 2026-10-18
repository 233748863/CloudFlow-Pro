package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.WfFormFieldPermission;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.dto.FieldPermissionDTO;
import com.cloudflow.workflow.domain.vo.FieldPermissionVO;
import com.cloudflow.workflow.domain.vo.NodeOptionVO;
import com.cloudflow.workflow.domain.vo.StartAssigneeNodeVO;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfFormFieldPermissionMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.model.WorkflowRuntimeGraph;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class WorkflowDefinitionConfigService {
    private final WfProcessDefinitionMapper definitions;
    private final WorkflowConfigurationLockService configurationLocks;
    private final WfFormFieldPermissionMapper fields;
    private final WorkflowGraphModelResolver graphs;
    private final WorkflowPermissionService permissions;
    private final InitiatorSelectionService selections;
    private final ObjectMapper mapper;

    public List<NodeOptionVO> selectableNodes(String definitionId, String currentNodeKey) {
        WfProcessDefinition definition = requireDefinition(definitionId);
        WorkflowRuntimeGraph graph = graphs.parseRuntimeGraph(definition.getModelJson());
        if (graph.getNode(currentNodeKey) == null) throw WorkflowException.validationError("当前节点不存在");
        List<NodeOptionVO> options = new ArrayList<>();
        for (String nodeKey : graph.getNodeIds()) {
            try {
                WorkflowRejectPolicy.assertUpstream(graph, currentNodeKey, nodeKey);
                options.add(new NodeOptionVO(nodeKey, graph.getNode(nodeKey).getTitle()));
            } catch (WorkflowException notUpstream) {
            }
        }
        return options;
    }

    public List<StartAssigneeNodeVO> startAssigneeNodes(String definitionId) {
        return startAssigneeNodes(requireDefinition(definitionId));
    }

    public List<StartAssigneeNodeVO> startAssigneeNodes(WfProcessDefinition definition) {
        if (!Objects.equals(UserContext.getTenantId(), definition.getTenantId())) {
            throw WorkflowException.permissionDenied("无权访问其他租户的流程配置");
        }
        if (!"PUBLISHED".equals(definition.getStatus()) || !permissions.canStartProcess(UserContext.getUserId(),
                definition.getStartPermissionType(), definition.getStartPermissionValue())) {
            throw WorkflowException.permissionDenied("该流程未发布或当前用户无权发起");
        }
        WorkflowRuntimeGraph graph = graphs.parseRuntimeGraph(definition.getModelJson());
        List<StartAssigneeNodeVO> options = new ArrayList<>();
        for (String nodeKey : graph.getNodeIds()) {
            WfNodeConfig node = graph.getNode(nodeKey);
            if (!"INITIATOR_SELECTED".equals(node.getApproverType())) continue;
            WorkflowNodePolicy.assertAllowed(node, "allowSelection");
            List<StartAssigneeNodeVO.Candidate> candidates = selections.selectableUsers(node, definition.getTenantId()).stream()
                    .map(user -> new StartAssigneeNodeVO.Candidate(String.valueOf(user.getUserId()),
                            StringUtils.hasText(user.getNickName()) ? user.getNickName() : user.getUserName())).toList();
            options.add(new StartAssigneeNodeVO(nodeKey, node.getTitle(),
                    node.getSelectableScope() == null ? Map.of() : node.getSelectableScope(),
                    StringUtils.hasText(node.getSignType()), candidates));
        }
        return options;
    }

    public List<FieldPermissionVO> fieldPermissions(String definitionId) {
        permissions.checkDefinitionPermission("查看字段权限配置");
        WfProcessDefinition definition = requireDefinition(definitionId);
        return fields.selectList(query(definition)).stream().map(field -> new FieldPermissionVO(field.getNodeKey(),
                field.getFieldId(), field.getVisibleFlag(), field.getEditableFlag(), field.getRequiredFlag())).toList();
    }

    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "workflowFormPermissions", key = "T(com.cloudflow.common.core.context.UserContext).getTenantId() + ':' + #definitionId")
    public void saveFieldPermissions(String definitionId, List<FieldPermissionDTO> requested) {
        permissions.checkDefinitionPermission("配置字段权限");
        if (requested == null) throw WorkflowException.validationError("字段权限列表不能为空");
        WorkflowConfigurationLockService.LockedConfiguration locked = configurationLocks.lockDefinition(definitionId);
        WfProcessDefinition definition = locked.requireDefinition(definitionId);
        if (!"DRAFT".equals(definition.getStatus())) throw WorkflowException.invalidState("已发布流程的字段权限不可原地修改，请先保存为新草稿");
        WorkflowRuntimeGraph graph = graphs.parseRuntimeGraph(definition.getModelJson());
        Set<String> validFields = new HashSet<>();
        if (!requested.isEmpty()) {
            WfFormDefinition form = locked.form(definition.getFormId());
            if (form == null || !Objects.equals(form.getTenantId(), definition.getTenantId())) {
                throw WorkflowException.validationError("请先绑定当前租户的表单");
            }
            try {
                JsonNode root = mapper.readTree(form.getFieldsJson());
                collectFields(root.isArray() ? root : root.path("fields"), "", validFields);
            } catch (Exception invalidForm) {
                throw WorkflowException.validationError("绑定表单字段无法解析");
            }
        }
        Set<String> unique = new HashSet<>();
        List<WfFormFieldPermission> records = new ArrayList<>();
        for (FieldPermissionDTO requestedField : requested) {
            if (requestedField == null || !StringUtils.hasText(requestedField.nodeKey()) || requestedField.nodeKey().length() > 64
                    || !StringUtils.hasText(requestedField.fieldId()) || requestedField.fieldId().length() > 100
                    || requestedField.visibleFlag() == null || requestedField.editableFlag() == null) {
                throw WorkflowException.validationError("字段权限缺少节点、字段或可见可编辑设置");
            }
            if (!"__START__".equals(requestedField.nodeKey()) && graph.getNode(requestedField.nodeKey()) == null) {
                throw WorkflowException.validationError("字段权限的节点不存在");
            }
            if (!validFields.contains(requestedField.fieldId())) throw WorkflowException.validationError("字段权限的表单字段不存在");
            if (!unique.add(requestedField.nodeKey() + ":" + requestedField.fieldId())) throw WorkflowException.validationError("节点字段权限重复");
            if (requestedField.editableFlag() && !requestedField.visibleFlag()) throw WorkflowException.validationError("隐藏字段不能设置为可编辑");
            WfFormFieldPermission record = new WfFormFieldPermission();
            record.setPermissionId(UUID.randomUUID().toString()); record.setTenantId(definition.getTenantId());
            record.setDefinitionId(definitionId); record.setNodeKey(requestedField.nodeKey()); record.setFieldId(requestedField.fieldId());
            record.setVisibleFlag(requestedField.visibleFlag()); record.setEditableFlag(requestedField.editableFlag());
            record.setRequiredFlag(requestedField.requiredFlag()); record.setCreateBy(String.valueOf(UserContext.getUserId()));
            record.setCreateTime(LocalDateTime.now()); record.setUpdateBy(record.getCreateBy()); record.setUpdateTime(record.getCreateTime());
            records.add(record);
        }
        fields.delete(query(definition));
        for (WfFormFieldPermission record : records) {
            if (fields.insert(record) != 1) throw WorkflowException.invalidState("字段权限保存失败");
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void copyFieldPermissions(WfProcessDefinition source, WfProcessDefinition target,
                                      com.cloudflow.workflow.domain.WfFormDefinition targetForm) {
        if (source == null || targetForm == null) return;
        Long tenantId = WorkflowLaunchContextService.requireTenant();
        if (!Objects.equals(source.getTenantId(), tenantId) || !Objects.equals(target.getTenantId(), tenantId) || !Objects.equals(targetForm.getTenantId(), tenantId)) {
            throw WorkflowException.permissionDenied("无权复制其他租户的字段权限");
        }
        Set<String> validFields = new HashSet<>();
        try {
            JsonNode root = mapper.readTree(targetForm.getFieldsJson());
            collectFields(root.isArray() ? root : root.path("fields"), "", validFields);
        } catch (Exception invalidForm) { throw WorkflowException.validationError("绑定表单字段无法解析"); }
        WorkflowRuntimeGraph graph = graphs.parseRuntimeGraph(target.getModelJson());
        for (WfFormFieldPermission permission : fields.selectList(query(source))) {
            if (!validFields.contains(permission.getFieldId()) || !"__START__".equals(permission.getNodeKey()) && graph.getNode(permission.getNodeKey()) == null) continue;
            WfFormFieldPermission copy = new WfFormFieldPermission();
            copy.setPermissionId(UUID.randomUUID().toString()); copy.setTenantId(tenantId); copy.setDefinitionId(target.getDefinitionId());
            copy.setNodeKey(permission.getNodeKey()); copy.setFieldId(permission.getFieldId()); copy.setVisibleFlag(permission.getVisibleFlag());
            copy.setEditableFlag(permission.getEditableFlag()); copy.setRequiredFlag(permission.getRequiredFlag());
            copy.setCreateBy(String.valueOf(UserContext.getUserId())); copy.setUpdateBy(copy.getCreateBy());
            copy.setCreateTime(LocalDateTime.now()); copy.setUpdateTime(copy.getCreateTime());
            if (fields.insert(copy) != 1) throw WorkflowException.invalidState("字段权限版本复制失败");
        }
    }

    private WfProcessDefinition requireDefinition(String definitionId) {
        WfProcessDefinition definition = definitions.selectById(definitionId);
        if (definition == null) throw WorkflowException.processNotFound(definitionId);
        if (UserContext.getTenantId() == null || !Objects.equals(UserContext.getTenantId(), definition.getTenantId())) {
            throw WorkflowException.permissionDenied("无权访问其他租户的流程配置");
        }
        return definition;
    }

    private LambdaQueryWrapper<WfFormFieldPermission> query(WfProcessDefinition definition) {
        return new LambdaQueryWrapper<WfFormFieldPermission>().eq(WfFormFieldPermission::getTenantId, definition.getTenantId())
                .eq(WfFormFieldPermission::getDefinitionId, definition.getDefinitionId());
    }

    private void collectFields(JsonNode nodes, String prefix, Set<String> identifiers) {
        if (!nodes.isArray()) return;
        for (JsonNode node : nodes) {
            String identifier = node.path("id").asText();
            if (!StringUtils.hasText(identifier)) continue;
            String path = prefix + identifier;
            identifiers.add(path);
            collectFields(node.path("columns"), path + ".", identifiers);
            collectFields(node.path("children"), prefix, identifiers);
        }
    }
}
