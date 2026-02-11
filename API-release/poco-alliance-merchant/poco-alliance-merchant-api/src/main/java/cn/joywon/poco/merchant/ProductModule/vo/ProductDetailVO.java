package cn.joywon.poco.merchant.ProductModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@Schema(description = "商品与SKU详情VO")
public class ProductDetailVO {

    @Schema(description = "商品ID")
    private Long id;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "分类ID")
    private Long categoryId;

    @Schema(description = "分类名称")
    private String categoryName;

    @Schema(description = "商品名称")
    private String name;

    @Schema(description = "商品描述")
    private String description;

    @Schema(description = "商品类型")
    private String type;

    @Schema(description = "商品类型描述")
    private String typeDesc;

    @Schema(description = "商品状态")
    private String status;

    @Schema(description = "商品状态描述")
    private String statusDesc;

    @Schema(description = "主图")
    private String mainImage;

    @Schema(description = "详情图片")
    private List<String> detailImages;

    @Schema(description = "详情描述（JSON格式）")
    private Object detailDescription;

    @Schema(description = "属性")
    private String attributes;

    @Schema(description = "标签")
    private List<String> tags;

    @Schema(description = "商品排序权重")
    private Integer productSortWeight;

    @Schema(description = "最低价格")
    private BigDecimal minPrice;

    @Schema(description = "最高价格")
    private BigDecimal maxPrice;

    @Schema(description = "总库存")
    private Integer totalStock;

    @Schema(description = "SKU数量")
    private Integer skuCount;

    @Schema(description = "商品创建人")
    private String productCreateBy;

    @Schema(description = "商品创建时间")
    private LocalDateTime productCreateTime;

    @Schema(description = "商品更新人")
    private String productUpdateBy;

    @Schema(description = "商品更新时间")
    private LocalDateTime productUpdateTime;

    @Schema(description = "商品删除标志")
    private String productIsDeleted;

    @Schema(description = "商品租户ID")
    private Long productTenantId;

    @Schema(description = "商品版本")
    private Integer productVersion;

    @Schema(description = "SKU ID")
    private Long skuId;

    @Schema(description = "SKU名称")
    private String skuName;

    @Schema(description = "SKU编码")
    private String skuCode;

    @Schema(description = "价格")
    private BigDecimal price;

    @Schema(description = "原价")
    private BigDecimal originalPrice;

    @Schema(description = "库存数量")
    private Integer stock;

    @Schema(description = "预警库存")
    private Integer warningStock;

    @Schema(description = "规格属性")
    private String specAttributes;

    @Schema(description = "SKU图片")
    private String skuImage;

    @Schema(description = "重量")
    private Integer weight;

    @Schema(description = "体积")
    private Integer volume;

    @Schema(description = "营销配置")
    private String marketingConfig;

    @Schema(description = "启用")
    private String enabled;

    @Schema(description = "启用描述")
    private String enabledDesc;

    @Schema(description = "SKU排序权重")
    private Integer skuSortWeight;

    @Schema(description = "SKU创建人")
    private String skuCreateBy;

    @Schema(description = "SKU创建时间")
    private LocalDateTime skuCreateTime;

    @Schema(description = "SKU更新人")
    private String skuUpdateBy;

    @Schema(description = "SKU更新时间")
    private LocalDateTime skuUpdateTime;

    @Schema(description = "SKU删除标志")
    private String skuIsDeleted;

    @Schema(description = "SKU租户ID")
    private Long skuTenantId;

    @Schema(description = "SKU版本")
    private Integer skuVersion;
}
