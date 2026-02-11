package cn.joywon.poco.merchant.PlatformModule.entity;

import cn.joywon.poco.merchant.PlatformModule.definition.BannerTypeEnum;
import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 小程序轮播图表实体
 */
@Data
@TableName("mini_banner")
public class MiniBanner {

    /**
     * 主键ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 图片名称
     */
    private String imageName;

    /**
     * 图片URL
     */
    private String imageUrl;

    /**
     * 跳转路径
     */
    private String routePath;

    /**
     * 目标类型
     */
    private BannerTypeEnum targetType;

    /**
     * 目标ID
     */
    private Long targetId;

    /**
     * 排序权重
     */
    private Integer sortWeight;

    /**
     * 背景颜色
     */
    private String bgColor;

    /**
     * 展示开始时间
     */
    private LocalDateTime showStartTime;

    /**
     * 展示结束时间
     */
    private LocalDateTime showEndTime;

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
    @TableField(fill = FieldFill.UPDATE)
    private LocalDateTime deletedTime;

}