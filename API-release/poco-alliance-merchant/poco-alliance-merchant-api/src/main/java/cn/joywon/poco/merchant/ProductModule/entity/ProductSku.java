
package cn.joywon.poco.merchant.ProductModule.entity;

import cn.joywon.poco.common.core.util.TenantTable;
import com.baomidou.mybatisplus.annotation.*;
import com.baomidou.mybatisplus.extension.activerecord.Model;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.io.Serial;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 商品SKU表
 *
 * @author poco
 * @date 2025-01-01
 */
@Data
@TenantTable
@TableName("product_skus")
@EqualsAndHashCode(callSuper = true)
@Schema(description = "商品SKU表")
public class ProductSku extends Model<ProductSku> {

    @Serial
    private static final long serialVersionUID = 1L;

    /**
     * SKU ID
     */
    @TableId(type = IdType.ASSIGN_ID)
    @Schema(description = "SKU ID")
    private Long id;

    /**
     * 商品ID
     */
    @Schema(description = "商品ID")
    @TableField("product_id")
    private Long productId;

    /**
     * SKU名称
     */
    @Schema(description = "SKU名称")
    @TableField("sku_name")
    private String skuName;

    /**
     * SKU编码
     */
    @Schema(description = "SKU编码")
    @TableField("sku_code")
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
    @TableField("original_price")
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
    @TableField("warning_stock")
    private Integer warningStock;

    /**
     * SKU规格属性（JSON对象）
     */
    @Schema(description = "SKU规格属性（JSON对象）")
    @TableField("spec_attributes")
    private String specAttributes;

    /**
     * SKU图片
     */
    @Schema(description = "SKU图片")
    @TableField("sku_image")
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
     * 营销配置（JSON对象）
     */
    @Schema(description = "营销配置（JSON对象）")
    @TableField("marketing_config")
    private String marketingConfig;

    /**
     * 是否启用：0-禁用，1-启用
     */
    @Schema(description = "是否启用：0-禁用，1-启用")
    @TableField("enabled")
    private String enabled;

    /**
     * 排序权重
     */
    @Schema(description = "排序权重")
    @TableField("sort_weight")
    private Integer sortWeight;

    /**
     * 创建人
     */
    @Schema(description = "创建人")
    @TableField(value = "created_by", fill = FieldFill.INSERT)
    private String createdBy;

    /**
     * 修改人
     */
    @Schema(description = "修改人")
    @TableField(value = "updated_by", fill = FieldFill.INSERT_UPDATE)
    private String updatedBy;

    /**
     * 创建时间
     */
    @Schema(description = "创建时间")
    @TableField(value = "created_time", fill = FieldFill.INSERT)
    private LocalDateTime createdTime;

    /**
     * 修改时间
     */
    @Schema(description = "修改时间")
    @TableField(value = "updated_time", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedTime;

    /**
     * 删除标记,1:已删除,0:正常
     */
    @Schema(description = "删除标记,1:已删除,0:正常")
    @TableField(value = "is_deleted", fill = FieldFill.INSERT)
    @TableLogic
    private String isDeleted;

    /**
     * 所属租户
     */
    @Schema(description = "所属租户", hidden = true)
    @TableField("tenant_id")
    private Long tenantId;

    /**
     * 版本号（乐观锁）
     */
    @Version
    @Schema(description = "版本号（乐观锁）")
    @TableField("version")
    private Integer version;
}