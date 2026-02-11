package cn.joywon.poco.merchant.CouponModule.entity;

import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用户优惠券表实体
 */
@Data
@TableName("user_coupons")
public class UserCoupon {

    /**
     * 用户优惠券ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 优惠券码
     */
    private String couponCode;

    /**
     * 用户ID
     */
    private Long userId;

    /**
     * 优惠券模板ID
     */
    private Long templateId;

    /**
     * 优惠券发起商家ID
     */
    private Long issueMerchantId;

    /**
     * 来源类型 (e.g. JOINT_MARKETING)
     */
    private String sourceType;

    /**
     * 来源ID (e.g. ruleId)
     */
    private Long sourceId;

    /**
     * 优惠券使用状态
     * UNUSED(未用), LOCKED(锁定), USED(已用), EXPIRED(过期)
     */
    private CouponStatusEnum couponStatus;

    /**
     * 优惠券生效时间
     */
    private LocalDateTime validStartTime;

    /**
     * 优惠券失效时间
     */
    private LocalDateTime validEndTime;

    /**
     * 使用该优惠券的订单ID
     */
    private Long usedOrderId;

    /**
     * 关联退款订单ID
     */
    private Long refundOrderId;

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