package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.oa.config.WorkflowCallbackStreamConstants;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.domain.dto.ApprovalResultDTO;
import com.cloudflow.oa.mapper.BizExpenseClaimMapper;
import com.cloudflow.oa.service.ApprovalResultHandler;
import com.cloudflow.oa.service.IExpenseClaimService;
import com.cloudflow.oa.service.IOaBudgetService;
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
    private final IExpenseClaimService expenseClaimService;
    private final IOaBudgetService budgetService;

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
        releaseBudget(dto.getBusinessId());
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

    private void releaseBudget(Long claimId) {
        BizExpenseClaim claim = expenseClaimService.getClaimWithItems(claimId);
        if (claim == null) {
            return;
        }
        if (claim.getItems() == null || claim.getItems().isEmpty()) {
            budgetService.releaseBudget(
                    WorkflowCallbackStreamConstants.BUSINESS_TYPE_EXPENSE_CLAIM,
                    claim.getId(),
                    claim.getClaimNo(),
                    claim.getDeptId(),
                    claim.getDeptName(),
                    claim.getProjectId(),
                    claim.getProjectName(),
                    claim.getBudgetSubjectCode(),
                    claim.getBudgetSubjectName(),
                    claim.getTotalAmount(),
                    "报销驳回释放预算"
            );
            return;
        }
        claim.getItems().forEach(item -> budgetService.releaseBudget(
                WorkflowCallbackStreamConstants.BUSINESS_TYPE_EXPENSE_CLAIM,
                claim.getId(),
                claim.getClaimNo(),
                claim.getDeptId(),
                claim.getDeptName(),
                claim.getProjectId(),
                claim.getProjectName(),
                item.getBudgetSubjectCode() != null && !item.getBudgetSubjectCode().isBlank() ? item.getBudgetSubjectCode() : claim.getBudgetSubjectCode(),
                item.getBudgetSubjectName() != null && !item.getBudgetSubjectName().isBlank() ? item.getBudgetSubjectName() : claim.getBudgetSubjectName(),
                item.getAmount(),
                "报销明细驳回释放预算"
        ));
    }
}
