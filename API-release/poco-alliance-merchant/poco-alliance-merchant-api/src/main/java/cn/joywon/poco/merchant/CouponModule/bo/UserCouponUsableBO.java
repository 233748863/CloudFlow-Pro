package cn.joywon.poco.merchant.CouponModule.bo;

import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import cn.joywon.poco.merchant.CouponModule.definition.CouponTemplateEnum;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
// 用户可用优惠券临时数据
public class UserCouponUsableBO {

    // 用户优惠券ID
    private Long couponId;

    // 发放商家ID
    private Long merchantId;

    // 优惠券模板ID
    private Long couponTemplateId;

    // 优惠券状态
    private CouponStatusEnum couponStatus;

    // 优惠券生效时间
    private LocalDateTime validStartTime;

    // 优惠券失效时间
    private LocalDateTime validEndTime;

    // 优惠券名称
    private String name;

    // 优惠券简介
    private String summary;

    // 优惠券最大抵扣金额
    private BigDecimal maxDeductibleAmount;

    // 优惠券使用金额门槛
    private BigDecimal minSpendAmount;

    // 优惠券折扣金额
    private BigDecimal discountAmount;

    // 优惠券折扣率
    private BigDecimal discountRate;

    // 优惠券使用范围
    private CouponTemplateEnum scope;

    // 优惠券类型
    private CouponTemplateEnum type;

    // 优惠券领取时间
    private LocalDateTime receivedTime;

    // 优惠券是否可用
    private Boolean usable;

    // 优惠券不可用原因
    private String unusableReason;

    // 优惠券适用门店ID列表
    private String applicableStores;

    // 优惠券适用商品ID列表
    private String applicableSkus;

}