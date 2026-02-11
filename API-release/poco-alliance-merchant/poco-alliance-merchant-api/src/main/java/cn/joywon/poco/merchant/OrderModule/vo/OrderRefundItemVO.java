package cn.joywon.poco.merchant.OrderModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 退款商品明细VO
 *
 * @author poco
 * @date 2025-12-30
 */
@Data
@Schema(description = "退款商品明细VO")
public class OrderRefundItemVO {

    @Schema(description = "退款明细ID")
    private Long id;

    @Schema(description = "退款申请ID")
    private Long refundApplyId;

    @Schema(description = "订单商品ID")
    private Long orderItemId;

    @Schema(description = "商品ID")
    private Long productId;

    @Schema(description = "SKU ID")
    private Long productSkuId;

    @Schema(description = "商品名称")
    private String productName;

    @Schema(description = "商品图片")
    private String productImage;

    @Schema(description = "SKU规格")
    private String skuSpec;

    @Schema(description = "商品单价")
    private BigDecimal unitPrice;

    @Schema(description = "购买数量")
    private Integer quantity;

    @Schema(description = "退款数量")
    private Integer refundQuantity;

    @Schema(description = "退款金额")
    private BigDecimal refundAmount;
}
