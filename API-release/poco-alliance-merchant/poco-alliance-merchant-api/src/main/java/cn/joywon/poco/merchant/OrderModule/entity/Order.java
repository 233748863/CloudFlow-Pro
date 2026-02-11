/*
 *    Copyright (c) 2018-2025, poco All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright
 * notice, this list of conditions and the following disclaimer in the
 * documentation and/or other materials provided with the distribution.
 * Neither the name of the pig4cloud.com developer nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 * Author: poco
 */

package cn.joywon.poco.merchant.OrderModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import cn.joywon.poco.common.core.util.TenantTable;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 订单主表
 *
 * @author poco
 * @date 2025-11-02
 */
@Data
@TenantTable
@TableName("orders")
@EqualsAndHashCode(callSuper = false)
@Schema(description = "订单主表")
public class Order {

    /**
     * 主键ID
     */
    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    /**
     * 订单号
     */
    @TableField("order_no")
    @Schema(description = "订单号")
    private String orderNo;

    /**
     * 下单用户ID
     */
    @TableField("user_id")
    @Schema(description = "下单用户ID")
    private Long userId;

    /**
     * 下单门店ID
     */
    @TableField("store_id")
    @Schema(description = "下单门店ID")
    private Long storeId;

    /**
     * 商家ID
     */
    @TableField("merchant_id")
    @Schema(description = "商家ID")
    private Long merchantId;

    /**
     * 使用的优惠券ID
     */
    @TableField("coupon_id")
    @Schema(description = "使用的优惠券ID")
    private Long couponId;

    /**
     * 订单状态: PENDING_PAYMENT 待支付, PAID 已支付, CANCELLED 已取消, COMPLETED 已完成, REFUNDING 退款中, REFUNDED 已退款
     */
    @TableField("status")
    @Schema(description = "订单状态")
    private String status;

    /**
     * 订单备注
     */
    @TableField("remark")
    @Schema(description = "订单备注")
    private String remark;

    /**
     * 商品总原价(元,2位小数)
     */
    @TableField("total_product_price")
    @Schema(description = "商品总原价(元)")
    private BigDecimal totalProductPrice;

    /**
     * 总优惠金额(元,2位小数)
     */
    @TableField("total_discount_amount")
    @Schema(description = "总优惠金额(元)")
    private BigDecimal totalDiscountAmount;

    /**
     * 优惠券优惠金额(元,2位小数)
     */
    @TableField("coupon_discount_amount")
    @Schema(description = "优惠券优惠金额(元)")
    private BigDecimal couponDiscountAmount;

    /**
     * 积分抵扣金额(元,2位小数)
     */
    @TableField("points_discount_amount")
    @Schema(description = "积分抵扣金额(元)")
    private BigDecimal pointsDiscountAmount;

    /**
     * 最终实付金额(元,2位小数)
     */
    @TableField("final_paid_price")
    @Schema(description = "最终实付金额(元)")
    private BigDecimal finalPaidPrice;

    /**
     * 乐观锁版本号
     */
    @Version
    @TableField("version")
    @Schema(description = "乐观锁版本号")
    private Long version;

    /**
     * 支付方式，如 WECHAT_PAY
     */
    @TableField("payment_method")
    @Schema(description = "支付方式")
    private String paymentMethod;

    /**
     * 支付时间
     */
    @TableField("payment_time")
    @Schema(description = "支付时间")
    private LocalDateTime paymentTime;

    /**
     * 完成时间
     */
    @TableField("completion_time")
    @Schema(description = "完成时间")
    private LocalDateTime completionTime;

    /**
     * 取消时间
     */
    @TableField("cancel_time")
    @Schema(description = "取消时间")
    private LocalDateTime cancelTime;

    /**
     * 取消原因
     */
    @TableField("cancel_reason")
    @Schema(description = "取消原因")
    private String cancelReason;

    /**
     * 订单过期时间(用于超时自动关单)
     */
    @TableField("expire_time")
    @Schema(description = "订单过期时间")
    private LocalDateTime expireTime;

    /**
     * 核销码
     */
    @TableField("verification_code")
    @Schema(description = "核销码")
    private String verificationCode;

    /**
     * 支付批次号(用于合并支付)
     */
    @TableField("pay_batch_no")
    @Schema(description = "支付批次号")
    private String payBatchNo;

    /**
     * 履约模式：IN_STORE(到店核销) / LOCAL_DELIVERY(本地配送)
     */
    @TableField(exist = false)
    @Schema(description = "履约模式：IN_STORE-到店核销，LOCAL_DELIVERY-本地配送")
    private String fulfillmentMode;

    /**
     * 分账状态: 0-无需分账 1-待分账 2-分账中 3-分账完成 4-分账失败
     */
    @TableField("profit_sharing_status")
    @Schema(description = "分账状态")
    private Integer profitSharingStatus;

    /**
     * 创建人ID
     */
    @TableField(value = "created_by", fill = FieldFill.INSERT)
    @Schema(description = "创建人ID")
    private Long createdBy;

    /**
     * 创建时间
     */
    @TableField(value = "created_time", fill = FieldFill.INSERT)
    @Schema(description = "创建时间")
    private LocalDateTime createdTime;

    /**
     * 修改人ID
     */
    @TableField(value = "updated_by", fill = FieldFill.INSERT_UPDATE)
    @Schema(description = "修改人ID")
    private Long updatedBy;

    /**
     * 修改时间
     */
    @TableField(value = "updated_time", fill = FieldFill.INSERT_UPDATE)
    @Schema(description = "修改时间")
    private LocalDateTime updatedTime;

    /**
     * 是否已删除(软删除)
     */
    @TableLogic
    @TableField("is_deleted")
    @Schema(description = "是否已删除")
    private Integer isDeleted;

    /**
     * 删除时间(软删除)
     */
    @TableField("deleted_time")
    @Schema(description = "删除时间")
    private LocalDateTime deletedTime;

    /**
     * 所属租户
     */
    @Schema(description = "所属租户", hidden = true)
    private Long tenantId;
}