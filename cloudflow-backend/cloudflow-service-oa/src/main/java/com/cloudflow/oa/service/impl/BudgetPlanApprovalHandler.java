package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.oa.config.WorkflowCallbackStreamConstants;
import com.cloudflow.oa.domain.OaBudgetPlan;
import com.cloudflow.oa.domain.dto.ApprovalResultDTO;
import com.cloudflow.oa.mapper.OaBudgetPlanMapper;
import com.cloudflow.oa.service.ApprovalResultHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class BudgetPlanApprovalHandler implements ApprovalResultHandler {

    private final OaBudgetPlanMapper budgetPlanMapper;

    @Override
    public String getSupportedBusinessType() {
        return WorkflowCallbackStreamConstants.BUSINESS_TYPE_BUDGET_PLAN;
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
        LambdaUpdateWrapper<OaBudgetPlan> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(OaBudgetPlan::getBudgetId, dto.getBusinessId())
                .set(OaBudgetPlan::getInstanceId, dto.getProcessInstanceId())
                .set(OaBudgetPlan::getStatus, status)
                .set(OaBudgetPlan::getUpdateBy, WorkflowCallbackStreamConstants.WORKFLOW_UPDATE_BY)
                .set(OaBudgetPlan::getUpdateTime, LocalDateTime.now());
        int updated = budgetPlanMapper.update(null, wrapper);
        if (updated <= 0) {
            throw new IllegalStateException("未找到预算主表记录，businessId=" + dto.getBusinessId());
        }
        log.info("预算主表审批结果已回写: businessId={}, status={}", dto.getBusinessId(), status);
    }
}
