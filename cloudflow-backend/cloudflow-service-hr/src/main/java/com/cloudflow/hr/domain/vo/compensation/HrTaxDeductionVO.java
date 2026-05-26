package com.cloudflow.hr.domain.vo.compensation;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 个税扣除 VO（剔除 deleted/tenantId；amount 为解密后明文按权限掩码）。
 */
@Data
@Schema(name = "HrTaxDeductionVO", description = "HR 个税扣除 VO")
public class HrTaxDeductionVO {
    @Schema(description = "扣除项 ID") private Long id;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "扣除类型") private String deductionType;
    @Schema(description = "金额（按权限掩码）") private BigDecimal amount;
    @Schema(description = "开始日期") private LocalDate startDate;
    @Schema(description = "结束日期") private LocalDate endDate;
    @Schema(description = "状态") private String status;
    @Schema(description = "备注") private String remark;
    @Schema(description = "创建人") private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
