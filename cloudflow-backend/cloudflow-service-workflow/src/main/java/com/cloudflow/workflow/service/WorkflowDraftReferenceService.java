package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.workflow.domain.vo.DraftLaunchContextVO;
import com.cloudflow.workflow.domain.vo.WorkflowFormReferenceVO;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WorkflowFormReferenceMapper;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class WorkflowDraftReferenceService {
    private final WorkflowLaunchContextService contexts;
    private final WorkflowFormReferenceMapper references;
    private final WorkflowDraftJson json;
    private final JsonSchemaValidator validator;

    @Transactional(rollbackFor = Exception.class)
    public PageResult<WorkflowFormReferenceVO> options(String definitionId, String fieldId, PageQuery query) {
        DraftLaunchContextVO context = contexts.context(definitionId);
        if (context.formDefinition() == null || fieldId == null || !fieldId.matches("[A-Za-z_][A-Za-z0-9_]{0,99}(\\.[A-Za-z_][A-Za-z0-9_]{0,99})?")) {
            throw unavailable();
        }
        String schema = json.canonical(context.formDefinition().get("fields"));
        validator.validateFormSchema(schema);
        Selection selection = find(validator.parseFields(schema), fieldId, "", List.of());
        if (selection == null || !(JsonSchemaValidator.REFERENCE_TYPES.contains(selection.field().path("type").asText())
                || "DICT_SELECT".equals(selection.field().path("type").asText()))
                || context.fieldPermissions().stream().anyMatch(permission -> selection.path().contains(permission.fieldId())
                        && Boolean.FALSE.equals(permission.visibleFlag()))) {
            throw unavailable();
        }
        JsonNode selected = selection.field();
        Long scopeDeptId = selected.path("scopeDeptId").asText().isBlank() ? null : Long.valueOf(selected.path("scopeDeptId").asText());
        Page<WorkflowFormReferenceVO> page = query.<WorkflowFormReferenceVO>build();
        page.setCurrent(Math.max(1, page.getCurrent()));
        return PageResult.build(references.pageReferences(page, WorkflowLaunchContextService.requireTenant(),
                selected.path("type").asText(), selected.path("onlyActive").asBoolean(true), scopeDeptId, selected.path("dictType").asText()));
    }

    private Selection find(JsonNode fields, String fieldId, String prefix, List<String> parents) {
        for (JsonNode field : fields) {
            String path = prefix + field.path("id").asText();
            List<String> ancestors = new ArrayList<>(parents);
            ancestors.add(path);
            if (fieldId.equals(path)) return new Selection(field, ancestors);
            Selection child = null;
            if (JsonSchemaValidator.LAYOUT_TYPES.contains(field.path("type").asText())) child = find(field.path("children"), fieldId, prefix, ancestors);
            if ("SUB_TABLE".equals(field.path("type").asText())) child = find(field.path("columns"), fieldId, path + ".", ancestors);
            if (child != null) return child;
        }
        return null;
    }

    private record Selection(JsonNode field, List<String> path) { }

    private WorkflowException unavailable() {
        return new WorkflowException("DRAFT_REFERENCE_UNAVAILABLE", "当前字段不可读取选项");
    }
}
