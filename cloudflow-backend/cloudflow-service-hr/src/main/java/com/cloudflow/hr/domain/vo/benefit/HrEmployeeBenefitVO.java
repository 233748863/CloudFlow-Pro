package com.cloudflow.hr.domain.vo.benefit;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 员工福利项 VO（剔除 deleted/tenantId；baseAmount 已解密，由 maskRow 按权限脱敏）。
 */
@Data
@Schema(name = "HrEmployeeBenefitVO", description = "HR 员工福利项 VO")
public class HrEmployeeBenefitVO {
    @Schema(description = "福利项 ID") private Long id;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "福利方案 ID") private Long schemeId;
    @Schema(description = "基础额度（解密后/掩码由权限决定）") private BigDecimal baseAmount;
    @Schema(description = "生效日期") private LocalDate effectiveDate;
    @Schema(description = "状态") private String status;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
