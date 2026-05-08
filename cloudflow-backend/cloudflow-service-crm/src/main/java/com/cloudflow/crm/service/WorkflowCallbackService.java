package com.cloudflow.crm.service;

import com.cloudflow.crm.domain.dto.ApprovalResultDTO;

public interface WorkflowCallbackService {

    void handleApprovalResult(ApprovalResultDTO dto);
}
