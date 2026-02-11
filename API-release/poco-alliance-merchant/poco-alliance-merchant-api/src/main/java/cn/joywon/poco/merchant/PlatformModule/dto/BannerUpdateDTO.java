package cn.joywon.poco.merchant.PlatformModule.dto;

import cn.joywon.poco.merchant.PlatformModule.definition.BannerTypeEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDateTime;

@Data
@Schema(description = "轮播图修改参数")
public class BannerUpdateDTO {

    @NotBlank(message = "轮播图ID不能为空")
    @Schema(description = "轮播图ID")
    private String id;

    @Schema(description = "轮播图名称")
    private String imageName;

    @Schema(description = "轮播图摘要")
    private String summary;

    @Schema(description = "轮播图URL")
    private String imageUrl;

    @Schema(description = "跳转路径")
    private String routePath;

    @Pattern(regexp = BannerTypeEnum.BANNER_TYPE_REGEX_PATTERN, message = "无效的目标类型")
    @Schema(description = "目标类型: NOTICE-公告; COUPON-优惠券; PRODUCT-商品; STORE-门店; MERCHANT-商家; INDUSTRY-行业")
    private String targetType;

    @Schema(description = "跳转目标ID")
    private String targetId;

    @Schema(description = "背景颜色")
    private String bgColor;

    @Schema(description = "排序权重")
    private Integer sortWeight;

    @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @Schema(description = "展示开始时间")
    private LocalDateTime showStartTime;

    @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @Schema(description = "展示结束时间")
    private LocalDateTime showEndTime;

    @Schema(description = "是否启用")
    private Boolean enable;

}