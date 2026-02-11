

package cn.joywon.poco.merchant.ProductModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 商品SKU VO
 *
 * @author poco
 * @date 2025-01-01
 */
@Data
@Schema(description = "商品SKU VO")
public class ProductSkuVO {

    /**
     * SKU ID
     */
    @Schema(description = "SKU ID")
    private Long id;

    /**
     * 商品ID
     */
    @Schema(description = "商品ID")
    private Long productId;

    /**
     * SKU名称
     */
    @Schema(description = "SKU名称")
    private String skuName;

    /**
     * SKU编码
     */
    @Schema(description = "SKU编码")
    private String skuCode;

    /**
     * 价格
     */
    @Schema(description = "价格")
    private BigDecimal price;

    /**
     * 原价
     */
    @Schema(description = "原价")
    private BigDecimal originalPrice;

    /**
     * 库存数量
     */
    @Schema(description = "库存数量")
    private Integer stock;

    /**
     * 预警库存
     */
    @Schema(description = "预警库存")
    private Integer warningStock;

    /**
     * SKU规格属性
     */
    @Schema(description = "SKU规格属性")
    private Object specAttributes;

    /**
     * SKU图片
     */
    @Schema(description = "SKU图片")
    private String skuImage;

    /**
     * 重量（克）
     */
    @Schema(description = "重量（克）")
    private Integer weight;

    /**
     * 体积（立方厘米）
     */
    @Schema(description = "体积（立方厘米）")
    private Integer volume;

    /**
     * 营销配置
     */
    @Schema(description = "营销配置")
    private String marketingConfig;

    /**
     * 是否启用：0-禁用，1-启用
     */
    @Schema(description = "是否启用：0-禁用，1-启用")
    private String enabled;

    /**
     * 是否启用描述
     */
    @Schema(description = "是否启用描述")
    private String enabledDesc;

    /**
     * 排序权重
     */
    @Schema(description = "排序权重")
    private Integer sortWeight;

    /**
     * 创建人
     */
    @Schema(description = "创建人")
    private String createBy;

    /**
     * 创建时间
     */
    @Schema(description = "创建时间")
    private LocalDateTime createTime;

    /**
     * 修改人
     */
    @Schema(description = "修改人")
    private String updateBy;

    /**
     * 修改时间
     */
    @Schema(description = "修改时间")
    private LocalDateTime updateTime;

    /**
     * 删除标志：0-正常，1-删除
     */
    @Schema(description = "删除标志：0-正常，1-删除")
    private String isDeleted;

    /**
     * 租户ID
     */
    @Schema(description = "租户ID")
    private Long tenantId;

    /**
     * 版本号（乐观锁）
     */
    @Schema(description = "版本号（乐观锁）")
    private Long version;
}