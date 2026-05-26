package com.cloudflow.hr.domain.vo.compensation;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * HR 薪酬模拟 VO（不持久化，纯计算结果聚合）。
 */
@Data
@Schema(name = "HrCompensationSimulateVO", description = "HR 薪酬模拟 VO")
public class HrCompensationSimulateVO {
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "薪资结构 ID") private Long structureId;
    @Schema(description = "薪资档级 ID") private Long gradeId;
    @Schema(description = "城市") private String city;
    @Schema(description = "应发工资总额") private BigDecimal gross;
    @Schema(description = "应税工资基数") private BigDecimal taxableGross;
    @Schema(description = "社保缴费基数") private BigDecimal socialBase;
    @Schema(description = "社保个人比例") private BigDecimal socialPersonalRate;
    @Schema(description = "社保个人缴费") private BigDecimal socialPersonal;
    @Schema(description = "专项附加扣除") private BigDecimal specialDeductions;
    @Schema(description = "月度起征点") private BigDecimal threshold;
    @Schema(description = "应纳税所得额") private BigDecimal taxableIncome;
    @Schema(description = "个人所得税") private BigDecimal personalTax;
    @Schema(description = "实发工资") private BigDecimal netSalary;
    @Schema(description = "薪资明细列表")
    private List<HrCompensationSimulateBreakdownItemVO> breakdown;
}
