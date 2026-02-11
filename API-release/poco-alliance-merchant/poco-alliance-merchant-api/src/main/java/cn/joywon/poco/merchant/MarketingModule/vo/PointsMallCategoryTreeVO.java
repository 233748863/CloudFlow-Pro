package cn.joywon.poco.merchant.MarketingModule.vo;

import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallCategoryTargetAudience;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "积分商城商品分类树形结构返回数据")
public class PointsMallCategoryTreeVO {

    @Schema(description = "分类ID")
    private Long id;

    @Schema(description = "层级深度")
    private Integer depth;

    @Schema(description = "父级分类ID")
    private Long parentId;

    @Schema(description = "分类名称")
    private String name;

    @Schema(description = "分类图标URL")
    private String icon;

    @Schema(description = "分类横幅URL")
    private String bannerImage;

    @Schema(description = "分类描述")
    private String description;

    @Schema(description = "排序序号(数值越小越靠前)")
    private Integer sortOrder;

    @Schema(description = "是否热门分类")
    private Boolean hot;

    @Schema(description = "是否推荐分类")
    private Boolean recommend;

    @Schema(description = "是否启用分类")
    private Boolean enable;

    @Schema(description = "分类下商品数量")
    private Integer productCount;

    @Schema(description = "分类目标用户配置")
    private PointsMallCategoryTargetAudience targetAudiences;

    @Schema(description = "子级分类")
    private List<PointsMallCategoryTreeVO> children;

}