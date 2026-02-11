package cn.joywon.poco.merchant.PlatformModule.vo;

import cn.joywon.poco.merchant.PlatformModule.definition.BannerTypeEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "轮播图列表返回数据")
public class BannerListVO {

    @Schema(description = "轮播图ID")
    private Long id;

    @Schema(description = "轮播图名称")
    private String imageName;

    @Schema(description = "轮播图图片url")
    private String imageUrl;

    @Schema(description = "轮播图背景颜色")
    private String bgColor;

    @Schema(description = "轮播图目标ID")
    private Long targetId;

    @Schema(description = "轮播图目标类型")
    private BannerTypeEnum targetType;

    @Schema(description = "轮播图跳转路径")
    private String routePath;

    @Schema(description = "轮播图排序权重")
    private Integer sortWeight;

    @Schema(description = "轮播图显示开始时间")
    private LocalDateTime showStartTime;

    @Schema(description = "轮播图显示结束时间")
    private LocalDateTime showEndTime;

    @Schema(description = "轮播图是否启用")
    private Boolean enable;

    @Schema(description = "轮播图创建时间")
    private LocalDateTime createdTime;

}