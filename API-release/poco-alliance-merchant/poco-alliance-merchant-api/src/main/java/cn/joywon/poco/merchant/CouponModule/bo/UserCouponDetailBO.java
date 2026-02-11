package cn.joywon.poco.merchant.CouponModule.bo;

import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import cn.joywon.poco.merchant.CouponModule.definition.CouponTemplateEnum;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
// 用户优惠券详情临时数据
public class UserCouponDetailBO {

    // 用户优惠券ID
    private Long couponId;

    // 优惠券模板ID
    private Long templateId;

    // 优惠券名称
    private String name;

    // 优惠券简介
    private String summary;

    // 优惠券详细描述
    private String description;

    // 优惠券logoURL
    private String logoUrl;

    // 发放商家ID
    private Long merchantId;

    // 发放商家名称
    private String merchantName;

    // 发放商家logoURL
    private String merchantLogoUrl;

    // 优惠券类型
    private CouponTemplateEnum type;

    // 使用优惠券消费金额门槛
    private BigDecimal minSpendAmount;

    // 优惠券折扣金额
    private BigDecimal discountAmount;

    // 优惠券折扣比例
    private BigDecimal discountRate;

    // 优惠券使用状态
    private CouponStatusEnum couponStatus;

    // 优惠券生效时间
    private LocalDateTime validStartTime;

    // 优惠券失效时间
    private LocalDateTime validEndTime;

    // 优惠券领取时间
    private LocalDateTime receivedTime;

    // JSON格式可用门店ID
    private String applicableStores;

    // JSON格式可用商品ID
    private String applicableSkus;

}