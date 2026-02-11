package cn.joywon.poco.merchant.CouponModule.bo;

import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import cn.joywon.poco.merchant.CouponModule.definition.CouponTemplateEnum;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
// 优惠券审核详情临时数据
public class CouponTemplateAuditDetailBO {

    // 优惠券模板ID
    private Long couponTemplateId;

    // 优惠券模板名称
    private String name;

    // 优惠券模板简介
    private String summary;

    // 优惠券详细描述
    private String description;

    // 优惠券logo图片URL
    private String couponLogoUrl;

    // 优惠券所属商家ID
    private Long merchantId;

    // 优惠券所属商家名称
    private String merchantName;

    // 优惠券所属商家logo图片URL
    private String merchantLogoUrl;

    // 优惠券使用范围
    private CouponTemplateEnum scope;

    // JSON格式可用门店ID列表
    private String applicableStores;

    // JSON格式可用商品ID列表
    private String applicableSkus;

    // 优惠券类型
    private CouponTemplateEnum type;

    // 优惠券折扣率
    private BigDecimal discountRate;

    // 优惠券面额
    private BigDecimal discountAmount;

    // 优惠券使用金额门槛
    private BigDecimal minSpendAmount;

    // 优惠券发放总量
    private Integer totalQuantity;

    // 优惠券用户领取上限
    private Integer receiveLimitPerUser;

    // 优惠券有效期类型
    private CouponTemplateEnum validityType;

    // 优惠券生效时间
    private LocalDateTime validStartTime;

    // 优惠券失效时间
    private LocalDateTime validEndTime;

    // 优惠券有效天数
    private Integer validDaysFromReceive;

    // 优惠券审核状态
    private CouponStatusEnum auditStatus;

    // 优惠券审核时间
    private LocalDateTime auditTime;

    // 审核备注
    private String auditRemark;

    // 优惠券审核人ID
    private Long auditId;

    // 优惠券创建时间
    private LocalDateTime createdTime;

    // 是否被平台启用
    private Boolean enable;

}