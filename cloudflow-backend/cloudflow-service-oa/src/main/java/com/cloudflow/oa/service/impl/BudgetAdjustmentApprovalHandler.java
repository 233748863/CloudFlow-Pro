package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.OaBudgetAdjustment;
import com.cloudflow.oa.domain.OaBudgetLine;
import com.cloudflow.oa.mapper.OaBudgetAdjustmentMapper;
import com.cloudflow.oa.mapper.OaBudgetLineMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class BudgetAdjustmentApprovalHandler implements ApprovalResultHandler {

    private final OaBudgetAdjustmentMapper budgetAdjustmentMapper;
    private final OaBudgetLineMapper budgetLineMapper;

    @Override
    public String getSupportedBusinessType() {
        return OaBusinessTypes.BUDGET_ADJUSTMENT;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        updateStatus(dto, "APPROVED");
        applyAdjustment(dto.getBusinessId());
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        updateStatus(dto, "REJECTED");
    }

    private void updateStatus(ApprovalResultDTO dto, String status) {
        LambdaUpdateWrapper<OaBudgetAdjustment> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(OaBudgetAdjustment::getAdjustmentId, dto.getBusinessId())
                .set(OaBudgetAdjustment::getInstanceId, dto.getProcessInstanceId())
                .set(OaBudgetAdjustment::getStatus, status)
                .set(OaBudgetAdjustment::getUpdateBy, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set(OaBudgetAdjustment::getUpdateTime, LocalDateTime.now());
        int updated = budgetAdjustmentMapper.update(null, wrapper);
        if (updated <= 0) {
            throw new IllegalStateException("未找到预算调整记录，businessId=" + dto.getBusinessId());
        }
        log.info("预算调整审批结果已回写: businessId={}, status={}", dto.getBusinessId(), status);
    }

    private void applyAdjustment(Long adjustmentId) {
        OaBudgetAdjustment adjustment = budgetAdjustmentMapper.selectById(adjustmentId);
        if (adjustment == null || adjustment.getBudgetId() == null || adjustment.getChangeAmount() == null) {
            return;
        }
        OaBudgetLine line = budgetLineMapper.selectOne(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<OaBudgetLine>()
                .eq(OaBudgetLine::getBudgetId, adjustment.getBudgetId())
                .eq(OaBudgetLine::getSubjectCode, adjustment.getSubjectCode())
                .last("limit 1"));
        if (line == null) {
            return;
        }
        BigDecimal nextAmount = (line.getAmount() == null ? BigDecimal.ZERO : line.getAmount()).add(adjustment.getChangeAmount());
        BigDecimal nextAvailable = nextAmount
                .subtract(line.getReservedAmount() == null ? BigDecimal.ZERO : line.getReservedAmount())
                .subtract(line.getActualAmount() == null ? BigDecimal.ZERO : line.getActualAmount());
        LambdaUpdateWrapper<OaBudgetLine> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(OaBudgetLine::getLineId, line.getLineId())
                .set(OaBudgetLine::getAmount, nextAmount)
                .set(OaBudgetLine::getAvailableAmount, nextAvailable);
        budgetLineMapper.update(null, wrapper);
    }
}
