package cn.joywon.poco.merchant.CouponModule.dto;

import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
@Schema(description = "优惠券模板审核参数")
public class CouponTemplateAuditDTO {

    @NotNull(message = "优惠券模板ID不能为空")
    @Schema(description = "优惠券模板ID")
    private Long couponTemplateId;

    @NotBlank(message = "审核结果不能为空")
    @Pattern(regexp = CouponStatusEnum.COUPON_AUDIT_STATUS_REGEX_PATTERN, message = "无效的审核结果")
    @Schema(description = "审核结果")
    private String auditResult;

    @Schema(description = "审核备注")
    private String auditRemark;

}