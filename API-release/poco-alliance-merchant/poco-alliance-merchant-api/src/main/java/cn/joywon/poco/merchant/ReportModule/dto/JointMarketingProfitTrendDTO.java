package cn.joywon.poco.merchant.ReportModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

@Data
@Schema(description = "联合营销利润趋势分析查询参数")
public class JointMarketingProfitTrendDTO {

    @Schema(description = "商家ID(查询具体商家分润趋势时需要)")
    private String merchantId;

    @NotBlank(message = "计划ID不能为空")
    @Schema(description = "联合营销计划ID")
    private String planId;

    @NotNull(message = "开始日期不能为空")
    @Schema(description = "开始日期")
    private LocalDate startDate;

    @NotNull(message = "结束日期不能为空")
    @Schema(description = "结束日期")
    private LocalDate endDate;

    @Schema(description = "趋势类型: AMOUNT-金额趋势, COUNT-数量趋势")
    private String trendType = "AMOUNT";

}