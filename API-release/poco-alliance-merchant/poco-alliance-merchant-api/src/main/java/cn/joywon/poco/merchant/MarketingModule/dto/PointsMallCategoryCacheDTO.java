package cn.joywon.poco.merchant.MarketingModule.dto;

import lombok.Data;

@Data
public class PointsMallCategoryCacheDTO {

    // 分类ID
    private Long id;

    // 层级深度
    private Integer depth;

    // 父级分类ID
    private Long parentId;

    // 分类名称
    private String name;

    // 分类图标
    private String icon;

    // 分类横幅图片
    private String bannerImage;

    // 是否是热门分类
    private Boolean hot;

    // 是否推荐分类
    private Boolean recommend;

    // 分类描述
    private String description;

    // 分类目标用户配置
    private PointsMallCategoryTargetAudience targetAudiences;

    // 分类排序序号(数值越小越靠前)
    private Integer sortOrder;

}