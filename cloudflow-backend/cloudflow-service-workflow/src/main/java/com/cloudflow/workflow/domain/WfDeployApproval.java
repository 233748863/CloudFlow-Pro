package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * 流程发布审批实体
 */
@Data
@TableName("wf_deploy_approval")
public class WfDeployApproval {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID */
    private Long tenantId;

    /** 发布记录ID */
    private Long deployId;

    /** 流程定义ID */
    private String processDefId;

    /** 审批状态: PENDING-待审批, APPROVED-已通过, REJECTED-已驳回, CANCELLED-已取消 */
    private String approvalStatus;

    /** 当前审批步骤 */
    private Integer currentStep;

    /** 总审批步骤数 */
    private Integer totalSteps;

    /** 审批配置(JSON格式) */
    private String approvalConfig;

    /** 提交人ID */
    private Long submitterId;

    /** 提交时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime submitTime;

    /** 完成时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime completeTime;

    @TableField(fill = FieldFill.INSERT)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createdTime;

    @TableField(fill = FieldFill.UPDATE)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updatedTime;
}
