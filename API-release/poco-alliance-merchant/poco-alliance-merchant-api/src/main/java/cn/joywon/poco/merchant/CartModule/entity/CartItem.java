package cn.joywon.poco.merchant.CartModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 购物车实体
 *
 * @author poco
 * @date 2024-12-25
 */
@Data
@TableName("cart_items")
public class CartItem implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键ID
     */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 用户ID (关联 users.id 或 app_user.user_id)
     */
    @TableField("user_id")
    private Long userId;

    /**
     * 商家ID
     */
    @TableField("merchant_id")
    private Long merchantId;

    /**
     * 商品ID (SPU)
     */
    @TableField("product_id")
    private Long productId;

    /**
     * SKU ID
     */
    @TableField("sku_id")
    private Long skuId;

    /**
     * 购买数量
     */
    @TableField("quantity")
    private Integer quantity;

    /**
     * 创建人ID
     */
    @TableField(value = "created_by", fill = FieldFill.INSERT)
    private Long createdBy;

    /**
     * 创建时间
     */
    @TableField(value = "created_time", fill = FieldFill.INSERT)
    private LocalDateTime createdTime;

    /**
     * 修改人ID
     */
    @TableField(value = "updated_by", fill = FieldFill.INSERT_UPDATE)
    private Long updatedBy;

    /**
     * 修改时间
     */
    @TableField(value = "updated_time", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedTime;

    /**
     * 是否已删除(软删除)
     */
    @TableField("is_deleted")
    @TableLogic
    private Integer isDeleted;

    /**
     * 删除时间(软删除)
     */
    @TableField("deleted_time")
    private LocalDateTime deletedTime;

    /**
     * 租户ID
     */
    @TableField("tenant_id")
    private Long tenantId;
}
