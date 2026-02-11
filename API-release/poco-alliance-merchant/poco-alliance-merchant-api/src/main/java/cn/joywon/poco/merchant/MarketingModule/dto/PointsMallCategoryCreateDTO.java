package cn.joywon.poco.merchant.MarketingModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
@Schema(description = "积分商城商品分类新增参数")
public class PointsMallCategoryCreateDTO {

    @Schema(description = "父级分类ID")
    private String parentId;

    @Schema(description = "分类名称")
    @NotBlank(message = "分类名称不能为空")
    private String name;

    @Schema(description = "分类图标URL")
    private String icon;

    @Schema(description = "分类横幅图URL")
    private String bannerImage;

    @Schema(description = "分类描述")
    @Size(max = 255, message = "分类描述控制在255字以内")
    private String description;

    @Schema(description = "排序序号")
    private Integer sortOrder;

    @Schema(description = "是否热门分类")
    private Boolean hot;

    @Schema(description = "是否推荐分类")
    private Boolean recommend;

    @Schema(description = "是否启用")
    private Boolean enable;

    @Schema(description = "目标用户配置")
    private PointsMallCategoryTargetAudience targetAudiences;

}