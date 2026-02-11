package cn.joywon.poco.merchant.CouponModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 优惠券核销记录实体
 */
@Data
@TableName("coupon_redeem_logs")
public class CouponRedeemLog {

    /**
     * 核销记录ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 用户ID
     */
    private Long userId;

    /**
     * 用户优惠券ID
     */
    private Long userCouponId;

    /**
     * 优惠券模板ID
     */
    private Long templateId;

    /**
     * 核销商家ID
     */
    private Long merchantId;

    /**
     * 优惠券原始发放商家ID
     */
    private Long issueMerchantId;

    /**
     * 关联订单ID
     */
    private Long usedOrderId;

    /**
     * 核销抵扣金额
     */
    private BigDecimal redeemAmount;

    /**
     * 核销时间
     */
    private LocalDateTime redeemTime;

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