package cn.joywon.poco.merchant.CouponModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
@Schema(description = "用户核销优惠券参数")
public class UserCouponRedeemDTO {

    @NotNull(message = "用户优惠券ID不能为空")
    @Schema(description = "用户优惠券ID")
    private String couponId;

    @NotNull(message = "订单ID不能为空")
    @Schema(description = "使用优惠券的订单ID")
    private String orderId;

}