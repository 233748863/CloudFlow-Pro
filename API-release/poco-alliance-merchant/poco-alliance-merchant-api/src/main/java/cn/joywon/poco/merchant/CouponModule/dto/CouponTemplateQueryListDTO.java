package cn.joywon.poco.merchant.CouponModule.dto;

import cn.joywon.poco.merchant.Common.page.PageQueryDTO;
import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import cn.joywon.poco.merchant.CouponModule.definition.CouponTemplateEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "商家优惠券列表查询参数")
public class CouponTemplateQueryListDTO extends PageQueryDTO {

    @Schema(description = "优惠券名称")
    private String name;

    @Schema(description = "优惠券范围列表")
    private List<@Pattern(regexp = CouponTemplateEnum.COUPON_SCOPE_REGEX_PATTERN_MERCHANT,
            message = "无效的优惠券作用范围") String> scopes;

    @Schema(description = "优惠券类型列表")
    private List<@Pattern(regexp = CouponTemplateEnum.COUPON_TYPE_REGEX_PATTERN,
            message = "无效的优惠券类型") String> types;

    @Schema(description = "优惠券模板状态列表")
    private List<@Pattern(regexp = CouponStatusEnum.COUPON_TEMPLATE_STATUS_REGEX_PATTERN,
            message = "无效的优惠券模板状态") String> couponStatuses;

    @Schema(description = "优惠券有效期类型列表")
    private List<@Pattern(regexp = CouponTemplateEnum.COUPON_VALIDITY_TYPE_REGEX_PATTERN,
            message = "无效的优惠券有效期类型") String> validityTypes;

    @Schema(description = "是否按创建时间降序排序")
    private Boolean orderByCreateTimeDesc;

    @Schema(description = "是否查询被启用优惠券")
    private Boolean enable;

}