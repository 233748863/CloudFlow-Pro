package cn.joywon.poco.merchant.ProductModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

/**
 * 商品属性DTO
 * 用于描述商品的规格属性，如颜色、尺码等
 *
 * @author poco
 * @date 2025-01-22
 */
@Data
@Schema(description = "商品属性DTO")
public class ProductAttributeDTO {

    /**
     * 属性标签名称，如：颜色、尺码、材质等
     */
    @Schema(description = "属性标签名称", example = "颜色")
    private String label;

    /**
     * 属性值列表，如：["白色", "黑色"]
     */
    @Schema(description = "属性值列表", example = "[\"白色\", \"黑色\"]")
    private List<String> values;
}
