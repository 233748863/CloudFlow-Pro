package com.cloudflow.hr.domain.vo.ess;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * HR 福利缴费明细 VO（金额由 HrTypedCrudService.maskRow 按权限脱敏，剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrBenefitPaymentVO", description = "HR 福利缴费明细 VO")
public class HrBenefitPaymentVO {
    @Schema(description = "缴费 ID") private Long id;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "方案 ID") private Long schemeId;
    @Schema(description = "缴费月份") private String periodMonth;
    @Schema(description = "基数") private BigDecimal baseAmount;
    @Schema(description = "公司缴费") private BigDecimal companyAmount;
    @Schema(description = "个人缴费") private BigDecimal personalAmount;
    @Schema(description = "项目明细") private List<Map<String, Object>> items;
    @Schema(description = "状态") private String status;
    @Schema(description = "缴费日期") private LocalDate payDate;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
}
