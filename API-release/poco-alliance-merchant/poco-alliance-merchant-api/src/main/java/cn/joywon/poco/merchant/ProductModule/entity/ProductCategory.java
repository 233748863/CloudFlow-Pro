package cn.joywon.poco.merchant.ProductModule.entity;

import cn.joywon.poco.common.core.util.TenantTable;
import com.baomidou.mybatisplus.annotation.*;
import com.baomidou.mybatisplus.extension.activerecord.Model;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * 商品分类实体
 * 对应表：product_categories
 */
@Data
@TableName("product_categories")
@EqualsAndHashCode(callSuper = true)
@Schema(description = "商品分类表")
public class ProductCategory extends Model<ProductCategory> {

    @TableId(type = IdType.ASSIGN_ID)
    /* 分类ID */
    private Long id;

    /** 父分类ID */
    @TableField("parent_id")
    private Long parentId;

    /** 分类名称 */
    @TableField("name")
    private String name;

    @TableField("sort_order")
    /* 排序序号，值越大越靠后 */
    private Integer sortOrder;

    @TableField(value = "created_by", fill = FieldFill.INSERT)
    /* 创建人ID */
    private String createdBy;

    @TableField(value = "created_time", fill = FieldFill.INSERT)
    /* 创建时间 */
    private LocalDateTime createdTime;

    @TableField(value = "updated_by", fill = FieldFill.INSERT_UPDATE)
    /* 修改人ID */
    private String updatedBy;

    @TableField(value = "updated_time", fill = FieldFill.INSERT_UPDATE)
    /* 修改时间 */
    private LocalDateTime updatedTime;

    @TableField(value = "is_deleted", fill = FieldFill.INSERT)
    @TableLogic
    /* 是否已删除(软删除)：0-正常，1-已删除 */
    private String isDeleted;

    @TableField("deleted_time")
    /** 删除时间(软删除) */
    private LocalDateTime deletedTime;
}