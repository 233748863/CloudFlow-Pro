package cn.joywon.poco.merchant.CouponModule.vo;

import cn.joywon.poco.merchant.Common.convert.CouponSerializer;
import cn.joywon.poco.merchant.Common.convert.DateTimeToDateSerializer;
import cn.joywon.poco.merchant.Common.convert.TwoDecimalSerializer;
import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import cn.joywon.poco.merchant.CouponModule.definition.CouponTemplateEnum;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class UserCouponCodeVO {

    @Schema(description = "用户优惠券ID")
    private Long couponId;

    @Schema(description = "用户优惠券码")
    private String couponCode;

    @Schema(description = "优惠券名称")
    private String name;

    @Schema(description = "优惠券简介")
    private String summary;

    @Schema(description = "优惠券类型")
    private CouponTemplateEnum type;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "优惠券折扣金额", type = "string")
    private BigDecimal discountAmount;

    @JsonSerialize(using = CouponSerializer.DiscountSerializer.class)
    @Schema(description = "优惠券折扣率", type = "string")
    private BigDecimal discountRate;

    @Schema(description = "优惠券状态")
    private CouponStatusEnum couponStatus;

    @Schema(description = "用户优惠券状态")
    private CouponStatusEnum userCouponStatus;

    @JsonSerialize(using = DateTimeToDateSerializer.class)
    @Schema(description = "优惠券生效开始时间")
    private LocalDateTime validStartTime;

    @JsonSerialize(using = DateTimeToDateSerializer.class)
    @Schema(description = "优惠券生效结束时间")
    private LocalDateTime validEndTime;

    @Schema(description = "优惠券领取时间")
    private LocalDateTime receivedTime;

}