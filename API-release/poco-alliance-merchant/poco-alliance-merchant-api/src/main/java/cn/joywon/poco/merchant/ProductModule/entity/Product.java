

package cn.joywon.poco.merchant.ProductModule.entity;

import cn.joywon.poco.common.core.util.TenantTable;
import com.baomidou.mybatisplus.annotation.*;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.baomidou.mybatisplus.extension.activerecord.Model;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 商品SPU表
 *
 * @author poco
 * @date 2025-01-01
 */
@Data
@TenantTable
@TableName(value = "products", autoResultMap = true)
@EqualsAndHashCode(callSuper = true)
@Schema(description = "商品SPU表")
public class Product extends Model<Product> {

    private static final long serialVersionUID = 1L;

    /**
     * 商品ID
     */
    @TableId(type = IdType.ASSIGN_ID)
    @Schema(description = "商品ID")
    private Long id;

    /**
     * 商家ID
     */
    @Schema(description = "商家ID")
    @TableField("merchant_id")
    private Long merchantId;

    /**
     * 商品分类ID
     */
    @Schema(description = "商品分类ID")
    @TableField("category_id")
    private Long categoryId;

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
     * 商品状态：DRAFT-草稿，PUBLISHED-已发布，ARCHIVED-已归档
     */
    @Schema(description = "商品状态：DRAFT-草稿，PUBLISHED-已发布，ARCHIVED-已归档")
    private String status;

    /**
     * 商品主图
     */
    @Schema(description = "商品主图")
    @TableField("main_image")
    private String mainImage;

    /**
     * 商品详情图片（JSON数组）
     */
    @Schema(description = "商品详情图片（JSON数组）")
    @TableField(value = "detail_images", typeHandler = JacksonTypeHandler.class)
    private List<String> detailImages;

    /**
     * 商品详情描述（JSON格式）
     * 使用 JacksonTypeHandler 自动处理 JSON 序列化和反序列化
     * 支持对象格式：{"type": "text", "content": "..."}
     * 也支持数组格式：["描述1", "描述2"]
     */
    @Schema(description = "商品详情描述（JSON格式）")
    @TableField(value = "detail_description", typeHandler = JacksonTypeHandler.class)
    private Object detailDescription;

    /**
     * 商品标签（JSON数组）
     */
    @Schema(description = "商品标签（JSON数组）")
    @TableField(value = "tags", typeHandler = JacksonTypeHandler.class)
    private List<String> tags;

    /**
     * 商品属性列表（JSON格式）
     * 示例：[{"label":"颜色","values":["白色","黑色"]},{"label":"尺码","values":["35","36"]}]
     * 使用 JacksonTypeHandler 自动处理 JSON 序列化和反序列化
     * 支持数组格式或对象格式
     */
    @Schema(description = "商品属性列表")
    @TableField(value = "attributes", typeHandler = JacksonTypeHandler.class)
    private Object attributes;

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
    private String isDeleted;

    /**
     * 所属租户
     */
    @Schema(description = "所属租户", hidden = true)
    @TableField("tenant_id")
    private Long tenantId;

    /**
     * 最低价格（冗余字段，从SKU计算得出）
     */
    @Schema(description = "最低价格")
    @TableField(exist = false, select = false)
    private BigDecimal minPrice;

    /**
     * 最高价格（冗余字段，从SKU计算得出）
     */
    @Schema(description = "最高价格")
    @TableField(exist = false, select = false)
    private BigDecimal maxPrice;

    /**
     * 总库存（冗余字段，从SKU计算得出）
     */
    @Schema(description = "总库存")
    @TableField(exist = false, select = false)
    private Integer totalStock;

    /**
     * SKU数量
     */
    @Schema(description = "SKU数量")
    @TableField(exist = false, select = false)
    private Integer skuCount;

    /**
     * 版本号（乐观锁）
     */
    @Version
    @Schema(description = "版本号（乐观锁）")
    private Integer version;
}