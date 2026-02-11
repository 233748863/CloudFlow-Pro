package cn.joywon.poco.merchant.CouponModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
@Schema(description = "结算重试DTO")
public class SettlementRetryDTO {

    @NotBlank(message = "记录ID不能为空")
    @Schema(description = "返利记录ID")
    private String recordId;

    @Schema(description = "是否强制重试")
    private Boolean forceRetry = false;
}