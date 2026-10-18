package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.OaTraceEvent;
import com.cloudflow.oa.domain.dto.OaApprovalRequest;
import com.cloudflow.oa.mapper.OaTraceEventMapper;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OaApprovalOutboxService {
    private final OutboxPublisher publisher;
    private final ObjectMapper json;
    private final IOaTraceEventService trace;
    private final OaTraceEventMapper traceMapper;

    public String queue(String type, Long id, String businessNo, String processKey, Map<String, Object> values) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("提交审批必须与业务状态同事务保存");
        OaApprovalRequest request = new OaApprovalRequest();
        request.setTenantId(OaRecordSupport.tenantId()); request.setBusinessType(type); request.setBusinessId(id);
        request.setBusinessNo(businessNo); request.setProcessKey(processKey);
        request.setStartUserId(OaRecordSupport.require(UserContext.getUserId(), "提交人不能为空"));
        request.setStartUserName(OaRecordSupport.userName());
        request.setReservation("F:" + UUID.randomUUID());
        Map<String, Object> variables = new HashMap<>(values);
        variables.put("oaRequestToken", request.getReservation());
        WorkflowCallbackConstants.applyCallbackMetadata(variables, type, id, businessNo, "workflow:stream:approval-callback:oa");
        request.setVariables(variables);
        try {
            publisher.publish(BusinessEventEnvelope.builder().eventType("OA_F_APPROVAL_SUBMITTED").sourceModule("cloudflow-oa")
                    .sourceId(id).tenantId(request.getTenantId()).payload(json.writeValueAsString(request)).build());
        } catch (Exception exception) { throw new IllegalStateException("审批请求保存失败", exception); }
        return request.getReservation();
    }

    public void recordBinding(OaApprovalRequest request, String instanceId) {
        OaRecordSupport.same(OaRecordSupport.tenantId(), request.getTenantId(), "审批租户不一致");
        try {
            trace.record(request.getTenantId(), request.getBusinessType(), request.getBusinessId(), "WORKFLOW", null,
                    "APPROVAL_BOUND", "审批提交快照", instanceId, request.getStartUserId(), request.getStartUserName(), json.writeValueAsString(request));
        } catch (Exception exception) { throw new IllegalStateException("审批快照保存失败", exception); }
    }

    public OaApprovalRequest snapshot(ApprovalResultDTO result) {
        List<OaTraceEvent> rows = traceMapper.selectList(new LambdaQueryWrapper<OaTraceEvent>().eq(OaTraceEvent::getTenantId, OaRecordSupport.tenantId())
                .eq(OaTraceEvent::getBusinessType, result.getBusinessType()).eq(OaTraceEvent::getBusinessId, result.getBusinessId())
                .eq(OaTraceEvent::getEventType, "APPROVAL_BOUND").eq(OaTraceEvent::getEventContent, result.getProcessInstanceId()));
        if (rows.size() != 1) throw new IllegalStateException("审批提交快照尚未就绪或存在冲突");
        try { return json.readValue(rows.get(0).getSnapshotJson(), OaApprovalRequest.class); }
        catch (Exception exception) { throw new IllegalStateException("审批提交快照无效", exception); }
    }

    public static boolean matches(String current, ApprovalResultDTO result) {
        OaRecordSupport.same(OaRecordSupport.tenantId(), result.getTenantId(), "审批租户不一致");
        OaRecordSupport.text(result.getProcessInstanceId(), 64, "审批实例");
        if (current != null && current.startsWith("F:") && result.getVariables() != null
                && Objects.equals(current, result.getVariables().get("oaRequestToken"))) throw new IllegalStateException("审批实例正在绑定，请重试回调");
        return Objects.equals(current, result.getProcessInstanceId());
    }
}
