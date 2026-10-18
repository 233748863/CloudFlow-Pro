package com.cloudflow.workflow.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.vo.DraftLaunchContextVO;
import com.cloudflow.workflow.domain.vo.FieldPermissionVO;
import com.cloudflow.workflow.domain.vo.StartAssigneeNodeVO;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfFormDraftMapper;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class WorkflowLaunchContextService {
    private final WfFormDraftMapper draftMapper;
    private final WorkflowPermissionService permissions;
    private final WorkflowDefinitionConfigService configurations;
    private final WorkflowDraftJson json;

    @Transactional(noRollbackFor = WorkflowException.class)
    public DraftLaunchContextVO context(String definitionId) {
        Long tenantId = requireTenant();
        Long userId = requireUser();
        WfProcessDefinition pointer = draftMapper.findDefinition(tenantId, definitionId);
        if (pointer == null) throw unavailable();
        if (java.util.Set.of("overtime_request", "hr_shift_request", "oa_consumable_request", "oa_meeting_booking").contains(pointer.getProcessKey())) {
            throw new WorkflowException("DRAFT_UNAVAILABLE", "请从对应业务申请页面填写单据");
        }
        List<WfProcessDefinition> definitions = draftMapper.lockDefinitions(tenantId, pointer.getProcessKey());
        WfProcessDefinition definition = definitions.stream().filter(row -> definitionId.equals(row.getDefinitionId())
                && !Integer.valueOf(1).equals(row.getDeleted())).findFirst().orElseThrow(this::unavailable);
        if (!"PUBLISHED".equals(definition.getStatus()) || Integer.valueOf(1).equals(definition.getIsArchived())
                || !permissions.canStartProcess(userId, definition.getStartPermissionType(), definition.getStartPermissionValue())) {
            throw unavailable();
        }
        WfProcessDefinition latest = definitions.stream().filter(row -> "PUBLISHED".equals(row.getStatus())
                && !Integer.valueOf(1).equals(row.getDeleted()) && !Integer.valueOf(1).equals(row.getIsArchived()))
                .max(Comparator.comparing(row -> row.getVersion() == null ? 0 : row.getVersion())).orElseThrow(this::unavailable);
        if (!definitionId.equals(latest.getDefinitionId())) throw new WorkflowException("DRAFT_STALE", "流程已发布新版本，请重新填写申请");
        WfFormDefinition form = null;
        Map<String, Object> formDefinition = null;
        if (StringUtils.hasText(definition.getFormId())) {
            form = draftMapper.lockForm(tenantId, definition.getFormId());
            if (form == null || "ARCHIVED".equals(form.getStatus())) throw unavailable();
            JsonNode root = json.tree(form.getFieldsJson());
            JsonNode fields = root != null && root.isArray() ? root : root == null ? null : root.get("fields");
            if (fields == null || !fields.isArray()) throw new WorkflowException("FORM_INVALID_DEFINITION", "表单字段配置必须是数组");
            formDefinition = new LinkedHashMap<>();
            formDefinition.put("id", form.getFormId());
            formDefinition.put("name", form.getFormName());
            formDefinition.put("version", form.getVersion());
            formDefinition.put("versionLock", form.getVersionLock());
            formDefinition.put("fields", fields);
        }
        List<FieldPermissionVO> fieldPermissions = draftMapper.lockStartPermissions(tenantId, definitionId).stream()
                .map(field -> new FieldPermissionVO(field.getNodeKey(), field.getFieldId(), field.getVisibleFlag(),
                        field.getEditableFlag(), field.getRequiredFlag())).toList();
        List<StartAssigneeNodeVO> assignees = configurations.startAssigneeNodes(definition).stream()
                .map(node -> new StartAssigneeNodeVO(node.nodeKey(), node.nodeName(), node.selectableScope(), node.multiple(),
                        node.candidates().stream().sorted(Comparator.comparing(StartAssigneeNodeVO.Candidate::userId)).toList())).toList();
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("definitionId", definitionId);
        snapshot.put("processKey", definition.getProcessKey());
        snapshot.put("version", definition.getVersion());
        snapshot.put("lockVersion", definition.getVersionLock());
        snapshot.put("permissionType", definition.getStartPermissionType());
        snapshot.put("permissionValue", definition.getStartPermissionValue());
        snapshot.put("model", StringUtils.hasText(definition.getModelJson()) ? json.tree(definition.getModelJson()) : null);
        snapshot.put("form", formDefinition);
        snapshot.put("formVersion", form == null ? null : form.getVersion());
        snapshot.put("formLockVersion", form == null ? null : form.getVersionLock());
        snapshot.put("formSchema", form == null ? null : form.getFormSchema());
        snapshot.put("fieldPermissions", fieldPermissions);
        snapshot.put("assigneeNodes", assignees);
        return new DraftLaunchContextVO(definitionId, definition.getProcessKey(), definition.getProcessName(),
                definition.getFormId(), formDefinition, fieldPermissions, assignees, json.hash(snapshot));
    }

    public void checkAssignees(DraftLaunchContextVO context, Map<String, List<Long>> selected, boolean complete) {
        Map<String, List<Long>> values = selected == null ? Map.of() : selected;
        if (!context.assigneeNodes().stream().map(StartAssigneeNodeVO::nodeKey).toList().containsAll(values.keySet())) {
            throw WorkflowException.validationError("审批人选择包含不允许的节点");
        }
        for (StartAssigneeNodeVO node : context.assigneeNodes()) {
            List<Long> candidates = values.get(node.nodeKey());
            if (candidates == null || candidates.isEmpty()) {
                if (complete) throw WorkflowException.validationError("请完成审批人选择");
                continue;
            }
            if ((!node.multiple() && candidates.size() != 1) || candidates.stream().anyMatch(Objects::isNull)
                    || candidates.stream().distinct().count() != candidates.size()) {
                throw WorkflowException.validationError("审批人数量或内容无效");
            }
            List<String> allowed = node.candidates().stream().map(StartAssigneeNodeVO.Candidate::userId).toList();
            if (candidates.stream().anyMatch(userId -> !allowed.contains(String.valueOf(userId)))) {
                throw WorkflowException.validationError("审批人已失效或不在当前候选范围");
            }
        }
    }

    public static Long requireTenant() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) throw WorkflowException.permissionDenied("缺少租户身份");
        return tenantId;
    }

    public static Long requireUser() {
        Long userId = UserContext.getUserId();
        if (userId == null) throw WorkflowException.permissionDenied("请先登录");
        return userId;
    }

    private WorkflowException unavailable() {
        return new WorkflowException("DRAFT_UNAVAILABLE", "流程已不可用或当前用户无权发起");
    }
}
