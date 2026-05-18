package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.OaSeal;
import com.cloudflow.oa.domain.OaSealApplication;
import com.cloudflow.oa.mapper.OaSealApplicationMapper;
import com.cloudflow.oa.mapper.OaSealMapper;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.cloudflow.oa.service.ISysNoticeService;
import com.cloudflow.oa.util.OaBorrowConstants;
import com.cloudflow.oa.util.OaContractConstants;
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
    private final IOaTraceEventService traceEventService;
    private final ISysNoticeService noticeService;

    @Override
    public String getSupportedBusinessType() {
        return OaBusinessTypes.SEAL_APPLICATION;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        updateStatus(dto, OaBorrowConstants.STATUS_APPROVED);
        traceApproval(dto, "SEAL_APPROVAL_APPROVED", "用印审批通过");
        notifyKeeper(dto);
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        updateStatus(dto, OaBorrowConstants.STATUS_REJECTED);
        traceApproval(dto, "SEAL_APPROVAL_REJECTED", "用印审批驳回");
    }

    private void updateStatus(ApprovalResultDTO dto, String status) {
        LambdaUpdateWrapper<OaSealApplication> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(OaSealApplication::getId, dto.getBusinessId())
                .set(OaSealApplication::getInstanceId, dto.getProcessInstanceId())
                .set(OaSealApplication::getStatus, status)
                .set(OaSealApplication::getUpdateBy, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set(OaSealApplication::getUpdateTime, LocalDateTime.now());

        int updated = sealApplicationMapper.update(null, wrapper);
        if (updated <= 0) {
            throw new IllegalStateException("未找到用印申请记录，businessId=" + dto.getBusinessId());
        }
        log.info("用印申请审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
    }

    private void traceApproval(ApprovalResultDTO dto, String eventType, String title) {
        OaSealApplication application = sealApplicationMapper.selectById(dto.getBusinessId());
        if (application == null || application.getContractId() == null) {
            return;
        }
        traceEventService.record(application.getTenantId(), OaContractConstants.BUSINESS_TYPE_CONTRACT,
                application.getContractId(), OaContractConstants.BUSINESS_TYPE_SEAL, application.getId(),
                eventType, title, application.getApplicationNo(), dto.getApproverId(), dto.getApproverName(), null);
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
                null, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
    }
}
