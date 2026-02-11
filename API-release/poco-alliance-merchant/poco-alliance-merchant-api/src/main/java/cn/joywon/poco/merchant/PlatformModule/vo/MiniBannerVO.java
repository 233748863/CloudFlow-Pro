package cn.joywon.poco.merchant.PlatformModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "小程序首页轮播图返回数据")
public class MiniBannerVO {

    @Schema(description = "轮播图ID")
    private Long id;

    @Schema(description = "轮播图名称")
    private String imageName;

    @Schema(description = "轮播图摘要")
    private String summary;

    @Schema(description = "跳转目标ID")
    private Long targetId;

    @Schema(description = "跳转目标路径")
    private String routePath;

    @Schema(description = "轮播图图片URL")
    private String imageUrl;

    @Schema(description = "轮播图背景颜色")
    private String bgColor;

    @Schema(description = "轮播图排序权重")
    private Integer sortWeight;


}