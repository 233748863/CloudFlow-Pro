package cn.joywon.poco.merchant.PlatformModule.entity;

import cn.joywon.poco.merchant.PlatformModule.definition.NavigationMenuTypeEnum;
import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("navigation_menu")
public class NavigationMenu {

    /**
     * 主键ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 菜单名称
     */
    private String name;

    /**
     * 商家ID(0表示平台)
     */
    private Long merchantId;

    /**
     * 目标ID
     */
    private Long targetId;

    /**
     * 父级菜单ID
     */
    private Long parentId;

    /**
     * 菜单深度(1为顶部菜单)
     */
    private Integer depth;

    /**
     * 菜单类型
     */
    private NavigationMenuTypeEnum type;

    /**
     * 菜单图标URL
     */
    private String imageUrl;

    /**
     * 排序权重
     */
    private Integer sortWeight;

    /**
     * 是否启用
     */
    @TableField("is_enable")
    private Boolean enable;

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
     * 更新人ID
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Long updatedBy;

    /**
     * 更新时间
     */
    private LocalDateTime updatedTime;

    /**
     * 删除标记
     */
    @TableField("is_deleted")
    @TableLogic(value = "false", delval = "true")
    private Boolean deleted;

    /**
     * 删除时间
     */
    private LocalDateTime deletedTime;

}