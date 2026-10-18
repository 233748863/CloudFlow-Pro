package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.domain.dto.BusinessProcessInvalidateDTO;
import com.cloudflow.oa.service.impl.OaMeetingBookingService;
import com.cloudflow.oa.service.impl.OaRecordSupport;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class OaMeetingApprovalWithdrawnConsumer implements BusinessEventConsumer {
    private final ObjectMapper json;
    private final RemoteWorkflowService workflow;

    @Override
    public String eventType() { return "OA_MEETING_APPROVAL_WITHDRAWN"; }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        BusinessProcessInvalidateDTO request = json.readValue(envelope.getPayload(), BusinessProcessInvalidateDTO.class);
        OaRecordSupport.same("cloudflow-oa", envelope.getSourceModule(), "会议撤回事件来源无效");
        OaRecordSupport.same(OaRecordSupport.tenantId(), envelope.getTenantId(), "会议撤回事件租户不一致");
        OaRecordSupport.same(envelope.getTenantId(), request.getTenantId(), "会议撤回负载租户不一致");
        OaRecordSupport.same(envelope.getSourceId(), request.getBusinessId(), "会议撤回业务标识不一致");
        OaRecordSupport.same(OaMeetingBookingService.BUSINESS_TYPE, request.getBusinessType(), "会议撤回业务类型不一致");
        R<?> response = workflow.invalidateByBusiness(request);
        if (response == null || !response.isSuccess()) throw new IllegalStateException("会议旧审批作废失败，等待重试");
    }
}
