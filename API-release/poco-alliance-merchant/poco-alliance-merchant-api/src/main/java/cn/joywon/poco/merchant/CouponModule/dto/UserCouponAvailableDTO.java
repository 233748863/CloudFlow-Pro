package cn.joywon.poco.merchant.CouponModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.Map;

@Data
@Schema(description = "获取订单可用优惠券参数")
public class UserCouponAvailableDTO {

    @NotEmpty(message = "商品信息不能为空")
    @Schema(description = "商品信息: key-skuId, value-数量")
    private Map<String, Integer> categories;

    @Schema(description = "商家ID")
    private String merchantId;

    @Schema(description = "门店ID")
    private String storeId;

}