package cn.joywon.poco.merchant.CouponModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
@Schema(description = "商家核销用户优惠券参数")
public class UserCouponCodeDTO {

    @NotBlank(message = "优惠券码不能为空")
    @Schema(description = "用户优惠券码")
    private String couponCode;

}