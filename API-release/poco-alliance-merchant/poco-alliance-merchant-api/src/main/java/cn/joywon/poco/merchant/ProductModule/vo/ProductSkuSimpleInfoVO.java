package cn.joywon.poco.merchant.ProductModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Schema(description = "商品sku简要信息返回数据")
public class ProductSkuSimpleInfoVO {

    @Schema(description = "商品skuId")
    private Long skuId;

    @Schema(description = "商品sku名称")
    private String skuName;

    @Schema(description = "商品sku分类名称")
    private String categoryName;

    @Schema(description = "商品sku价格")
    private BigDecimal price;

    @Schema(description = "商品sku图片")
    private String skuImage;

    @Schema(description = "商品所属商家ID")
    private Long merchantId;

}