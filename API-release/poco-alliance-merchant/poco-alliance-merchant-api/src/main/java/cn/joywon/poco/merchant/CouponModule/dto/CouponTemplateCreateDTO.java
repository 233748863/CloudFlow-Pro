package cn.joywon.poco.merchant.CouponModule.dto;

import cn.joywon.poco.merchant.CouponModule.definition.CouponTemplateEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@Schema(description = "优惠券模板创建参数")
public class CouponTemplateCreateDTO {

    @NotBlank(message = "优惠券名称不能为空")
    @Schema(description = "优惠券名称")
    private String name;

    @Schema(description = "优惠券简介")
    private String summary;

    @Schema(description = "优惠券详细描述")
    private String description;

    @Schema(description = "优惠券logoURL")
    private String logoUrl;

    @Schema(description = "优惠券所属商户ID, 0为平台券")
    private Long merchantId;

    @NotBlank(message = "优惠券类型不能为空")
    @Pattern(regexp = CouponTemplateEnum.COUPON_TYPE_REGEX_PATTERN, message = "无效的优惠券类型")
    @Schema(description = "优惠券类型: CASH-满减/代金; DISCOUNT-折扣")
    private String type;

    @NotBlank(message = "优惠券作用范围不能为空")
    @Pattern(regexp = CouponTemplateEnum.COUPON_SCOPE_REGEX_PATTERN_MERCHANT, message = "无效的优惠券作用范围")
    @Schema(description = "优惠券作用范围: GLOBAL-全平台; MERCHANT_OWN-商家自身; STORE-门店")
    private String scope;

    @Schema(description = "折扣金额(元, 保留两位小数), type = CASH 时有效")
    private BigDecimal discountAmount;

    @DecimalMin(value = "0.01", message = "折扣率不能小于0.01")
    @DecimalMax(value = "1.00", message = "折扣率不能大于1.00")
    @Schema(description = "折扣率(0.00-1.00), type = DISCOUNT 时有效")
    private BigDecimal discountRate;

    @DecimalMin(value = "0.01", message = "最低消费金额门槛不能小于0.01")
    @Schema(description = "最低消费金额门槛(元, 保留两位小数)")
    private BigDecimal minSpendAmount;

    @DecimalMin(value = "0.01", message = "最大可抵扣金额不能小于0.01")
    @Schema(description = "最大可抵扣金额(元, 保留两位小数)")
    private BigDecimal maxDeductibleAmount;

    @Min(value = -1, message = "优惠券发放总量不能小于-1")
    @Schema(description = "优惠券发放总量, -1为不限量")
    private Integer totalQuantity;

    @NotBlank(message = "优惠券有效期类型不能为空")
    @Pattern(regexp = CouponTemplateEnum.COUPON_VALIDITY_TYPE_REGEX_PATTERN, message = "无效的优惠券有效期类型")
    @Schema(description = "优惠券有效期类型: DYNAMIC_DAYS-领取后生效; FIXED_DATE_RANGE-固定日期范围")
    private String validityType;

    @Schema(description = "优惠券生效开始时间, validityType = FIXED_DATE_RANGE 时必填")
    private LocalDateTime validStartTime;

    @Schema(description = "优惠券生效结束时间, validityType = FIXED_DATE_RANGE 时必填")
    private LocalDateTime validEndTime;

    @Schema(description = "优惠券领取后有效天数, validityType = DYNAMIC_DAYS 时必填")
    private Integer validDaysFromReceive;

    @Schema(description = "每个用户领取优惠券的上限, 默认为1")
    private Integer receiveLimitPerUser;

    @Schema(description = "优惠券可用门店ID列表")
    private List<Long> storeIds;

    @Schema(description = "优惠券可用skuID列表")
    private List<Long> skuIds;

}