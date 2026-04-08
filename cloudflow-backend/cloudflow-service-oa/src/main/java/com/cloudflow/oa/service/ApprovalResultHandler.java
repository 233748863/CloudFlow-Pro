package com.cloudflow.oa.service;

import com.cloudflow.oa.domain.dto.ApprovalResultDTO;

/**
 * OA 审批结果处理器接口。
 */
public interface ApprovalResultHandler {

    /**
     * 当前处理器支持的业务类型。
     */
    String getSupportedBusinessType();

    /**
     * 处理审批通过。
     */
    void handleApproved(ApprovalResultDTO dto);

    /**
     * 处理审批驳回。
     */
    void handleRejected(ApprovalResultDTO dto);
}
