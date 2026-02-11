package cn.joywon.poco.merchant.CouponModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
@Schema(description = "商家作废优惠券参数")
public class CouponTemplateCancelDTO {

    @NotNull(message = "优惠券模板ID不能为空")
    @Schema(description = "优惠券模板ID")
    private Long couponTemplateId;

}