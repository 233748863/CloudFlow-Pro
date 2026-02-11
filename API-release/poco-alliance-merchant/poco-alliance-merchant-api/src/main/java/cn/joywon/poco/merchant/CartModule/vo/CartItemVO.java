package cn.joywon.poco.merchant.CartModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 购物车项VO
 *
 * @author poco
 * @date 2024-12-25
 */
@Data
@Schema(description = "购物车项VO")
public class CartItemVO {

    @Schema(description = "购物车项ID")
    private Long id;

    @Schema(description = "用户ID")
    private Long userId;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "商家名称")
    private String merchantName;

    @Schema(description = "商品ID")
    private Long productId;

    @Schema(description = "商品名称")
    private String productName;

    @Schema(description = "商品主图")
    private String productMainImage;

    @Schema(description = "SKU ID")
    private Long skuId;

    @Schema(description = "SKU名称")
    private String skuName;

    @Schema(description = "SKU规格属性JSON")
    private String specAttributes;

    @Schema(description = "价格")
    private BigDecimal price;

    @Schema(description = "原价")
    private BigDecimal originalPrice;

    @Schema(description = "购买数量")
    private Integer quantity;

    @Schema(description = "当前库存")
    private Integer stock;

    @Schema(description = "是否可购买（库存充足且商品上架）")
    private Boolean available;

    @Schema(description = "创建时间")
    private LocalDateTime createdTime;

    @Schema(description = "更新时间")
    private LocalDateTime updatedTime;
}
