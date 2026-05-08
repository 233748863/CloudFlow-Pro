package com.cloudflow.crm.service;

import com.cloudflow.crm.domain.dto.ApprovalResultDTO;

public interface ApprovalResultHandler {

    String getSupportedBusinessType();

    void handleApproved(ApprovalResultDTO dto);

    void handleRejected(ApprovalResultDTO dto);
}
