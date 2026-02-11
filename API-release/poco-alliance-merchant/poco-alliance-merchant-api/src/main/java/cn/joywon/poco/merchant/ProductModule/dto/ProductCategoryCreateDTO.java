package cn.joywon.poco.merchant.ProductModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 商品分类创建请求参数
 */
@Data
@Schema(description = "商品分类创建DTO")
public class ProductCategoryCreateDTO {

    /** 父分类ID */
    @Schema(description = "父分类ID")
    private Long parentId;

    /** 分类名称 */
    @NotBlank(message = "分类名称不能为空")
    @Schema(description = "分类名称", required = true)
    private String name;

    /** 排序序号，值越大越靠后 */
    @Schema(description = "排序序号", defaultValue = "0")
    private Integer sortOrder = 0;
}