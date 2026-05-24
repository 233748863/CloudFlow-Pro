package com.cloudflow.crm.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * CRM 离职交接任务 VO（剔除 deleted/tenantId 内部字段）。
 */
@Data
@Schema(name = "CrmHandoverTaskVO", description = "CRM 离职交接任务 VO")
public class CrmHandoverTaskVO {

    @Schema(description = "交接任务 ID")
    private Long handoverId;

    @Schema(description = "原负责人 ID")
    private Long fromOwnerId;

    @Schema(description = "原负责人姓名")
    private String fromOwnerName;

    @Schema(description = "原所属部门 ID")
    private Long fromDeptId;

    @Schema(description = "业务类型 CUSTOMER/OPPORTUNITY/CONTRACT/...")
    private String businessType;

    @Schema(description = "业务对象 ID")
    private Long businessId;

    @Schema(description = "业务对象名称")
    private String businessName;

    @Schema(description = "状态 PENDING/REASSIGNED/CLOSED")
    private String status;

    @Schema(description = "新负责人 ID")
    private Long toOwnerId;

    @Schema(description = "新负责人姓名")
    private String toOwnerName;

    @Schema(description = "触发来源")
    private String triggerSource;

    @Schema(description = "触发事件 ID")
    private String triggerEventId;

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
