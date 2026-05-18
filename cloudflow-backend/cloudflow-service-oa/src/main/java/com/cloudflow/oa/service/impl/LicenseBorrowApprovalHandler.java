package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.OaLicense;
import com.cloudflow.oa.domain.OaLicenseBorrow;
import com.cloudflow.oa.mapper.OaLicenseBorrowMapper;
import com.cloudflow.oa.mapper.OaLicenseMapper;
import com.cloudflow.oa.service.ISysNoticeService;
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
    private final OaLicenseMapper licenseMapper;
    private final ISysNoticeService noticeService;

    @Override
    public String getSupportedBusinessType() {
        return OaBusinessTypes.LICENSE_BORROW;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        updateStatus(dto, OaBorrowConstants.STATUS_APPROVED);
        notifyKeeper(dto);
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
                .set(OaLicenseBorrow::getUpdateBy, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set(OaLicenseBorrow::getUpdateTime, LocalDateTime.now());

        int updated = licenseBorrowMapper.update(null, wrapper);
        if (updated <= 0) {
            throw new IllegalStateException("未找到证照借用记录，businessId=" + dto.getBusinessId());
        }
        log.info("证照借用审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
    }

    private void notifyKeeper(ApprovalResultDTO dto) {
        OaLicenseBorrow borrow = licenseBorrowMapper.selectById(dto.getBusinessId());
        if (borrow == null) {
            return;
        }
        OaLicense license = licenseMapper.selectById(borrow.getLicenseId());
        if (license == null || license.getKeeperId() == null) {
            return;
        }
        String content = "证照借用申请已审批通过，请处理借出：" + borrow.getBorrowNo() + " / " + borrow.getLicenseName();
        noticeService.sendNotice(license.getKeeperId(), "证照待借出处理", content, "2",
                null, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
    }
}
