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
@Schema(description = "用户优惠券列表返回数据")
public class UserCouponCollectedListVO {

    @Schema(description = "用户优惠券ID")
    private Long couponId;

    @Schema(description = "优惠券模板ID")
    private Long couponTemplateId;

    @Schema(description = "优惠券名称")
    private String name;

    @Schema(description = "优惠券简介")
    private String summary;

    @Schema(description = "优惠券logoURL")
    private String logoUrl;

    @Schema(description = "发放商家ID")
    private Long merchantId;

    @Schema(description = "发放商家名称")
    private String merchantName;

    @Schema(description = "发放商家logoURL")
    private String merchantLogoUrl;

    @Schema(description = "优惠券类型")
    private CouponTemplateEnum type;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "使用优惠券消费金额门槛")
    private BigDecimal minSpendAmount;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "优惠券折扣金额")
    private BigDecimal discountAmount;

    @JsonSerialize(using = CouponSerializer.CouponConversionRateSerializer.class)
    @Schema(description = "优惠券折扣比例")
    private BigDecimal discountRate;

    @Schema(description = "优惠券使用状态")
    private CouponStatusEnum couponStatus;

    @Schema(description = "优惠券有效期类型")
    private CouponTemplateEnum validityType;

    @Schema(description = "优惠券使用范围")
    private CouponTemplateEnum scope;

    @JsonSerialize(using = DateTimeToDateSerializer.class)
    @Schema(description = "优惠券生效时间")
    private LocalDateTime validStartTime;

    @JsonSerialize(using = DateTimeToDateSerializer.class)
    @Schema(description = "优惠券失效时间")
    private LocalDateTime validEndTime;

}