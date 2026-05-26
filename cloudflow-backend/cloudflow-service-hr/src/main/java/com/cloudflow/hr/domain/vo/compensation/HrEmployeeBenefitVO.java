package com.cloudflow.hr.domain.vo.compensation;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 员工福利 VO（剔除 deleted/tenantId；基数为解密后明文按权限掩码）。
 */
@Data
@Schema(name = "HrEmployeeBenefitVO", description = "HR 员工福利 VO")
public class HrEmployeeBenefitVO {
    @Schema(description = "记录 ID") private Long id;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "福利方案 ID") private Long schemeId;
    @Schema(description = "基数金额（按权限掩码）") private BigDecimal baseAmount;
    @Schema(description = "生效日期") private LocalDate effectiveDate;
    @Schema(description = "状态") private String status;
    @Schema(description = "创建人") private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
