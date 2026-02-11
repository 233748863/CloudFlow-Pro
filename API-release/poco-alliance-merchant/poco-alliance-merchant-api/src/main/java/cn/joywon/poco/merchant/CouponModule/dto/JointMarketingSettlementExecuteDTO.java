package cn.joywon.poco.merchant.CouponModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.time.LocalDate;

@Data
@Schema(description = "联合营销计划结算执行DTO")
public class JointMarketingSettlementExecuteDTO {

    @NotBlank(message = "计划ID不能为空")
    @Schema(description = "联合营销计划ID")
    private String planId;

    @Schema(description = "结算开始日期")
    private LocalDate startDate;

    @Schema(description = "结算结束日期")
    private LocalDate endDate;

    @Schema(description = "是否强制结算失败记录")
    private Boolean forceRetry = false;

    @Schema(description = "批次大小")
    private Integer batchSize = 100;

}