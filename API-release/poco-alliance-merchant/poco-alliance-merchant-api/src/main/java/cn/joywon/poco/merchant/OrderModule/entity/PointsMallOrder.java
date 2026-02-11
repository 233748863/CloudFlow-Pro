package cn.joywon.poco.merchant.OrderModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("points_mall_orders")
public class PointsMallOrder {

    /**
     * 主键ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 用户ID
     */
    private Long userId;

    /**
     * 积分商城商品ID
     */
    private Long mallProductId;

    /**
     * 订单状态
     */
    private String orderStatus;

    /**
     * 发货信息(JSON格式)
     */
    private String shippingInfo;

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
    @TableLogic(value = "true", delval = "true")
    private Boolean deleted;

    /**
     * 删除时间
     */
    private LocalDateTime deletedTime;

}