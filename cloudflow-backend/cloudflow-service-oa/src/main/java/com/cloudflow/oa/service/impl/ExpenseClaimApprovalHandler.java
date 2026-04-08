package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.oa.config.WorkflowCallbackStreamConstants;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.domain.dto.ApprovalResultDTO;
import com.cloudflow.oa.mapper.BizExpenseClaimMapper;
import com.cloudflow.oa.service.ApprovalResultHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 报销申请审批结果处理器。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ExpenseClaimApprovalHandler implements ApprovalResultHandler {

    private final BizExpenseClaimMapper expenseClaimMapper;

    @Override
    public String getSupportedBusinessType() {
        return WorkflowCallbackStreamConstants.BUSINESS_TYPE_EXPENSE_CLAIM;
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
        LambdaUpdateWrapper<BizExpenseClaim> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(BizExpenseClaim::getId, dto.getBusinessId())
                .set(BizExpenseClaim::getInstanceId, dto.getProcessInstanceId())
                .set(BizExpenseClaim::getStatus, status)
                .set(BizExpenseClaim::getUpdateBy, WorkflowCallbackStreamConstants.WORKFLOW_UPDATE_BY)
                .set(BizExpenseClaim::getUpdateTime, LocalDateTime.now());

        int updated = expenseClaimMapper.update(null, wrapper);
        if (updated <= 0) {
            throw new IllegalStateException("未找到报销申请记录，businessId=" + dto.getBusinessId());
        }
        log.info("报销申请审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
    }
}
