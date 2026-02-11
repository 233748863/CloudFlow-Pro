
package cn.joywon.poco.merchant.ProductModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.Map;

/**
 * 商品SKU创建DTO
 *
 * @author poco
 * @date 2025-01-01
 */
@Data
@Schema(description = "商品SKU创建DTO")
public class ProductSkuCreateDTO {

    /**
     * SKU名称
     */
    @NotBlank(message = "SKU名称不能为空")
    @Schema(description = "SKU名称", required = true)
    private String skuName;

    /**
     * SKU编码
     */
    @Schema(description = "SKU编码")
    private String skuCode;

    /**
     * 价格
     */
    @NotNull(message = "价格不能为空")
    @DecimalMin(value = "0.01", message = "价格必须大于0")
    @Schema(description = "价格", required = true)
    private BigDecimal price;

    /**
     * 原价
     */
    @Schema(description = "原价")
    private BigDecimal originalPrice;

    /**
     * 库存数量
     */
    @NotNull(message = "库存数量不能为空")
    @Min(value = 0, message = "库存数量不能小于0")
    @Schema(description = "库存数量", required = true)
    private Integer stock;

    /**
     * 预警库存
     */
    @Schema(description = "预警库存", defaultValue = "0")
    private Integer warningStock = 0;

    /**
     * SKU规格属性
     * 前端传递格式：{"属性1": "属性值1", "属性2": "属性值2"}
     * 数据库存储格式：JSON字符串
     */
    @Schema(description = "SKU规格属性", example = "{\"颜色\": \"红色\", \"尺码\": \"L\"}")
    private Map<String, String> specAttributes;

    /**
     * SKU图片
     */
    @Schema(description = "SKU图片")
    private String skuImage;

    /**
     * 重量（克）
     */
    @Schema(description = "重量（克）", defaultValue = "0")
    private Integer weight = 0;

    /**
     * 体积（立方厘米）
     */
    @Schema(description = "体积（立方厘米）", defaultValue = "0")
    private Integer volume = 0;

    /**
     * 营销配置
     */
    @Schema(description = "营销配置")
    private String marketingConfig;

    /**
     * 是否启用：0-禁用，1-启用
     */
    @Schema(description = "是否启用：0-禁用，1-启用", defaultValue = "1")
    private String enabled = "1";

    /**
     * 排序权重
     */
    @Schema(description = "排序权重", defaultValue = "0")
    private Integer sortWeight = 0;

    /**
     * 商品ID
     */
    @Schema(description = "商品ID")
    private Long productId;
}