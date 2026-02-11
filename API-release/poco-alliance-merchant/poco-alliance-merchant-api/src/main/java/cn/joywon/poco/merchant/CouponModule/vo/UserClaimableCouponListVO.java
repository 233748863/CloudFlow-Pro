package cn.joywon.poco.merchant.CouponModule.vo;

import cn.joywon.poco.merchant.Common.convert.CouponSerializer;
import cn.joywon.poco.merchant.Common.convert.DateTimeToDateSerializer;
import cn.joywon.poco.merchant.Common.convert.TwoDecimalSerializer;
import cn.joywon.poco.merchant.CouponModule.definition.CouponTemplateEnum;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Schema(description = "用户可领取优惠券列表返回数据")
public class UserClaimableCouponListVO {

    @Schema(description = "优惠券模板ID")
    private Long couponTemplateId;

    @Schema(description = "优惠券模板名称")
    private String couponName;

    @Schema(description = "优惠券简介")
    private String summary;

    @Schema(description = "优惠券logo")
    private String couponLogoUrl;

    @Schema(description = "优惠券使用范围")
    private CouponTemplateEnum scope;

    @Schema(description = "优惠券类型")
    private CouponTemplateEnum type;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "优惠券折扣金额")
    private BigDecimal discountAmount;

    @JsonSerialize(using = CouponSerializer.DiscountSerializer.class)
    @Schema(description = "优惠券折扣率")
    private BigDecimal discountRate;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "优惠券使用金额门槛")
    private BigDecimal minSpendAmount;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "优惠券最大可抵扣金额")
    private BigDecimal maxDeductibleAmount;

    @Schema(description = "优惠券有效期类型")
    private CouponTemplateEnum validityType;

    @JsonSerialize(using = DateTimeToDateSerializer.class)
    @Schema(description = "优惠券生效开始时间")
    private LocalDateTime validStartTime;

    @JsonSerialize(using = DateTimeToDateSerializer.class)
    @Schema(description = "优惠券生效结束时间")
    private LocalDateTime validEndTime;

    @Schema(description = "优惠券生效天数")
    private Integer validDaysFromReceive;

    @Schema(description = "优惠券可领取次数")
    private Integer receiveLimitPerUser;

    @Schema(description = "优惠券所属商户名称")
    private String merchantName;

    @Schema(description = "优惠券所属商户logo")
    private String merchantLogoUrl;

    @Schema(description = "优惠券剩余可领取次数")
    private Integer remainingClaimable;

    @Schema(description = "是否可领取该优惠券")
    private Boolean claimable;

}