package com.cloudflow.oa.service;

import com.cloudflow.oa.domain.dto.ApprovalResultDTO;

/**
 * Workflow 回调分发服务。
 */
public interface WorkflowCallbackService {

    /**
     * 处理 Workflow 审批结果回调。
     */
    void handleApprovalResult(ApprovalResultDTO dto);
}
