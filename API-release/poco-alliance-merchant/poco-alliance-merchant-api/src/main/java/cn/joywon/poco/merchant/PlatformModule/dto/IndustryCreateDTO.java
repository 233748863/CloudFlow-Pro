package cn.joywon.poco.merchant.PlatformModule.dto;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
@Schema(description = "行业分类新增参数")
public class IndustryCreateDTO {

    @NotBlank(message = "行业分类名称不能为空")
    @Parameter(description = "行业分类名称")
    private String name;

    @Schema(description = "排序权重")
    private Integer weight;

    @Schema(description = "行业分类描述")
    private String description;

    @Schema(description = "是否启用")
    private Boolean enable;

}