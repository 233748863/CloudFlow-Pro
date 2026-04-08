package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.oa.config.WorkflowCallbackStreamConstants;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.domain.dto.ApprovalResultDTO;
import com.cloudflow.oa.mapper.BizPaymentRequestMapper;
import com.cloudflow.oa.service.ApprovalResultHandler;
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

    @Override
    public String getSupportedBusinessType() {
        return WorkflowCallbackStreamConstants.BUSINESS_TYPE_PAYMENT_REQUEST;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        updateStatus(dto, "APPROVED");
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        updateStatus(dto, "REJECTED");
    }

    private void updateStatus(ApprovalResultDTO dto, String status) {
        LambdaUpdateWrapper<BizPaymentRequest> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(BizPaymentRequest::getId, dto.getBusinessId())
                .set(BizPaymentRequest::getInstanceId, dto.getProcessInstanceId())
                .set(BizPaymentRequest::getStatus, status)
                .set(BizPaymentRequest::getUpdateBy, WorkflowCallbackStreamConstants.WORKFLOW_UPDATE_BY)
                .set(BizPaymentRequest::getUpdateTime, LocalDateTime.now());

        int updated = paymentRequestMapper.update(null, wrapper);
        if (updated <= 0) {
            throw new IllegalStateException("未找到付款申请记录，businessId=" + dto.getBusinessId());
        }
        log.info("付款申请审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
    }
}
