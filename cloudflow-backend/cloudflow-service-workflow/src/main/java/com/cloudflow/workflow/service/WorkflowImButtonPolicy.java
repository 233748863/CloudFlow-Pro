package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class WorkflowImButtonPolicy {
    private final WfProcessInstanceMapper instances;
    private final WorkflowNodePolicy nodes;
    private final WorkflowFormAccessService forms;

    public void require(WfTask task) {
        WfProcessInstance instance = instances.selectById(task.getInstanceId());
        WfNodeConfig node = nodes.resolveNode(instance, task.getNodeKey());
        if (instance == null || node == null || !"APPROVAL".equals(node.getType()) || !"APPROVAL".equals(task.getTaskType())
                || Boolean.TRUE.equals(node.getAllowEdit()) || node.getSignType() != null && !node.getSignType().isBlank()
                || node.getProps() != null && !node.getProps().isEmpty() || WorkflowDelegationReturnService.requiresReturn(task)) throw details();
        WorkflowFormAccessService.ReadContext context = forms.instance(task.getInstanceId(), task.getTaskId());
        if (context.form() != null) {
            if (context.versionUnknown()) throw details();
            requireReadonly(forms.projection(context, context.rawValues()).fields());
        }
    }

    private void requireReadonly(JsonNode fields) {
        if (fields == null || !fields.isArray()) throw details();
        for (JsonNode field : fields) {
            if (field.path("required").asBoolean() || !field.path("readonly").asBoolean()
                    || Set.of("SIGNATURE", "SIGN", "HANDWRITTEN_SIGNATURE", "SUB_TABLE").contains(field.path("type").asText())) throw details();
            if (field.has("children")) requireReadonly(field.path("children"));
        }
    }

    private static WorkflowException details() { return new WorkflowException("IM_TASK_DETAILS_REQUIRED", "该任务需要进入系统详情处理"); }
}
