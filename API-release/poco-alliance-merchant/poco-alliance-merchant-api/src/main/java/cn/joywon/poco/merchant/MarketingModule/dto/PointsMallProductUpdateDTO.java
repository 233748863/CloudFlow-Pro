package cn.joywon.poco.merchant.MarketingModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
@Schema(description = "积分商城商品更新参数")
public class PointsMallProductUpdateDTO {

    @Schema(description = "商品ID")
    @NotBlank(message = "商品ID不能为空")
    private String id;

    @Schema(description = "商品分类ID")
    private String categoryId;

    @Schema(description = "商品名称")
    private String name;

    @Schema(description = "商品主图URL")
    private String mainImage;

    @Schema(description = "商品图片URL列表")
    @Size(max = 20, message = "商品图片数量不能超过20张")
    private List<String> images;

    @Schema(description = "商品描述")
    private String description;

    @Schema(description = "兑换所需积分")
    @Min(value = 0, message = "兑换所需积分不能小于0")
    private Integer pointsCost;

    @Schema(description = "商品售价金额")
    @DecimalMin(value = "0.0", message = "售价金额不能小于0.0")
    private BigDecimal cashPrice;

    @Schema(description = "关联的优惠券模板ID")
    private String couponId;

    @Schema(description = "商品排序序号(越小越靠前)")
    private Integer orderSort;

}