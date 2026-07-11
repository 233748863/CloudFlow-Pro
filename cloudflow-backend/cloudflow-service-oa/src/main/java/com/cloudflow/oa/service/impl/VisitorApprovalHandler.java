package com.cloudflow.oa.service.impl;

import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.service.IVisitorService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class VisitorApprovalHandler implements ApprovalResultHandler {

    private final IVisitorService visitorService;

    @Override
    public String getSupportedBusinessType() {
        return OaBusinessTypes.VISITOR_APPROVAL;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        visitorService.handleWorkflowResult(dto.getBusinessId(), dto.getProcessInstanceId(), true);
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        visitorService.handleWorkflowResult(dto.getBusinessId(), dto.getProcessInstanceId(), false);
    }
}
