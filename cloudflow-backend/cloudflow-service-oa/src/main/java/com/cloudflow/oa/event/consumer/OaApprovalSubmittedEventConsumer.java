package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.oa.domain.dto.OaApprovalRequest;
import com.cloudflow.oa.service.OaApprovalParticipant;
import com.cloudflow.oa.service.impl.OaRecordSupport;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Component
@RequiredArgsConstructor
public class OaApprovalSubmittedEventConsumer implements BusinessEventConsumer {
    private final ObjectMapper json;
    private final RemoteWorkflowService workflow;
    private final List<OaApprovalParticipant> participants;

    @Override
    public String eventType() { return "OA_F_APPROVAL_SUBMITTED"; }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        OaApprovalRequest request = json.readValue(envelope.getPayload(), OaApprovalRequest.class);
        OaRecordSupport.same(OaRecordSupport.tenantId(), request.getTenantId(), "审批租户不一致");
        OaApprovalParticipant participant = participants.stream().filter(item -> item.getSupportedBusinessType().equals(request.getBusinessType()))
                .findFirst().orElseThrow(() -> new IllegalStateException("审批类型未注册"));
        if (!Objects.equals(request.getReservation(), participant.currentInstance(request.getBusinessId()))) return;
        InternalWorkflowStartDTO start = new InternalWorkflowStartDTO();
        start.setTenantId(request.getTenantId()); start.setProcessDefKey(request.getProcessKey());
        String businessKey = request.getBusinessType() + ":" + request.getBusinessId() + ":" + request.getReservation();
        if (businessKey.length() > 64) {
            byte[] identity = MessageDigest.getInstance("SHA-256")
                    .digest((request.getTenantId() + ":" + businessKey).getBytes(StandardCharsets.UTF_8));
            businessKey = "F:" + Base64.getUrlEncoder().withoutPadding().encodeToString(identity);
        }
        start.setBusinessKey(businessKey);
        start.setStartUserId(request.getStartUserId()); start.setStartUserName(request.getStartUserName()); start.setVariables(request.getVariables());
        R<?> response = workflow.startProcessInternal(start);
        if (response == null || !response.isSuccess() || response.getData() == null) throw new IllegalStateException("工作流启动失败，等待重试");
        Object data = response.getData();
        Object instance = data instanceof Map<?, ?> values ? (values.get("processInstanceId") != null ? values.get("processInstanceId") : values.get("instanceId")) : data;
        String instanceId = OaRecordSupport.text(instance == null ? null : instance.toString(), 64, "审批实例");
        participant.bindInstance(request, instanceId);
    }
}
