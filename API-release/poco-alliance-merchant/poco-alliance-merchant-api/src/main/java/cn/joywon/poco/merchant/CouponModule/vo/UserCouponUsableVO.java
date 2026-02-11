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
@Schema(description = "用户可用优惠券返回数据")
public class UserCouponUsableVO {

    @Schema(description = "用户优惠券ID")
    private Long couponId;

    @Schema(description = "优惠券模板ID")
    private Long couponTemplateId;

    @Schema(description = "优惠券使用状态")
    private CouponStatusEnum couponStatus;

    @JsonSerialize(using = DateTimeToDateSerializer.class)
    @Schema(description = "优惠券生效时间")
    private LocalDateTime validStartTime;

    @JsonSerialize(using = DateTimeToDateSerializer.class)
    @Schema(description = "优惠券失效时间")
    private LocalDateTime validEndTime;

    @Schema(description = "优惠券名称")
    private String name;

    @Schema(description = "优惠券简介")
    private String summary;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "优惠券使用金额门槛")
    private BigDecimal minSpendAmount;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "优惠券最大可抵扣金额")
    private BigDecimal maxDeductibleAmount;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "优惠券折扣金额")
    private BigDecimal discountAmount;

    @JsonSerialize(using = CouponSerializer.DiscountSerializer.class)
    @Schema(description = "优惠券折扣率")
    private BigDecimal discountRate;

    @Schema(description = "优惠券使用范围")
    private CouponTemplateEnum scope;

    @Schema(description = "优惠券类型")
    private CouponTemplateEnum type;

    @Schema(description = "优惠券领取时间")
    private LocalDateTime receivedTime;

    @Schema(description = "优惠券是否可用")
    private Boolean usable;

    @Schema(description = "优惠券不可用原因")
    private String unusableReason;

}