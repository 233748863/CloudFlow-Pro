package cn.joywon.poco.merchant.PlatformModule.dto;

import cn.joywon.poco.merchant.Common.page.PageQueryDTO;
import cn.joywon.poco.merchant.PlatformModule.definition.NavigationMenuTypeEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "小程序导航菜单查询参数")
public class NavigationMenuQueryDTO extends PageQueryDTO {

    @Schema(description = "菜单名称")
    private String name;

    @Pattern(regexp = NavigationMenuTypeEnum.MENU_TYPE_REGEX_PATTERN, message = "无效的菜单类型")
    @Schema(description = "菜单类型")
    private String type;

    @Schema(description = "菜单深度")
    @Min(value = 1, message = "菜单深度不能小于1")
    private Integer depth;

    @Schema(description = "商家ID(0表示平台)")
    private String merchantId;

    @Schema(description = "是否查询启用的菜单")
    private Boolean enable;

    @Schema(description = "是否按权重升序排序")
    private Boolean sortByWeight;

    @Schema(description = "是否按深度升序排序")
    private Boolean sortByDepth;

    @Schema(description = "是否按创建时间升序排序")
    private Boolean sortByCreatedTime;

}