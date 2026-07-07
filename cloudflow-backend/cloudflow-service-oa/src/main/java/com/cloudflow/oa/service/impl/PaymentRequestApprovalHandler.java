package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.common.workflow.callback.util.WorkflowCallbackInstanceGuard;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.mapper.BizPaymentRequestMapper;
import com.cloudflow.oa.service.IOaBudgetService;
import com.cloudflow.oa.service.IPurchaseRequestService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 付款申请审批结果处理器。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentRequestApprovalHandler implements ApprovalResultHandler {

    private final BizPaymentRequestMapper paymentRequestMapper;
    private final IPurchaseRequestService purchaseRequestService;
    private final IOaBudgetService oaBudgetService;

    @Override
    public String getSupportedBusinessType() {
        return OaBusinessTypes.PAYMENT_REQUEST;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        if (updateStatus(dto, "APPROVED")) {
            purchaseRequestService.updatePaymentStatus(dto.getBusinessId(), "APPROVED");
        }
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        if (updateStatus(dto, "REJECTED")) {
            purchaseRequestService.updatePaymentStatus(dto.getBusinessId(), "REJECTED");
            releaseBudget(dto.getBusinessId());
        }
    }

    private boolean updateStatus(ApprovalResultDTO dto, String status) {
        LambdaUpdateWrapper<BizPaymentRequest> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(BizPaymentRequest::getId, dto.getBusinessId())
                .eq(BizPaymentRequest::getInstanceId, dto.getProcessInstanceId())
                .set(BizPaymentRequest::getStatus, status)
                .set(BizPaymentRequest::getUpdateBy, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set(BizPaymentRequest::getUpdateTime, LocalDateTime.now());

        int updated = paymentRequestMapper.update(null, wrapper);
        if (updated <= 0) {
            BizPaymentRequest payment = paymentRequestMapper.selectById(dto.getBusinessId());
            if (payment == null) {
                throw new IllegalStateException("未找到付款申请记录，businessId=" + dto.getBusinessId());
            }
            if (WorkflowCallbackInstanceGuard.shouldSkipStaleCallback(
                    "付款申请", dto.getBusinessId(), payment.getInstanceId(), dto.getProcessInstanceId())) {
                return false;
            }
            throw new IllegalStateException("付款申请审批结果回写失败，businessId=" + dto.getBusinessId());
        }
        log.info("付款申请审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
        return true;
    }

    private void releaseBudget(Long paymentId) {
        BizPaymentRequest payment = paymentRequestMapper.selectById(paymentId);
        if (payment == null) {
            return;
        }
        oaBudgetService.releaseBudget(
                OaBusinessTypes.PAYMENT_REQUEST,
                payment.getId(),
                payment.getPaymentNo(),
                payment.getDeptId(),
                payment.getDeptName(),
                payment.getProjectId(),
                payment.getProjectName(),
                payment.getBudgetSubjectCode(),
                payment.getBudgetSubjectName(),
                payment.getAmount(),
                "付款驳回释放预算"
        );
    }
}
