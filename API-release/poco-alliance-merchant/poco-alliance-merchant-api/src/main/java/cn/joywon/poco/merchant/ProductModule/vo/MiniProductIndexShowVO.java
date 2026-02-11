package cn.joywon.poco.merchant.ProductModule.vo;

import cn.joywon.poco.merchant.Common.convert.TwoDecimalSerializer;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
@Schema(description = "首页门店列表中商品列表展示返回数据")
public class MiniProductIndexShowVO {

    @Schema(description = "商品spuID")
    private Long spuId;

    @Schema(description = "商品名称")
    private String productName;

    @Schema(description = "商品分类ID")
    private Long categoryId;

    @Schema(description = "商品标签")
    private List<String> tags;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "商品价格")
    private BigDecimal price;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "商品原价")
    private BigDecimal originalPrice;

    @Schema(description = "商品主图")
    private String mainImage;

    @Schema(description = "商品销量")
    private Integer salesCount;

}