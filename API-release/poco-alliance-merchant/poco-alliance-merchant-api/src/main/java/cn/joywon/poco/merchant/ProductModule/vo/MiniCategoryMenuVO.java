package cn.joywon.poco.merchant.ProductModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "")
public class MiniCategoryMenuVO {

    @Schema(description = "商品分类ID")
    private Long categoryId;

    @Schema(description = "商品分类名称")
    private String categoryName;

    @Schema(description = "排序值")
    private Integer sortOrder;

}