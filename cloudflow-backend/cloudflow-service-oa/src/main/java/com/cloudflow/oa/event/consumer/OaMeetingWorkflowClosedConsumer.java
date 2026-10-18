package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.domain.dto.OaMeetingWorkflowClosed;
import com.cloudflow.oa.service.impl.OaMeetingWorkflowService;
import com.cloudflow.oa.service.impl.OaRecordSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class OaMeetingWorkflowClosedConsumer implements BusinessEventConsumer {
    private final ObjectMapper json;
    private final OaMeetingWorkflowService workflow;

    @Override
    public String eventType() { return "OA_MEETING_WORKFLOW_CLOSED"; }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        OaMeetingWorkflowClosed result = json.readValue(envelope.getPayload(), OaMeetingWorkflowClosed.class);
        OaRecordSupport.same("cloudflow-workflow", envelope.getSourceModule(), "会议审批关闭事件来源无效");
        OaRecordSupport.same(envelope.getTenantId(), result.tenantId(), "会议审批关闭租户不一致");
        OaRecordSupport.same(envelope.getSourceId(), result.businessId(), "会议审批关闭业务标识不一致");
        workflow.closed(result);
    }
}
