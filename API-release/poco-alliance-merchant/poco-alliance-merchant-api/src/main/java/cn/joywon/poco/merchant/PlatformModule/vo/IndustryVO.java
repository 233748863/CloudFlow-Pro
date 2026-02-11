package cn.joywon.poco.merchant.PlatformModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "行业分类返回数据")
public class IndustryVO {

    @Schema(description = "行业分类ID")
    private Long id;

    @Schema(description = "行业分类名称")
    private String name;

    @Schema(description = "排序权重")
    private Integer weight;

    @Schema(description = "行业分类描述")
    private String description;

    @Schema(description = "是否启用")
    private Boolean enable;

}