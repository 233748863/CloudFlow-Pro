package cn.joywon.poco.merchant.PlatformModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
@Schema(description = "导航菜单查询参数")
public class NavigationMenuGetDTO {

    @NotBlank(message = "导航菜单ID不能为空")
    @Schema(description = "导航菜单ID")
    private String id;

    @Schema(description = "是否为平台级菜单")
    private Boolean platform;

}