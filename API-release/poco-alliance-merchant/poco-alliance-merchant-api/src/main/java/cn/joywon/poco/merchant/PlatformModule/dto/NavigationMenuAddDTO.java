package cn.joywon.poco.merchant.PlatformModule.dto;

import cn.joywon.poco.merchant.PlatformModule.definition.NavigationMenuTypeEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
@Schema(description = "小程序导航栏菜单新增参数")
public class NavigationMenuAddDTO {

    @Schema(description = "是否平台菜单")
    private Boolean platform;

    @NotBlank(message = "菜单名称不能为空")
    @Schema(description = "菜单名称")
    private String name;

    @Schema(description = "目标ID")
    private String targetId;

    @Schema(description = "父级ID")
    private String parentId;

    @Pattern(regexp = NavigationMenuTypeEnum.MENU_TYPE_REGEX_PATTERN, message = "无效的菜单类型")
    @Schema(description = "菜单类型")
    private String type;

    @Schema(description = "菜单图标URL")
    private String imageUrl;

    @Schema(description = "排序权重")
    private Integer sortWeight;

    @Schema(description = "是否启用")
    private Boolean enable;

}