package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.oa.config.WorkflowCallbackStreamConstants;
import com.cloudflow.oa.domain.OaSeal;
import com.cloudflow.oa.domain.OaSealApplication;
import com.cloudflow.oa.domain.dto.ApprovalResultDTO;
import com.cloudflow.oa.mapper.OaSealApplicationMapper;
import com.cloudflow.oa.mapper.OaSealMapper;
import com.cloudflow.oa.service.ApprovalResultHandler;
import com.cloudflow.oa.service.ISysNoticeService;
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
    private final OaSealMapper sealMapper;
    private final ISysNoticeService noticeService;

    @Override
    public String getSupportedBusinessType() {
        return WorkflowCallbackStreamConstants.BUSINESS_TYPE_SEAL_APPLICATION;
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

    private void notifyKeeper(ApprovalResultDTO dto) {
        OaSealApplication application = sealApplicationMapper.selectById(dto.getBusinessId());
        if (application == null) {
            return;
        }
        OaSeal seal = sealMapper.selectById(application.getSealId());
        if (seal == null || seal.getKeeperId() == null) {
            return;
        }
        String content = "用印申请已审批通过，请处理借出：" + application.getApplicationNo() + " / " + application.getSealName();
        noticeService.sendNotice(seal.getKeeperId(), "用印待借出处理", content, "2",
                null, WorkflowCallbackStreamConstants.WORKFLOW_UPDATE_BY);
    }
}
