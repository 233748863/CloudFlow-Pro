package cn.joywon.poco.merchant.ProductModule.vo;

import cn.joywon.poco.merchant.Common.convert.TwoDecimalSerializer;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Schema(description = "首页门店列表下商家商品列表返回数据")
public class MiniProductHomeListVO {

    @Schema(description = "商品souID")
    private Long spuId;

    @Schema(description = "商品名称")
    private String productName;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "商品价格")
    private BigDecimal price;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "商品原价")
    private BigDecimal originalPrice;

    @Schema(description = "商品主图")
    private String mainImage;

}