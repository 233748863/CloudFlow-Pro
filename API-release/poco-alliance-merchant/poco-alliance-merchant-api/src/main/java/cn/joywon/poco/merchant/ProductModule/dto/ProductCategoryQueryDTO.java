package cn.joywon.poco.merchant.ProductModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 商品分类查询条件
 */
@Data
@Schema(description = "商品分类查询DTO")
public class ProductCategoryQueryDTO {

    /** 父分类ID */
    @Schema(description = "父分类ID")
    private Long parentId;

    /** 分类名称（模糊查询） */
    @Schema(description = "分类名称（模糊查询）")
    private String name;

    /** 排序字段 */
    @Schema(description = "排序字段", defaultValue = "updated_time")
    private String sortField = "updated_time";

    /** 排序方向：ASC/DESC */
    @Schema(description = "排序方向：ASC/DESC", defaultValue = "DESC")
    private String sortOrder = "DESC";

    /** 页码 */
    @Schema(description = "页码", defaultValue = "1")
    private Integer pageNum = 1;

    /** 每页大小 */
    @Schema(description = "每页大小", defaultValue = "10")
    private Integer pageSize = 10;
}