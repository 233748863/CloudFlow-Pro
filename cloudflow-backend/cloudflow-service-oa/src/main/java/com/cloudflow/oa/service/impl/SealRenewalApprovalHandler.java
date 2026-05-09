package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.config.WorkflowCallbackStreamConstants;
import com.cloudflow.oa.domain.dto.ApprovalResultDTO;
import com.cloudflow.oa.service.ApprovalResultHandler;
import com.cloudflow.oa.service.IOaSealRenewalService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 印章续期审批结果处理器。
 */
@Service
@RequiredArgsConstructor
public class SealRenewalApprovalHandler implements ApprovalResultHandler {

    private final IOaSealRenewalService renewalService;

    @Override
    public String getSupportedBusinessType() {
        return WorkflowCallbackStreamConstants.BUSINESS_TYPE_SEAL_RENEWAL;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        renewalService.approveRenewal(dto.getBusinessId(), dto.getProcessInstanceId());
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        renewalService.rejectRenewal(dto.getBusinessId(), dto.getProcessInstanceId());
    }
}
