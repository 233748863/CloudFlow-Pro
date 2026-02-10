package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 流程发布审批步骤实体
 */
@Data
@TableName("wf_deploy_approval_step")
public class WfDeployApprovalStep {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID */
    private Long tenantId;

    /** 审批ID */
    private Long approvalId;

    /** 步骤序号 */
    private Integer stepNo;

    /** 步骤名称 */
    private String stepName;

    /** 审批人类型: USER-指定用户, ROLE-角色, DEPT-部门主管 */
    private String approverType;

    /** 审批人ID列表(JSON数组) */
    private String approverIds;

    /** 审批模式: ANY-任一人, ALL-所有人, SEQUENCE-依次审批 */
    private String approvalMode;

    /** 步骤状态: PENDING-待审批, APPROVED-已通过, REJECTED-已驳回 */
    private String stepStatus;

    /** 实际审批人ID */
    private Long actualApproverId;

    /** 审批意见 */
    private String approvalComment;

    /** 审批时间 */
    private LocalDateTime approvalTime;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdTime;
}
