package com.cloudflow.crm.service;

import com.cloudflow.crm.domain.CrmApproval;

import java.math.BigDecimal;

/**
 * CRM 通用审批：客户领取 / 公海释放 / 商机降级关闭 / 客户分级变更 / 退款。
 *
 * <p>统一走 crm_approval 流水 + RemoteWorkflowService.startProcess。
 * 审批回调通过现有 CRM WorkflowApprovalCallbackStreamConsumer 分发到 CrmGenericApprovalHandler，
 * 审批通过后根据 businessType 执行对应的业务动作。
 */
public interface CrmApprovalService {

    /** 申请客户领取 / 公海释放（action: CLAIM | RELEASE）。 */
    Long submitCustomerClaim(Long customerId, String action, String remark);

    /** 申请客户分级变更（action: LEVEL_UP | LEVEL_DOWN），targetLevel 为目标分级编码。 */
    Long submitCustomerLevelChange(Long customerId, String action, String targetLevel, String remark);

    /** 申请商机降级关闭（action: DOWNGRADE | CLOSE），targetStage 为降级目标阶段。 */
    Long submitOpportunityDowngrade(Long opportunityId, String action, String targetStage, String lostReason);

    /** 申请退款（针对回款 receivable）。 */
    Long submitRefund(Long receivableId, BigDecimal refundAmount, String reason);

    CrmApproval getById(Long approvalId);
}
