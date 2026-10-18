package com.cloudflow.crm.domain.vo;

import com.cloudflow.common.core.domain.PageResult;
import java.math.BigDecimal;

public record CrmRefundSourcesVO(Long receivableId, Integer version, String currency, BigDecimal receivedAmount,
        BigDecimal untrackedAmount, Long pendingApprovalId, boolean workflowConfigured, String workflowMessage,
        String businessOwnerName, int financeReviewerCount, PageResult<CrmRefundReceiptVO> receipts) { }
