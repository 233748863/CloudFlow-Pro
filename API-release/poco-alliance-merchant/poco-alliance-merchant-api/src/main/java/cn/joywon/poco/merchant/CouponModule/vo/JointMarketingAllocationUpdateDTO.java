package cn.joywon.poco.merchant.CouponModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Schema(description = "联合营销分润配置更新参数")
public class JointMarketingAllocationUpdateDTO {

    @NotBlank(message = "配置ID不能为空")
    @Schema(description = "分润配置ID")
    private String id;

    @Schema(description = "分润时机: COUPON_ISSUE-发券时; COUPON_VERIFY-核销时")
    private String triggerPhase;

    @Schema(description = "分润类型: FIXED-固定金额; RATE-比例")
    private String allocationType;

    @DecimalMin(value = "0.0", message = "分润值不能小于0")
    @DecimalMax(value = "1.0", message = "比例分润值不能大于1")
    @Schema(description = "分润值")
    private BigDecimal allocationValue;

    @Size(max = 200, message = "费用说明不能超过200字符")
    @Schema(description = "费用说明")
    private String description;

}