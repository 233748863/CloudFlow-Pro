package cn.joywon.poco.merchant.MarketingModule.dto;

import cn.joywon.poco.merchant.Common.page.PageQueryDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "积分商城商品分类查询参数")
public class PointsMallCategoryQueryDTO extends PageQueryDTO {

    @Schema(description = "分类名称")
    private String name;

    @Schema(description = "层级深度")
    @Min(value = 0, message = "层级深度不能小于1")
    private Integer depth;

    @Schema(description = "父级分类名称(最高优先级)")
    private String parentName;

    @Schema(description = "是否热门分类")
    private Boolean hot;

    @Schema(description = "是否推荐分类")
    private Boolean recommend;

    @Schema(description = "分类启用状态")
    private Boolean enable;

}