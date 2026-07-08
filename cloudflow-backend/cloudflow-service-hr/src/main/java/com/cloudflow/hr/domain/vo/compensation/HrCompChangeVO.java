package com.cloudflow.hr.domain.vo.compensation;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 调薪变更 VO（剔除 deleted/tenantId；金额字段为解密后明文按权限掩码）。
 */
@Data
@Schema(name = "HrCompChangeVO", description = "HR 调薪变更 VO")
public class HrCompChangeVO {
    @Schema(description = "调薪记录 ID") private Long id;
    @Schema(description = "租户 ID") private Long tenantId;
    @Schema(description = "调薪单号") private String changeNo;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "员工所属用户 ID") private Long userId;
    @Schema(description = "员工所属部门 ID") private Long deptId;
    @Schema(description = "员工工号") private String employeeNo;
    @Schema(description = "员工姓名") private String employeeName;
    @Schema(description = "变更类型") private String changeType;
    @Schema(description = "调薪前总额（按权限掩码）") private BigDecimal beforeTotal;
    @Schema(description = "调薪后总额（按权限掩码）") private BigDecimal afterTotal;
    @Schema(description = "差额（按权限掩码）") private BigDecimal changeAmount;
    @Schema(description = "生效日期") private LocalDate effectiveDate;
    @Schema(description = "调薪原因") private String reason;
    @Schema(description = "状态") private String status;
    @Schema(description = "审批流程实例 ID") private String processInstanceId;
    @Schema(description = "创建人") private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
