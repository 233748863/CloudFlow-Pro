
package cn.joywon.poco.merchant.ProductModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import lombok.Data;

import java.math.BigDecimal;
import java.util.Map;

/**
 * 商品SKU更新DTO
 *
 * @author poco
 * @date 2025-01-01
 */
@Data
@Schema(description = "商品SKU更新DTO")
public class ProductSkuUpdateDTO {

    /**
     * SKU ID
     */
    @Schema(description = "SKU ID")
    private Long id;

    /**
     * SKU名称
     */
    @Schema(description = "SKU名称")
    private String skuName;

    /**
     * SKU编码
     */
    @Schema(description = "SKU编码")
    private String skuCode;

    /**
     * 价格
     */
    @DecimalMin(value = "0.01", message = "价格必须大于0")
    @Schema(description = "价格")
    private BigDecimal price;

    /**
     * 原价
     */
    @Schema(description = "原价")
    private BigDecimal originalPrice;

    /**
     * 库存数量
     */
    @Min(value = 0, message = "库存数量不能小于0")
    @Schema(description = "库存数量")
    private Integer stock;

    /**
     * 预警库存
     */
    @Schema(description = "预警库存")
    private Integer warningStock;

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
    @Schema(description = "重量（克）")
    private Integer weight;

    /**
     * 体积（立方厘米）
     */
    @Schema(description = "体积（立方厘米）")
    private Integer volume;

    /**
     * 营销配置
     */
    @Schema(description = "营销配置")
    private String marketingConfig;

    /**
     * 是否启用：0-禁用，1-启用
     */
    @Schema(description = "是否启用：0-禁用，1-启用")
    private String enabled;

    /**
     * 排序权重
     */
    @Schema(description = "排序权重")
    private Integer sortWeight;

    /**
     * 版本号（乐观锁）
     */
    @Schema(description = "版本号（乐观锁）")
    private Integer version;
}