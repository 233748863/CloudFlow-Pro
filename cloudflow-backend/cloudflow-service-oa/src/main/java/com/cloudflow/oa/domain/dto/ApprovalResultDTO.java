package com.cloudflow.oa.domain.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * Workflow 审批结果回调 DTO。
 */
@Data
public class ApprovalResultDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 租户 ID。
     */
    private Long tenantId;

    /**
     * 流程实例 ID。
     */
    private String processInstanceId;

    /**
     * 业务类型。
     */
    private String businessType;

    /**
     * 业务主键 ID。
     */
    private Long businessId;

    /**
     * 业务编号。
     */
    private String businessNo;

    /**
     * 审批结果。
     * 当前 OA 仅消费 APPROVED / REJECTED。
     */
    private String approvalResult;

    /**
     * 审批意见。
     */
    private String approvalComment;

    /**
     * 审批人 ID。
     */
    private Long approverId;

    /**
     * 审批人姓名。
     */
    private String approverName;

    /**
     * 审批时间戳。
     */
    private Long approvalTime;
}
