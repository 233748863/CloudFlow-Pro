package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.crm.config.WorkflowCallbackStreamConstants;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.dto.ApprovalResultDTO;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.service.ApprovalResultHandler;
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
        return WorkflowCallbackStreamConstants.BUSINESS_TYPE_CRM_QUOTE;
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
                .set(CrmQuote::getInstanceId, dto.getProcessInstanceId())
                .set(CrmQuote::getStatus, status)
                .set(CrmQuote::getUpdateBy, WorkflowCallbackStreamConstants.WORKFLOW_UPDATE_BY)
                .set(CrmQuote::getUpdateTime, LocalDateTime.now());
        int updated = quoteMapper.update(null, wrapper);
        if (updated <= 0) {
            throw new IllegalStateException("未找到报价记录，businessId=" + dto.getBusinessId());
        }
        log.info("CRM 报价审批结果已回写: businessId={}, status={}, instanceId={}",
                dto.getBusinessId(), status, dto.getProcessInstanceId());
    }
}
