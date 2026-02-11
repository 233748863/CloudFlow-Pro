package cn.joywon.poco.merchant.ProductModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 商品分类更新请求参数
 */
@Data
@Schema(description = "商品分类更新DTO")
public class ProductCategoryUpdateDTO {

    /** 分类ID */
    @NotNull(message = "分类ID不能为空")
    @Schema(description = "分类ID", required = true)
    private Long id;

    /** 父分类ID */
    @Schema(description = "父分类ID")
    private Long parentId;

    /** 分类名称 */
    @Schema(description = "分类名称")
    private String name;

    /** 排序序号，值越大越靠后 */
    @Schema(description = "排序序号")
    private Integer sortOrder;
}