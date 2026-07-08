package com.cloudflow.hr.domain.vo.benefit;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * HR 福利申领 VO（剔除 deleted/tenantId/version；amount 由 maskRow 按权限脱敏）。
 */
@Data
@Schema(name = "HrBenefitRequestVO", description = "HR 福利申领 VO")
public class HrBenefitRequestVO {
    @Schema(description = "申领 ID") private Long id;
    @Schema(description = "申领编号") private String requestNo;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "福利方案 ID") private Long schemeId;
    @Schema(description = "申领类型") private String requestType;
    @Schema(description = "金额（掩码由权限决定）") private Object amount;
    @Schema(description = "积分数") private Integer pointAmount;
    @Schema(description = "申请原因") private String reason;
    @Schema(description = "附件") private List<Object> attachments;
    @Schema(description = "状态") private String status;
    @Schema(description = "审批流程实例 ID") private String processInstanceId;
    @Schema(description = "审批人 ID") private Long approverId;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime paidAt;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
