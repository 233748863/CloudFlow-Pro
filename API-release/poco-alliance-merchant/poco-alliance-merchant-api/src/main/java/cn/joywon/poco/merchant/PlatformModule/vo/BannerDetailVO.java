package cn.joywon.poco.merchant.PlatformModule.vo;

import cn.joywon.poco.merchant.PlatformModule.definition.BannerTypeEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "轮播图详情返回数据")
public class BannerDetailVO {

    @Schema(description = "轮播图ID")
    private Long id;

    @Schema(description = "轮播图名称")
    private String imageName;

    @Schema(description = "轮播图摘要")
    private String summary;

    @Schema(description = "目标类型")
    private BannerTypeEnum targetType;

    @Schema(description = "目标ID")
    private Long targetId;

    @Schema(description = "是否启用")
    private Boolean enable;

    @Schema(description = "轮播图权重")
    private Integer sortWeight;

    @Schema(description = "轮播图图片URL")
    private String imageUrl;

    @Schema(description = "跳转路径")
    private String routePath;

    @Schema(description = "背景颜色")
    private String bgColor;

    @Schema(description = "展示开始时间")
    private LocalDateTime showStartTime;

    @Schema(description = "展示结束时间")
    private LocalDateTime showEndTime;

    @Schema(description = "创建时间")
    private LocalDateTime createdTime;

}