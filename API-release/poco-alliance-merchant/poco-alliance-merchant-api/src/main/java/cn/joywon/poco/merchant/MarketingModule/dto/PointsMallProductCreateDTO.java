package cn.joywon.poco.merchant.MarketingModule.dto;

import cn.joywon.poco.merchant.MarketingModule.definition.PointsMallProductEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
@Schema(description = "积分商城商品创建参数")
public class PointsMallProductCreateDTO {

    @Schema(description = "商品名称")
    @NotBlank(message = "商品名称不能为空")
    private String name;

    @Schema(description = "商品分类ID")
    @NotBlank(message = "商品分类ID不能为空")
    private String categoryId;

    @Schema(description = "商品类型")
    @NotBlank(message = "商品类型不能为空")
    @Pattern(regexp = PointsMallProductEnum.PRODUCT_TYPE_REGEX_PATTERN, message = "无效的商品类型")
    private String type;

    @Schema(description = "商品主图URL")
    @NotBlank(message = "商品主图不能为空")
    private String mainImage;

    @Schema(description = "商品图片URL列表")
    @Size(max = 20, message = "商品图片数量不能超过20张")
    private List<String> images;

    @Schema(description = "商品描述")
    private String description;

    @Schema(description = "兑换所需积分")
    @NotNull
    @Min(value = 0, message = "兑换所需积分不能小于0")
    private Integer pointsCost;

    @Schema(description = "商品售价金额")
    @DecimalMin(value = "0.0", message = "售价金额不能小于0.0")
    private BigDecimal cashPrice;

    @Schema(description = "商品库存")
    @Min(value = -1, message = "库存不能小于-1")
    private Integer stock;

    @Schema(description = "关联的优惠券模板ID")
    private String couponId;

    @Schema(description = "商品排序序号(越小越靠前)")
    @Min(value = 0, message = "排序序号不能小于0")
    @Max(value = 9999, message = "排序序号不能大于9999")
    private Integer orderSort;

}