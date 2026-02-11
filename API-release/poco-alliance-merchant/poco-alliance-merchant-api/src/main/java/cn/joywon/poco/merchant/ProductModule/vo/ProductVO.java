

package cn.joywon.poco.merchant.ProductModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 商品VO
 *
 * @author poco
 * @date 2025-11-01
 */
@Data
@Schema(description = "商品VO")
public class ProductVO {

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
     * 商品分类名称
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
     * 商品类型描述
     */
    @Schema(description = "商品类型描述")
    private String typeDesc;

    /**
     * 商品状态：DRAFT-草稿，PUBLISHED-已发布，ARCHIVED-已归档
     */
    @Schema(description = "商品状态：DRAFT-草稿，PUBLISHED-已发布，ARCHIVED-已归档")
    private String status;

    /**
     * 商品状态描述
     */
    @Schema(description = "商品状态描述")
    private String statusDesc;

    /**
     * 商品主图
     */
    @Schema(description = "商品主图")
    private String mainImage;

    /**
     * 商品详情图片
     */
    @Schema(description = "商品详情图片")
    private List<String> detailImages;

    /**
     * 商品详情描述（JSON格式）
     * 支持纯文本格式：{"type": "text", "content": "描述内容"}
     * 支持团购清单格式：{"type": "group_buying", "description": "说明", "items": [...]}
     * 也支持数组格式：["描述1", "描述2"]
     */
    @Schema(description = "商品详情描述（JSON格式）")
    private Object detailDescription;

    /**
     * 商品标签
     */
    @Schema(description = "商品标签")
    private List<String> tags;

    /**
     * 商品属性列表（JSON格式）
     * 示例：[{"label":"颜色","values":["白色","黑色"]},{"label":"尺码","values":["35","36"]}]
     * 支持数组格式或对象格式
     */
    @Schema(description = "商品属性列表")
    private Object attributes;

    /**
     * 排序权重
     */
    @Schema(description = "排序权重")
    private Integer sortWeight;

    @Schema(description = "总销量")
    private Integer totalSales;

    /**
     * SKU列表
     */
    @Schema(description = "SKU列表")
    private List<ProductSkuVO> skus;

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
     * 版本号(乐观锁)
     */
    @Schema(description = "版本号(乐观锁)")
    private Integer version;
}