package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.common.workflow.callback.util.WorkflowCallbackInstanceGuard;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class QuoteApprovalHandler implements ApprovalResultHandler {

    private final CrmQuoteMapper quoteMapper;

    @Override
    public String getSupportedBusinessType() {
        return CrmBusinessTypes.CRM_QUOTE;
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
        LambdaUpdateWrapper<CrmQuote> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(CrmQuote::getQuoteId, dto.getBusinessId())
                .eq(CrmQuote::getInstanceId, dto.getProcessInstanceId())
                .set(CrmQuote::getStatus, status)
                .set(CrmQuote::getUpdateBy, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)
                .set(CrmQuote::getUpdateTime, LocalDateTime.now());
        int updated = quoteMapper.update(null, wrapper);
        if (updated <= 0) {
            CrmQuote quote = quoteMapper.selectById(dto.getBusinessId());
            if (quote == null) {
                throw new IllegalStateException("未找到报价记录，businessId=" + dto.getBusinessId());
            }
            if (WorkflowCallbackInstanceGuard.shouldSkipStaleCallback(
                    "CRM报价", dto.getBusinessId(), quote.getInstanceId(), dto.getProcessInstanceId())) {
                return;
            }
            throw new IllegalStateException("CRM报价审批结果回写失败，businessId=" + dto.getBusinessId());
        }
        log.info("CRM 报价审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
    }
}
