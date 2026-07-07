package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.common.workflow.callback.util.WorkflowCallbackInstanceGuard;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.OaBudgetAdjustment;
import com.cloudflow.oa.domain.OaBudgetLedger;
import com.cloudflow.oa.domain.OaBudgetLine;
import com.cloudflow.oa.mapper.OaBudgetAdjustmentMapper;
import com.cloudflow.oa.mapper.OaBudgetLedgerMapper;
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
    private final OaBudgetLedgerMapper budgetLedgerMapper;

    @Override
    public String getSupportedBusinessType() {
        return OaBusinessTypes.BUDGET_ADJUSTMENT;
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        if (updateStatus(dto, "APPROVED")) {
            applyAdjustment(dto.getBusinessId());
        }
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        updateStatus(dto, "REJECTED");
    }

    private boolean updateStatus(ApprovalResultDTO dto, String status) {
        LambdaUpdateWrapper<OaBudgetAdjustment> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(OaBudgetAdjustment::getAdjustmentId, dto.getBusinessId())
                .eq(OaBudgetAdjustment::getInstanceId, dto.getProcessInstanceId())
                .set(OaBudgetAdjustment::getStatus, status)
                .set(OaBudgetAdjustment::getUpdateBy, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set(OaBudgetAdjustment::getUpdateTime, LocalDateTime.now());
        int updated = budgetAdjustmentMapper.update(null, wrapper);
        if (updated <= 0) {
            OaBudgetAdjustment adjustment = budgetAdjustmentMapper.selectById(dto.getBusinessId());
            if (adjustment == null) {
                throw new IllegalStateException("未找到预算调整记录，businessId=" + dto.getBusinessId());
            }
            if (WorkflowCallbackInstanceGuard.shouldSkipStaleCallback(
                    "预算调整", dto.getBusinessId(), adjustment.getInstanceId(), dto.getProcessInstanceId())) {
                return false;
            }
            throw new IllegalStateException("预算调整审批结果回写失败，businessId=" + dto.getBusinessId());
        }
        log.info("预算调整审批结果已回写: businessId={}, status={}", dto.getBusinessId(), status);
        return true;
    }

    private void applyAdjustment(Long adjustmentId) {
        OaBudgetAdjustment adjustment = budgetAdjustmentMapper.selectById(adjustmentId);
        if (adjustment == null || adjustment.getBudgetId() == null || adjustment.getChangeAmount() == null) {
            return;
        }
        if (hasAdjustmentLedger(adjustment)) {
            log.info("预算调整已应用，跳过重复回调: adjustmentId={}", adjustmentId);
            return;
        }
        OaBudgetLine line = budgetLineMapper.selectPage(new Page<>(1, 1, false), new LambdaQueryWrapper<OaBudgetLine>()
                .eq(OaBudgetLine::getBudgetId, adjustment.getBudgetId())
                .eq(OaBudgetLine::getSubjectCode, adjustment.getSubjectCode()))
                .getRecords().stream().findFirst().orElse(null);
        if (line == null) {
            return;
        }
        if (budgetLineMapper.adjustAmount(line.getLineId(), adjustment.getChangeAmount()) <= 0) {
            throw new IllegalStateException("预算调整应用失败，adjustmentId=" + adjustmentId);
        }
        OaBudgetLine latest = budgetLineMapper.selectById(line.getLineId());
        OaBudgetLedger ledger = new OaBudgetLedger();
        ledger.setTenantId(adjustment.getTenantId());
        ledger.setBudgetId(adjustment.getBudgetId());
        ledger.setLineId(line.getLineId());
        ledger.setTargetType("BUDGET");
        ledger.setTargetId(adjustment.getBudgetId());
        ledger.setBusinessType(OaBusinessTypes.BUDGET_ADJUSTMENT);
        ledger.setBusinessId(adjustment.getAdjustmentId());
        ledger.setBusinessNo(adjustment.getAdjustmentNo());
        ledger.setSubjectCode(adjustment.getSubjectCode());
        ledger.setSubjectName(adjustment.getSubjectName());
        ledger.setOperationType("ADJUST");
        ledger.setAmount(adjustment.getChangeAmount());
        ledger.setAvailableAfter(latest == null ? BigDecimal.ZERO : latest.getAvailableAmount());
        ledger.setStatus("VALID");
        ledger.setRemark(adjustment.getReason());
        ledger.setCreateBy(WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
        ledger.setCreateTime(LocalDateTime.now());
        budgetLedgerMapper.insert(ledger);
    }

    private boolean hasAdjustmentLedger(OaBudgetAdjustment adjustment) {
        Long count = budgetLedgerMapper.selectCount(new LambdaQueryWrapper<OaBudgetLedger>()
                .eq(OaBudgetLedger::getTenantId, adjustment.getTenantId())
                .eq(OaBudgetLedger::getBusinessType, OaBusinessTypes.BUDGET_ADJUSTMENT)
                .eq(OaBudgetLedger::getBusinessId, adjustment.getAdjustmentId())
                .eq(OaBudgetLedger::getOperationType, "ADJUST"));
        return count != null && count > 0;
    }
}
