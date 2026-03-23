package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.ApprovalResultDTO;

/**
 * 审批结果处理器接口
 * 不同业务类型实现此接口来处理审批结果
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
public interface ApprovalResultHandler {

    /**
     * 获取支持的业务类型
     *
     * @return 业务类型标识
     */
    String getSupportedBusinessType();

    /**
     * 处理审批通过
     *
     * @param dto 审批结果DTO
     */
    void handleApproved(ApprovalResultDTO dto);

    /**
     * 处理审批拒绝
     *
     * @param dto 审批结果DTO
     */
    void handleRejected(ApprovalResultDTO dto);
}
