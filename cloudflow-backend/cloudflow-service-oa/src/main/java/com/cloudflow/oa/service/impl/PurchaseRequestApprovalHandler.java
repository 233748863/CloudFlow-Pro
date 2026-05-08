package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.oa.config.WorkflowCallbackStreamConstants;
import com.cloudflow.oa.domain.BizPurchaseRequest;
import com.cloudflow.oa.domain.dto.ApprovalResultDTO;
import com.cloudflow.oa.mapper.BizPurchaseRequestMapper;
import com.cloudflow.oa.service.ApprovalResultHandler;
import com.cloudflow.oa.service.IPurchaseRequestService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 采购申请审批结果处理器。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PurchaseRequestApprovalHandler implements ApprovalResultHandler {

    private final BizPurchaseRequestMapper purchaseRequestMapper;
    private final IPurchaseRequestService purchaseRequestService;

    @Override
    public String getSupportedBusinessType() {
        return WorkflowCallbackStreamConstants.BUSINESS_TYPE_PURCHASE_REQUEST;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        updateStatus(dto, "APPROVED");
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        updateStatus(dto, "REJECTED");
        purchaseRequestService.releaseBudgetOnRejected(dto.getBusinessId());
    }

    private void updateStatus(ApprovalResultDTO dto, String status) {
        LambdaUpdateWrapper<BizPurchaseRequest> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(BizPurchaseRequest::getId, dto.getBusinessId())
                .set(BizPurchaseRequest::getInstanceId, dto.getProcessInstanceId())
                .set(BizPurchaseRequest::getStatus, status)
                .set(BizPurchaseRequest::getUpdateBy, WorkflowCallbackStreamConstants.WORKFLOW_UPDATE_BY)
                .set(BizPurchaseRequest::getUpdateTime, LocalDateTime.now());

        int updated = purchaseRequestMapper.update(null, wrapper);
        if (updated <= 0) {
            throw new IllegalStateException("未找到采购申请记录，businessId=" + dto.getBusinessId());
        }
        log.info("采购申请审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
    }
}
