package com.cloudflow.oa.service.impl;

import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.service.IOaSealRenewalService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 印章续期审批结果处理器。
 */
@Service
@RequiredArgsConstructor
public class SealRenewalApprovalHandler implements ApprovalResultHandler {

    private final IOaSealRenewalService oaSealRenewalService;

    @Override
    public String getSupportedBusinessType() {
        return OaBusinessTypes.SEAL_RENEWAL;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        oaSealRenewalService.approveRenewal(dto.getBusinessId(), dto.getProcessInstanceId());
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        oaSealRenewalService.rejectRenewal(dto.getBusinessId(), dto.getProcessInstanceId());
    }
}
