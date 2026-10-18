package com.cloudflow.workflow.service;

import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@RequiredArgsConstructor
public class WorkflowSettlementLifecyclePublisher {
    private final OutboxPublisher publisher;
    private final ObjectMapper json;

    public void terminal(WfProcessInstance instance, WfProcessStatus target) {
        if (!Set.of(WfProcessStatus.CANCELLED, WfProcessStatus.INVALIDATED, WfProcessStatus.TERMINATED).contains(target)
                || instance.getVariables() == null || instance.getVariables().isBlank()) return;
        try {
            JsonNode variables = json.readTree(instance.getVariables());
            if (!"HR_SETTLEMENT".equals(variables.path("businessType").asText())) return;
            if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("结算审批关闭必须与流程状态同事务保存");
            Long id = Long.valueOf(variables.path("settlementId").asText());
            Integer revision = Integer.valueOf(variables.path("settlementRevision").asText());
            if (id <= 0 || revision <= 0 || !id.toString().equals(variables.path("businessId").asText())
                    || !("HR_SETTLEMENT:" + id + ":R" + revision).equals(instance.getBusinessKey())) throw new IllegalStateException("结算审批轮次标识无效");
            Map<String, Object> payload = Map.of("tenantId", instance.getTenantId(), "settlementId", id,
                    "revision", revision, "processInstanceId", instance.getInstanceId(), "status", target.getCode());
            publisher.publish(BusinessEventEnvelope.builder().eventType("HR_SETTLEMENT_WORKFLOW_CLOSED").sourceModule("cloudflow-workflow")
                    .tenantId(instance.getTenantId()).sourceId(id).payload(json.writeValueAsString(payload)).build());
        } catch (Exception failure) { throw new IllegalStateException("结算审批关闭事件持久化失败", failure); }
    }
}
