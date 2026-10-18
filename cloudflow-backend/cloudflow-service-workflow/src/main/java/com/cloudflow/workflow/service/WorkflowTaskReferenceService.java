package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.vo.WorkflowFormReferenceVO;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.mapper.WorkflowFormReferenceMapper;
import com.cloudflow.workflow.service.WorkflowFormAccessService.ReadContext;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;

@Service
@RequiredArgsConstructor
public class WorkflowTaskReferenceService {
    private final WfTaskMapper tasks;
    private final WorkflowFormAccessService access;
    private final WorkflowFormReferenceMapper references;

    @Transactional(readOnly = true)
    public PageResult<WorkflowFormReferenceVO> options(String taskId, String fieldId, PageQuery query) {
        WfTask task = tasks.selectById(taskId);
        if (task == null || !Objects.equals(task.getTenantId(), WorkflowLaunchContextService.requireTenant())
                || !"TODO".equals(task.getStatus())) throw unavailable();
        access.assertTaskWrite(task);
        ReadContext context = access.instance(task.getInstanceId(), taskId);
        if (context.form() == null || fieldId == null
                || !fieldId.matches("[A-Za-z_][A-Za-z0-9_]{0,99}(\\.[A-Za-z_][A-Za-z0-9_]{0,99})?")) throw unavailable();
        // The projected definition is pinned to the instance version and already applies node/parent permissions.
        JsonNode field = find(access.projection(context, context.rawValues()).fields(), fieldId, "");
        if (field == null || field.path("readonly").asBoolean()
                || !(JsonSchemaValidator.REFERENCE_TYPES.contains(field.path("type").asText())
                || "DICT_SELECT".equals(field.path("type").asText()))) throw unavailable();
        Long department = field.path("scopeDeptId").asText().isBlank() ? null : Long.valueOf(field.path("scopeDeptId").asText());
        Page<WorkflowFormReferenceVO> page = query.<WorkflowFormReferenceVO>build();
        page.setCurrent(Math.max(1, page.getCurrent()));
        return PageResult.build(references.pageReferences(page, WorkflowLaunchContextService.requireTenant(),
                field.path("type").asText(), field.path("onlyActive").asBoolean(true), department, field.path("dictType").asText()));
    }

    private JsonNode find(JsonNode fields, String requested, String prefix) {
        for (JsonNode field : fields) {
            String current = prefix + field.path("id").asText();
            if (requested.equals(current)) return field;
            JsonNode nested = null;
            if (JsonSchemaValidator.LAYOUT_TYPES.contains(field.path("type").asText())) nested = find(field.path("children"), requested, prefix);
            if ("SUB_TABLE".equals(field.path("type").asText())) nested = find(field.path("columns"), requested, current + ".");
            if (nested != null) return nested;
        }
        return null;
    }

    private WorkflowException unavailable() {
        return new WorkflowException("TASK_REFERENCE_UNAVAILABLE", "当前任务字段不可读取选项");
    }
}
