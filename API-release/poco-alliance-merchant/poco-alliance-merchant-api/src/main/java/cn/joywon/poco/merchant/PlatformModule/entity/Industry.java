package cn.joywon.poco.merchant.PlatformModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 行业分类表实体
 */
@Data
@TableName("industries")
public class Industry implements Serializable {

    @Serial
    private static final long serialVersionUID = -7965224275933550011L;

    /**
     * ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 行业分类名称
     */
    private String name;

    /**
     * 排序权重
     */
    private Integer weight;

    /**
     * 行业分类描述
     */
    private String description;

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