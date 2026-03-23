package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.Map;

/**
 * 审批结果回调DTO
 * 工作流服务完成审批后回调HR服务时使用
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class ApprovalResultDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 租户ID
     */
    private Long tenantId;

    /**
     * 流程实例ID
     */
    private String processInstanceId;

    /**
     * 业务类型
     * ONBOARDING-入职, PROBATION_CONFIRMATION-转正, TRANSFER-调岗, RESIGNATION-离职,
     * LEAVE-请假, OVERTIME-加班, SALARY_ADJUSTMENT-调薪, RECRUITMENT_REQUEST-招聘需求,
     * OFFER-Offer, ATTENDANCE_SUPPLEMENT-补卡
     */
    private String businessType;

    /**
     * 业务ID
     */
    private Long businessId;

    /**
     * 业务编号
     */
    private String businessNo;

    /**
     * 审批结果
     * APPROVED-通过, REJECTED-拒绝
     */
    private String approvalResult;

    /**
     * 审批意见
     */
    private String approvalComment;

    /**
     * 审批人ID
     */
    private Long approverId;

    /**
     * 审批人姓名
     */
    private String approverName;

    /**
     * 审批时间（时间戳）
     */
    private Long approvalTime;

    /**
     * 流程变量（可选）
     */
    private Map<String, Object> variables;
}
