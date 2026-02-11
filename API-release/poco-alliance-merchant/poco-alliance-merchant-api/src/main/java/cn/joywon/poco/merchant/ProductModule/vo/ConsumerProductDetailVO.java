package cn.joywon.poco.merchant.ProductModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
@Schema(description = "消费者端商品详情VO（聚合）")
public class ConsumerProductDetailVO {

    // === 商品主信息 ===
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
    private Object attributes;

    @Schema(description = "标签")
    private List<String> tags;

    @Schema(description = "商品排序权重")
    private Integer productSortWeight;

    @Schema(description = "价格（最低SKU价格）")
    private BigDecimal price;

    @Schema(description = "原价（最低SKU价格对应的原价）")
    private BigDecimal originalPrice;

    @Schema(description = "最高价格")
    private BigDecimal maxPrice;

    @Schema(description = "总库存")
    private Integer totalStock;

    @Schema(description = "总销量")
    private Integer totalSales;

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

    // === 聚合信息 ===

    @Schema(description = "SKU列表")
    private List<ProductSkuVO> skus;

    @Schema(description = "规格列表")
    private List<Map<String, Object>> specList;
}
