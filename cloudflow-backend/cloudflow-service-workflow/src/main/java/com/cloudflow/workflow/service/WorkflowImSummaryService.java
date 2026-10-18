package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfFormDefinitionMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class WorkflowImSummaryService {
    private final WfTaskMapper tasks;
    private final WfFormDefinitionMapper definitions;
    private final WorkflowFormAccessService access;
    private final JsonSchemaValidator validator;
    private final WorkflowImSummaryPolicy policy;

    public List<WorkflowImSummaryPolicy.Field> forTask(String taskId) {
        WfTask task = tasks.selectById(taskId);
        if (task == null || !Objects.equals(WorkflowLaunchContextService.requireTenant(), task.getTenantId())) {
            throw WorkflowException.permissionDenied("无权读取该任务摘要");
        }
        WorkflowFormAccessService.ReadContext context = access.instance(task.getInstanceId(), taskId);
        if (context.form() == null || context.versionUnknown() || !"TODO".equals(task.getStatus())) return List.of();
        WfFormDefinition latest = definitions.selectLatest(task.getTenantId(), context.form().getFormId());
        if (latest == null || !Objects.equals(task.getTenantId(), latest.getTenantId())) return List.of();
        String schema = StringUtils.hasText(latest.getFieldsJson()) ? latest.getFieldsJson() : latest.getFormSchema();
        validator.validateFormSchema(schema);
        return policy.extract(access.projection(context, context.rawValues()), validator.parseFields(schema));
    }
}
