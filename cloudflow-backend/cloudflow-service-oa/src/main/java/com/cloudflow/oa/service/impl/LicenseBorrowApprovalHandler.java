package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.oa.config.WorkflowCallbackStreamConstants;
import com.cloudflow.oa.domain.OaLicenseBorrow;
import com.cloudflow.oa.domain.dto.ApprovalResultDTO;
import com.cloudflow.oa.mapper.OaLicenseBorrowMapper;
import com.cloudflow.oa.service.ApprovalResultHandler;
import com.cloudflow.oa.util.OaBorrowConstants;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 证照借用审批结果处理器。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LicenseBorrowApprovalHandler implements ApprovalResultHandler {

    private final OaLicenseBorrowMapper licenseBorrowMapper;

    @Override
    public String getSupportedBusinessType() {
        return WorkflowCallbackStreamConstants.BUSINESS_TYPE_LICENSE_BORROW;
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
        LambdaUpdateWrapper<OaLicenseBorrow> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(OaLicenseBorrow::getId, dto.getBusinessId())
                .set(OaLicenseBorrow::getInstanceId, dto.getProcessInstanceId())
                .set(OaLicenseBorrow::getStatus, status)
                .set(OaLicenseBorrow::getUpdateBy, WorkflowCallbackStreamConstants.WORKFLOW_UPDATE_BY)
                .set(OaLicenseBorrow::getUpdateTime, LocalDateTime.now());

        int updated = licenseBorrowMapper.update(null, wrapper);
        if (updated <= 0) {
            throw new IllegalStateException("未找到证照借用记录，businessId=" + dto.getBusinessId());
        }
        log.info("证照借用审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
    }
}
