package com.cloudflow.oa.service.impl;

import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.service.IOaLicenseRenewalService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 证照续期审批结果处理器。
 */
@Service
@RequiredArgsConstructor
public class LicenseRenewalApprovalHandler implements ApprovalResultHandler {

    private final IOaLicenseRenewalService oaLicenseRenewalService;

    @Override
    public String getSupportedBusinessType() {
        return OaBusinessTypes.LICENSE_RENEWAL;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        oaLicenseRenewalService.approveRenewal(dto.getBusinessId(), dto.getProcessInstanceId());
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        oaLicenseRenewalService.rejectRenewal(dto.getBusinessId(), dto.getProcessInstanceId());
    }
}
