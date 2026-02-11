package cn.joywon.poco.merchant.CouponModule.vo;

import cn.joywon.poco.merchant.Common.convert.CouponSerializer;
import cn.joywon.poco.merchant.Common.convert.TwoDecimalSerializer;
import cn.joywon.poco.merchant.CouponModule.definition.CouponTemplateEnum;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Schema(description = "首页门店列表中优惠券列表展示返回数据")
public class MiniCouponIndexShowVO {

    @Schema(description = "优惠券ID")
    private Long couponTemplateId;

    @Schema(description = "优惠券名称")
    private String couponName;

    @Schema(description = "优惠券logo")
    private String couponLogo;

    @Schema(description = "优惠券类型")
    private CouponTemplateEnum couponType;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "优惠券折扣金额", type = "string")
    private BigDecimal discountAmount;

    @JsonSerialize(using = CouponSerializer.DiscountSerializer.class)
    @Schema(description = "优惠券折扣率", type = "string")
    private BigDecimal discountRate;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "优惠券使用金额门槛")
    private BigDecimal minSpendAmount;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "优惠券最大可抵扣金额")
    private BigDecimal maxDeductibleAmount;

    @Schema(description = "优惠券已发放数量")
    private Integer issuedQuantity;

    @Schema(description = "优惠券可领取次数")
    private Integer receiveLimitPerUser;

    @Schema(description = "优惠券剩余可领取次数")
    private Integer remainingClaimable;

    @Schema(description = "是否可领取该优惠券")
    private Boolean claimable;

}