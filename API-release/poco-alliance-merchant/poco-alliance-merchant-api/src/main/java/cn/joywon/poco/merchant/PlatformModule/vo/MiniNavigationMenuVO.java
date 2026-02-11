package cn.joywon.poco.merchant.PlatformModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "小程序导航菜单返回数据")
public class MiniNavigationMenuVO {

    @Schema(description = "导航菜单ID")
    private Long id;

    @Schema(description = "导航菜单名称")
    private String name;

    @Schema(description = "导航菜单目标ID")
    private Long targetId;

    @Schema(description = "导航菜单图片URL")
    private String imageUrl;

    @Schema(description = "子级导航菜单列表")
    private List<MiniNavigationMenuVO> child;

}