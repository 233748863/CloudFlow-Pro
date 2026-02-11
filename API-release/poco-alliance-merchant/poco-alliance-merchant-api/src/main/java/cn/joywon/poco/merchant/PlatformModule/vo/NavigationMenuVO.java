package cn.joywon.poco.merchant.PlatformModule.vo;

import cn.joywon.poco.merchant.PlatformModule.definition.NavigationMenuTypeEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "小程序导航菜单列表返回数据")
public class NavigationMenuVO {

    @Schema(description = "导航菜单ID")
    private Long id;

    @Schema(description = "导航菜单名称")
    private String name;

    @Schema(description = "父级菜单ID")
    private Long parentId;

    @Schema(description = "父级菜单名称")
    private String parentName;

    @Schema(description = "菜单深度")
    private Integer depth;

    @Schema(description = "菜单类型")
    private NavigationMenuTypeEnum type;

    @Schema(description = "目标ID")
    private String targetId;

    @Schema(description = "菜单图标URL")
    private String imageUrl;

    @Schema(description = "排序权重")
    private Integer sortWeight;

    @Schema(description = "是否启用")
    private Boolean enable;

    @Schema(description = "创建时间")
    private LocalDateTime createdTime;

}