package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.common.workflow.callback.util.WorkflowCallbackInstanceGuard;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.mapper.BizExpenseClaimMapper;
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
    private final IOaBudgetService oaBudgetService;

    @Override
    public String getSupportedBusinessType() {
        return OaBusinessTypes.EXPENSE_CLAIM;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        updateStatus(dto, "APPROVED");
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        if (updateStatus(dto, "REJECTED")) {
            releaseBudget(dto.getBusinessId());
        }
    }

    private boolean updateStatus(ApprovalResultDTO dto, String status) {
        LambdaUpdateWrapper<BizExpenseClaim> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(BizExpenseClaim::getId, dto.getBusinessId())
                .eq(BizExpenseClaim::getInstanceId, dto.getProcessInstanceId())
                .set(BizExpenseClaim::getStatus, status)
                .set(BizExpenseClaim::getUpdateBy, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set(BizExpenseClaim::getUpdateTime, LocalDateTime.now());

        int updated = expenseClaimMapper.update(null, wrapper);
        if (updated <= 0) {
            BizExpenseClaim claim = expenseClaimMapper.selectById(dto.getBusinessId());
            if (claim == null) {
                throw new IllegalStateException("未找到报销申请记录，businessId=" + dto.getBusinessId());
            }
            if (WorkflowCallbackInstanceGuard.shouldSkipStaleCallback(
                    "报销申请", dto.getBusinessId(), claim.getInstanceId(), dto.getProcessInstanceId())) {
                return false;
            }
            throw new IllegalStateException("报销申请审批结果回写失败，businessId=" + dto.getBusinessId());
        }
        log.info("报销申请审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
        return true;
    }

    private void releaseBudget(Long claimId) {
        BizExpenseClaim claim = expenseClaimService.getClaimWithItems(claimId);
        if (claim == null) {
            return;
        }
        if (claim.getItems() == null || claim.getItems().isEmpty()) {
            oaBudgetService.releaseBudget(
                    OaBusinessTypes.EXPENSE_CLAIM,
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
        claim.getItems().forEach(item -> oaBudgetService.releaseBudget(
                OaBusinessTypes.EXPENSE_CLAIM,
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
