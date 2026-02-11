package cn.joywon.poco.merchant.ProductModule.bo;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class MiniProductIndexShowBO {

    private Long spuId;

    private String productName;

    private String tag;

    private BigDecimal price;

    private BigDecimal originalPrice;

    private String mainImage;

    private Integer salesCount;

    private Long categoryId;

}