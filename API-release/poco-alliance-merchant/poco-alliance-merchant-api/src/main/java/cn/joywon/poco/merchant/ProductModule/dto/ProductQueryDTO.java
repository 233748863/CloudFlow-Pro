
package cn.joywon.poco.merchant.ProductModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 商品查询DTO
 *
 * @author poco
 * @date 2025-01-01
 */
@Data
@Schema(description = "商品查询DTO")
public class ProductQueryDTO {

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
     * 商品名称（模糊查询）
     */
    @Schema(description = "商品名称（模糊查询）")
    private String name;

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
     * 商品标签（模糊查询）
     */
    @Schema(description = "商品标签（模糊查询）")
    private String tag;

    /**
     * 排序字段
     */
    @Schema(description = "排序字段", defaultValue = "updated_time")
    private String sortField = "updated_time";

    /**
     * 排序方向：ASC-升序，DESC-降序
     */
    @Schema(description = "排序方向：ASC-升序，DESC-降序", defaultValue = "DESC")
    private String sortOrder = "DESC";

    /**
     * 页码
     */
    @Schema(description = "页码", defaultValue = "1")
    private Integer pageNum = 1;

    /**
     * 每页大小
     */
    @Schema(description = "每页大小", defaultValue = "10")
    private Integer pageSize = 10;

    @Schema(description = "创建时间开始")
    private LocalDateTime createdStart;

    @Schema(description = "创建时间结束")
    private LocalDateTime createdEnd;
}