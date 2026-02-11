

package cn.joywon.poco.merchant.ProductModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 商品列表VO
 *
 * @author poco
 * @date 2025-11-01
 */
@Data
@Schema(description = "商品列表VO")
public class ProductListVO {

    /**
     * 商品ID
     */
    @Schema(description = "商品ID")
    private Long id;

    /**
     * 商家ID
     */
    @Schema(description = "商家ID")
    private Long merchantId;

    /**
     * 商品分类ID
     */
    @Schema(description = "商品分类ID")
    private Long categoryId;

    /**
     * 商品分类名称 - 需要通过关联查询获取
     */
    @Schema(description = "商品分类名称")
    private String categoryName;

    /**
     * 商品名称
     */
    @Schema(description = "商品名称")
    private String name;

    /**
     * 商品描述
     */
    @Schema(description = "商品描述")
    private String description;

    /**
     * 商品类型：PHYSICAL-实物商品，SERVICE-服务商品
     */
    @Schema(description = "商品类型：PHYSICAL-实物商品，SERVICE-服务商品")
    private String type;

    /**
     * 商品类型描述 - 通过枚举转换获取
     */
    @Schema(description = "商品类型描述")
    private String typeDesc;

    /**
     * 商品状态：DRAFT-草稿，PUBLISHED-已发布，ARCHIVED-已归档
     */
    @Schema(description = "商品状态：DRAFT-草稿，PUBLISHED-已发布，ARCHIVED-已归档")
    private String status;

    /**
     * 商品状态描述 - 通过枚举转换获取
     */
    @Schema(description = "商品状态描述")
    private String statusDesc;

    /**
     * 商品主图
     */
    @Schema(description = "商品主图")
    private String mainImage;

    /**
     * 商品标签
     */
    @Schema(description = "商品标签")
    private List<String> tags;

    /**
     * 最低价格
     */
    @Schema(description = "最低价格")
    private BigDecimal minPrice;

    /**
     * 最低价格SKU信息
     */
    @Schema(description = "最低价格SKU信息")
    private ProductSkuVO minPriceSku;

    /**
     * 最低价格SKU的原价
     */
    @Schema(description = "最低价格SKU的原价")
    private BigDecimal minPriceSkuOriginalPrice;

    /**
     * 商品总销量
     */
    @Schema(description = "商品总销量")
    private Integer totalSales;

    /**
     * 最高价格
     */
    @Schema(description = "最高价格")
    private BigDecimal maxPrice;

    /**
     * 总库存
     */
    @Schema(description = "总库存")
    private Integer totalStock;

    /**
     * SKU数量
     */
    @Schema(description = "SKU数量")
    private Integer skuCount;

    /**
     * SKU列表
     */
    @Schema(description = "SKU列表")
    private List<ProductSkuVO> skus;

    /**
     * 排序权重
     */
    @Schema(description = "排序权重")
    private Integer sortWeight;

    /**
     * 创建人
     */
    @Schema(description = "创建人")
    private String createdBy;

    /**
     * 创建时间
     */
    @Schema(description = "创建时间")
    private LocalDateTime createdTime;

    /**
     * 修改人
     */
    @Schema(description = "修改人")
    private String updatedBy;

    /**
     * 修改时间
     */
    @Schema(description = "修改时间")
    private LocalDateTime updatedTime;

    /**
     * 租户ID
     */
    @Schema(description = "租户ID")
    private Long tenantId;

    /**
     * 版本号(乐观锁)
     */
    @Schema(description = "版本号(乐观锁)")
    private Integer version;

    /**
     * 商家名称
     */
    @Schema(description = "商家名称")
    private String merchantName;


}