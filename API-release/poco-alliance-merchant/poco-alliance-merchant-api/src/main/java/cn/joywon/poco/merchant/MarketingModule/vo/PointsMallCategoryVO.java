package cn.joywon.poco.merchant.MarketingModule.vo;

import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallCategoryTargetAudience;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "积分商城商品分类返回数据")
public class PointsMallCategoryVO {

    @Schema(description = "分类ID")
    private Long id;

    @Schema(description = "层级深度")
    private Integer depth;

    @Schema(description = "父级分类ID")
    private Long parentId;

    @Schema(description = "父级分类名称")
    private String parentName;

    @Schema(description = "分类名称")
    private String name;

    @Schema(description = "图标URL")
    private String icon;

    @Schema(description = "横幅图片URL")
    private String bannerImage;

    @Schema(description = "分类描述")
    private String description;

    @Schema(description = "排序序号(数值越小越靠前)")
    private Integer sortOrder;

    @Schema(description = "是否热门分类")
    private Boolean hot;

    @Schema(description = "是否推荐分类")
    private Boolean recommend;

    @Schema(description = "创建时间")
    private LocalDateTime createdTime;

    @Schema(description = "分类目标用户配置")
    private PointsMallCategoryTargetAudience targetAudiences;

}