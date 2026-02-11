package cn.joywon.poco.merchant.CouponModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "优惠券计算折扣参数")
public class CouponCalculateDiscountDTO {

    @Schema(description = "订单信息")
    @NotEmpty(message = "订单信息不能为空")
    private List<@Valid MerchantInfo> cartInfo;

    @Data
    @Schema(description = "订单商家门店信息")
    public static class MerchantInfo {

        @Schema(description = "门店ID")
        private String storeId;

        @Schema(description = "商家ID")
        private String merchantId;

        @Schema(description = "订单商品信息")
        @NotEmpty(message = "订单商品信息不能为空")
        private List<@Valid ProductItem> items;

        @Schema(description = "优惠券ID列表")
        private List<String> couponIds;

    }

    @Data
    @Schema(description = "订单商品信息")
    public static class ProductItem {

        @Schema(description = "商品ID")
        @NotBlank(message = "商品ID不能为空")
        private String productId;

        @Schema(description = "商品数量")
        @NotNull(message = "商品数量不能为空")
        @Min(value = 1, message = "商品数量不能小于1")
        private Integer quantity;

    }

}