package cn.joywon.poco.merchant.ReportModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

@Data
@Schema(description = "分润统计报表查询参数")
public class JointMarketingProfitReportDTO {

    @NotBlank(message = "计划ID不能为空")
    @Schema(description = "联合营销计划ID")
    private String planId;

    @NotNull(message = "开始日期不能为空")
    @Schema(description = "统计开始日期")
    private LocalDate startDate;

    @NotNull(message = "结束日期不能为空")
    @Schema(description = "统计结束日期")
    private LocalDate endDate;

    @Schema(description = "统计维度: DAY-按天, WEEK-按周, MONTH-按月")
    private String dimension = "DAY";

    @Schema(description = "商家ID(可选，不传则统计所有商家)")
    private String merchantId;

    @Schema(description = "角色类型: PAYER-支付方, PAYEE-接收方")
    private String roleType;

}