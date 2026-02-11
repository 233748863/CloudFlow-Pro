package cn.joywon.poco.merchant.MarketingModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("points_mall_categories")
public class PointsMallCategory {

    /**
     * 主键ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 层级深度
     */
    private Integer depth;

    /**
     * 父级ID
     */
    private Long parentId;

    /**
     * 分类名称
     */
    private String name;

    /**
     * 分类图标URL
     */
    private String icon;

    /**
     * 分类横幅URL
     */
    private String bannerImage;

    /**
     * 分类描述
     */
    private String description;

    /**
     * 排序序号
     */
    private Integer sortOrder;

    /**
     * 目标用户配置(JSON格式)
     * {"min_level": 1, "max_level": 5, "user_types": ["NEW_USER", "VIP"]}
     */
    private String targetAudience;

    /**
     * 是否热门分类
     */
    @TableField(value = "is_hot")
    private Boolean hot;

    /**
     * 是否推荐分类
     */
    @TableField(value = "is_recommend")
    private Boolean recommend;

    /**
     * 是否启用
     */
    @TableField(value = "is_enable")
    private Boolean enable;

    /**
     * 分类下商品数量
     */
    private Integer productCount;

    /**
     * 创建人ID
     */
    @TableField(fill = FieldFill.INSERT)
    private Long createdBy;

    /**
     * 创建时间
     */
    private LocalDateTime createdTime;

    /**
     * 修改人ID
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Long updatedBy;

    /**
     * 修改时间
     */
    private LocalDateTime updatedTime;

    /**
     * 删除标识
     */
    @TableField("is_deleted")
    @TableLogic(value = "0", delval = "1")
    private Boolean deleted;

    /**
     * 删除时间
     */
    private LocalDateTime deletedTime;

    /**
     * 目标用户配置
     */
    @Data
    public static class TargetAudience {

        /**
         * 最小等级可见
         */
        private Integer min_level;

        /**
         * 最大等级可见
         */
        private Integer max_level;

        /**
         * 用户类型可见
         */
        private String user_type;

    }

}