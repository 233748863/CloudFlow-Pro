package cn.joywon.poco.merchant.CartModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 按商家分组的购物车VO
 *
 * @author poco
 * @date 2024-12-25
 */
@Data
@Schema(description = "按商家分组的购物车VO")
public class CartGroupVO {

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "商家名称")
    private String merchantName;

    @Schema(description = "购物车项列表")
    private List<CartItemVO> items;

    @Schema(description = "该商家商品总金额")
    private BigDecimal totalAmount;
}
