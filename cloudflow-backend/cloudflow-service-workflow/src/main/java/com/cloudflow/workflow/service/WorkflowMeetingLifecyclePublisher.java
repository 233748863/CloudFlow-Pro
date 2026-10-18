package com.cloudflow.workflow.service;

import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.workflow.callback.util.WorkflowCallbackMetadata;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@RequiredArgsConstructor
public class WorkflowMeetingLifecyclePublisher {
    private final OutboxPublisher publisher;
    private final ObjectMapper json;

    public void terminal(WfProcessInstance instance, WfProcessStatus target) {
        if (!Set.of(WfProcessStatus.CANCELLED, WfProcessStatus.INVALIDATED, WfProcessStatus.TERMINATED).contains(target)) return;
        if (instance.getVariables() == null || instance.getVariables().isBlank()) return;
        try {
            JsonNode variables = json.readTree(instance.getVariables());
            if (!"OA_MEETING_BOOKING".equals(variables.path("businessType").asText())) return;
            if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("会议审批关闭必须与流程状态同事务保存");
            String rawId = variables.path("businessId").asText();
            if (!rawId.matches("[1-9][0-9]{0,18}")) throw new IllegalStateException("会议审批业务标识无效");
            Long businessId = Long.valueOf(rawId);
            Map<String, Object> token = WorkflowCallbackMetadata.variables("OA_MEETING_BOOKING", Map.of("oaRequestToken", variables.path("oaRequestToken").asText()));
            Map<String, Object> payload = new LinkedHashMap<>(token);
            payload.put("tenantId", instance.getTenantId()); payload.put("businessType", "OA_MEETING_BOOKING");
            payload.put("businessId", businessId); payload.put("processInstanceId", instance.getInstanceId()); payload.put("status", target.getCode());
            publisher.publish(BusinessEventEnvelope.builder().eventType("OA_MEETING_WORKFLOW_CLOSED").sourceModule("cloudflow-workflow")
                    .tenantId(instance.getTenantId()).sourceId(businessId).payload(json.writeValueAsString(payload)).build());
        } catch (Exception failure) { throw new IllegalStateException("会议审批关闭事件持久化失败", failure); }
    }
}
