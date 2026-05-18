package com.cloudflow.common.workflow.callback.service;

import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;

/**
 * 工作流审批结果回调入口。Stream 消费端在反序列化得到 DTO 后调用本接口分发到业务侧。
 */
public interface WorkflowCallbackService {

    /** 处理一条审批回调。 */
    void handleApprovalResult(ApprovalResultDTO dto);
}
