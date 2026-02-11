package cn.joywon.poco.merchant.CouponModule.vo;

import cn.joywon.poco.merchant.Common.convert.CouponSerializer;
import cn.joywon.poco.merchant.Common.convert.TwoDecimalSerializer;
import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import cn.joywon.poco.merchant.CouponModule.definition.CouponTemplateEnum;
import cn.joywon.poco.merchant.MerchantModule.vo.StoreSimpleInfoVO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductSkuSimpleInfoVO;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@Schema(description = "优惠券审核详情返回数据")
public class CouponTemplateAuditDetailVO {

    @Schema(description = "优惠券模板ID")
    private Long couponTemplateId;

    @Schema(description = "优惠券模板名称")
    private String name;

    @Schema(description = "优惠券模板简介")
    private String summary;

    @Schema(description = "优惠券详细描述")
    private String description;

    @Schema(description = "优惠券logo图片URL")
    private String couponLogoUrl;

    @Schema(description = "优惠券所属商家ID")
    private Long merchantId;

    @Schema(description = "优惠券所属商家名称")
    private String merchantName;

    @Schema(description = "商户logo图片URL")
    private String merchantLogoUrl;

    @Schema(description = "优惠券使用范围")
    private CouponTemplateEnum scope;

    @Schema(description = "可用门店列表")
    private List<StoreSimpleInfoVO> availableStores;

    @Schema(description = "可用商品列表")
    private List<ProductSkuSimpleInfoVO> availableSkus;

    @Schema(description = "优惠券类型")
    private CouponTemplateEnum type;

    @JsonSerialize(using = CouponSerializer.DiscountSerializer.class)
    @Schema(description = "优惠券折扣率")
    private BigDecimal discountRate;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "优惠券面额")
    private BigDecimal discountAmount;

    @JsonSerialize(using = TwoDecimalSerializer.class)
    @Schema(description = "优惠券使用金额门槛")
    private BigDecimal minSpendAmount;

    @JsonSerialize(using = CouponSerializer.CouponTotalQuantitySerializer.class)
    @Schema(description = "优惠券发放总量")
    private Integer totalQuantity;

    @Schema(description = "优惠券用户领取上限")
    private Integer receiveLimitPerUser;

    @Schema(description = "优惠券有效期类型")
    private CouponTemplateEnum validityType;

    @Schema(description = "优惠券生效时间")
    private LocalDateTime validStartTime;

    @Schema(description = "优惠券失效时间")
    private LocalDateTime validEndTime;

    @Schema(description = "优惠券有效天数")
    private Integer validDaysFromReceive;

    @Schema(description = "优惠券模板状态")
    private CouponStatusEnum couponStatus;

    @Schema(description = "优惠券审核时间")
    private LocalDateTime auditTime;

    @Schema(description = "审核备注")
    private String auditRemark;

    @Schema(description = "优惠券审核人ID")
    private Long auditId;

    @Schema(description = "优惠券审核人名称")
    private String auditName;

    @Schema(description = "优惠券创建时间")
    private LocalDateTime createdTime;

    @Schema(description = "是否被平台启用")
    private Boolean enable;

}