package com.cloudflow.common.workflow.callback.handler;

import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;

/**
 * 审批结果处理器。业务服务通过实现该接口并注册为 Spring Bean，
 * 由 {@code DefaultWorkflowCallbackDispatcher} 按 businessType 路由分发。
 */
public interface ApprovalResultHandler {

    /** 当前处理器支持的业务类型，需与 workflow 流程变量 {@code businessType} 完全一致。 */
    String getSupportedBusinessType();

    /** 处理审批通过。 */
    void handleApproved(ApprovalResultDTO dto);

    /** 处理审批驳回。 */
    void handleRejected(ApprovalResultDTO dto);
}
