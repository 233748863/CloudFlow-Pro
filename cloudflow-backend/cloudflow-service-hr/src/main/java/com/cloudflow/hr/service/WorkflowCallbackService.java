package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.ApprovalResultDTO;

/**
 * 工作流回调服务接口
 * 处理工作流服务的审批结果回调
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
public interface WorkflowCallbackService {

    /**
     * 处理审批结果回调
     *
     * @param dto 审批结果DTO
     */
    void handleApprovalResult(ApprovalResultDTO dto);
}
