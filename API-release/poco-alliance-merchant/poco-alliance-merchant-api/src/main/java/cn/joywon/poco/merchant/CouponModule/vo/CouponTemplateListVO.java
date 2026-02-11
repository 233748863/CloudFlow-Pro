package cn.joywon.poco.merchant.CouponModule.vo;

import cn.joywon.poco.merchant.Common.convert.CouponSerializer;
import cn.joywon.poco.merchant.Common.convert.TwoDecimalSerializer;
import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import cn.joywon.poco.merchant.CouponModule.definition.CouponTemplateEnum;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Schema(description = "商家查询优惠券列表返回数据")
public class CouponTemplateListVO {

    @Schema(description = "优惠券模板ID")
    private Long couponTemplateId;

    @Schema(description = "优惠券名称")
    private String name;

    @Schema(description = "优惠券适用范围")
    private CouponTemplateEnum scope;

    @Schema(description = "优惠券类型")
    private CouponTemplateEnum type;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "优惠券使用消费金额门槛")
    private BigDecimal minSpendAmount;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "优惠券折扣金额")
    private BigDecimal discountAmount;

    @JsonSerialize(using = CouponSerializer.DiscountSerializer.class)
    @Schema(description = "优惠券折扣率")
    private BigDecimal discountRate;

    @Schema(description = "优惠券发放总量")
    private Integer totalQuantity;

    @Schema(description = "优惠券有效期类型")
    private CouponTemplateEnum validityType;

    @Schema(description = "优惠券模板状态")
    private CouponStatusEnum couponStatus;

    @Schema(description = "是否被平台启用")
    private Boolean enable;

    @Schema(description = "优惠券模板创建时间")
    private LocalDateTime createdTime;

}