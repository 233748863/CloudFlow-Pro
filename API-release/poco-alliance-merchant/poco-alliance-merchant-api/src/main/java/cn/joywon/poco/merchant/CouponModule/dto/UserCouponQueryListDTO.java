package cn.joywon.poco.merchant.CouponModule.dto;

import cn.joywon.poco.merchant.Common.page.PageQueryDTO;
import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "用户优惠券列表查询参数")
public class UserCouponQueryListDTO extends PageQueryDTO {

    @Schema(description = "优惠券状态列表(UNUSED-未用, LOCKED-锁定, USED-已用, EXPIRED-过期)")
    @Pattern(regexp = CouponStatusEnum.USER_COUPON_STATUS_REGEX_PATTERN, message = "无效的优惠券状态")
    private String couponStatus;

}