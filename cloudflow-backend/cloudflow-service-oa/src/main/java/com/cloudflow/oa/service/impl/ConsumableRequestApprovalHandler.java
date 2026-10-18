package com.cloudflow.oa.service.impl;

import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.dto.OaApprovalRequest;
import com.cloudflow.oa.service.OaApprovalParticipant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ConsumableRequestApprovalHandler implements OaApprovalParticipant {
    private final ConsumableRequestAccess access;
    private final ConsumableApprovalService approvals;

    @Override
    public String getSupportedBusinessType() { return ConsumableOperationSupport.BUSINESS_TYPE; }
    @Override
    public String currentInstance(Long id) { return access.get(id).getInstanceId(); }
    @Override
    public void bindInstance(OaApprovalRequest request, String instanceId) { approvals.bind(request, instanceId); }
    @Override
    public void handleApproved(ApprovalResultDTO result) { approvals.decision(result, true); }
    @Override
    public void handleRejected(ApprovalResultDTO result) { approvals.decision(result, false); }
}
