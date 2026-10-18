package com.cloudflow.oa.service.impl;

import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.dto.OaApprovalRequest;
import com.cloudflow.oa.service.OaApprovalParticipant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class OaMeetingApprovalHandler implements OaApprovalParticipant {
    private final OaMeetingWorkflowService workflow;

    @Override
    public String getSupportedBusinessType() { return OaMeetingBookingService.BUSINESS_TYPE; }
    @Override
    public String currentInstance(Long id) { return workflow.currentInstance(id); }
    @Override
    public void bindInstance(OaApprovalRequest request, String instanceId) { workflow.bind(request, instanceId); }
    @Override
    public void handleApproved(ApprovalResultDTO result) { workflow.decision(result, true); }
    @Override
    public void handleRejected(ApprovalResultDTO result) { workflow.decision(result, false); }
}
