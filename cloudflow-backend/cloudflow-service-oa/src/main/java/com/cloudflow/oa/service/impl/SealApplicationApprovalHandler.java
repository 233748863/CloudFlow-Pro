package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.oa.config.WorkflowCallbackStreamConstants;
import com.cloudflow.oa.domain.OaSealApplication;
import com.cloudflow.oa.domain.dto.ApprovalResultDTO;
import com.cloudflow.oa.mapper.OaSealApplicationMapper;
import com.cloudflow.oa.service.ApprovalResultHandler;
import com.cloudflow.oa.util.OaBorrowConstants;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 用印申请审批结果处理器。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SealApplicationApprovalHandler implements ApprovalResultHandler {

    private final OaSealApplicationMapper sealApplicationMapper;

    @Override
    public String getSupportedBusinessType() {
        return WorkflowCallbackStreamConstants.BUSINESS_TYPE_SEAL_APPLICATION;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        updateStatus(dto, OaBorrowConstants.STATUS_APPROVED);
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        updateStatus(dto, OaBorrowConstants.STATUS_REJECTED);
    }

    private void updateStatus(ApprovalResultDTO dto, String status) {
        LambdaUpdateWrapper<OaSealApplication> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(OaSealApplication::getId, dto.getBusinessId())
                .set(OaSealApplication::getInstanceId, dto.getProcessInstanceId())
                .set(OaSealApplication::getStatus, status)
                .set(OaSealApplication::getUpdateBy, WorkflowCallbackStreamConstants.WORKFLOW_UPDATE_BY)
                .set(OaSealApplication::getUpdateTime, LocalDateTime.now());

        int updated = sealApplicationMapper.update(null, wrapper);
        if (updated <= 0) {
            throw new IllegalStateException("未找到用印申请记录，businessId=" + dto.getBusinessId());
        }
        log.info("用印申请审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
    }
}
