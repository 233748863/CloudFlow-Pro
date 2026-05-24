package com.cloudflow.crm.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * CRM 审批主记录 VO（剔除 deleted/tenantId 内部字段）。
 */
@Data
@Schema(name = "CrmApprovalVO", description = "CRM 审批主记录 VO")
public class CrmApprovalVO {

    @Schema(description = "审批 ID")
    private Long approvalId;

    @Schema(description = "审批单号")
    private String approvalNo;

    @Schema(description = "业务类型")
    private String businessType;

    @Schema(description = "动作类型")
    private String actionType;

    @Schema(description = "关联业务对象类型")
    private String businessRefType;

    @Schema(description = "关联业务对象 ID")
    private Long businessRefId;

    @Schema(description = "关联业务对象名称")
    private String businessRefName;

    @Schema(description = "审批载荷 JSON 文本")
    private String payloadJson;

    @Schema(description = "申请人 ID")
    private Long applicantId;

    @Schema(description = "申请人姓名")
    private String applicantName;

    @Schema(description = "部门 ID")
    private Long deptId;

    @Schema(description = "部门名称")
    private String deptName;

    @Schema(description = "状态 PENDING/APPROVED/REJECTED/CANCELLED")
    private String status;

    @Schema(description = "工作流实例 ID")
    private String instanceId;

    @Schema(description = "审批意见")
    private String approvalComment;

    @Schema(description = "备注")
    private String remark;

    @Schema(description = "创建人")
    private String createBy;

    @Schema(description = "创建时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @Schema(description = "更新人")
    private String updateBy;

    @Schema(description = "更新时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
