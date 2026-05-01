package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.config.WorkflowCallbackStreamConstants;
import com.cloudflow.oa.domain.dto.ApprovalResultDTO;
import com.cloudflow.oa.service.ApprovalResultHandler;
import com.cloudflow.oa.service.IOaLicenseRenewalService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 证照续期审批结果处理器。
 */
@Service
@RequiredArgsConstructor
public class LicenseRenewalApprovalHandler implements ApprovalResultHandler {

    private final IOaLicenseRenewalService renewalService;

    @Override
    public String getSupportedBusinessType() {
        return WorkflowCallbackStreamConstants.BUSINESS_TYPE_LICENSE_RENEWAL;
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
