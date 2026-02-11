package cn.joywon.poco.merchant.PlatformModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
@Schema(description = "小程序导航菜单更新参数")
public class NavigationMenuUpdateDTO {

    @Schema(description = "是否为平台级菜单")
    private Boolean platform;

    @NotBlank(message = "导航菜单ID不能为空")
    @Schema(description = "导航菜单ID")
    private String id;

    @Schema(description = "导航菜单名称")
    private String name;

    @Schema(description = "导航菜单目标ID")
    private String targetId;

    @Schema(description = "父级菜单ID")
    private String parentId;

    @Schema(description = "导航菜单图标URL")
    private String imageUrl;

    @Schema(description = "导航菜单排序")
    private Integer sortWeight;

    @Schema(description = "导航菜单是否启用")
    private Boolean enable;

}