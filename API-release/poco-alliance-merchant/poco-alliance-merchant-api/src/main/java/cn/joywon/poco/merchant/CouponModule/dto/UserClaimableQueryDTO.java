package cn.joywon.poco.merchant.CouponModule.dto;

import cn.joywon.poco.merchant.Common.page.CursorQueryDTO;
import cn.joywon.poco.merchant.CouponModule.definition.CouponTemplateEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
public class UserClaimableQueryDTO extends CursorQueryDTO {

    @Schema(description = "行业ID")
    private String industryId;

    @Schema(description = "区域编码(用于用户查询区域可用优惠券, 优先级大于经纬度)")
    private Long regionCode;

    @Schema(description = "优惠券类型: CASH-满减/代金; DISCOUNT-折扣")
    private List<@Pattern(regexp = CouponTemplateEnum.COUPON_TYPE_REGEX_PATTERN,
            message = "无效的优惠券类型") String> types;

}