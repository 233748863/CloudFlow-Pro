package cn.joywon.poco.merchant.CouponModule.dto;

import cn.joywon.poco.merchant.Common.page.PageQueryDTO;
import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import cn.joywon.poco.merchant.CouponModule.definition.CouponTemplateEnum;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDate;
import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "优惠券模板审核列表查询参数")
public class CouponTemplateAuditListDTO extends PageQueryDTO {

    @Schema(description = "优惠券模板名称")
    private String name;

    @Schema(description = "优惠券类型: CASH-满减/代金券, DISCOUNT-折扣券")
    private List<@Pattern(regexp = CouponTemplateEnum.COUPON_TYPE_REGEX_PATTERN,
            message = "无效的优惠券类型") String> type;

    @Schema(description = "优惠券模板审核状态: PENDING-待审核, ACTIVE-生效, REJECTED-拒绝, ALL_CLAIMED-被领完, CANCEL-作废")
    private List<@Pattern(regexp = CouponStatusEnum.COUPON_TEMPLATE_STATUS_REGEX_PATTERN,
            message = "无效的优惠券模板审核状态") String> couponStatus;

    @JsonFormat(pattern = "yyyy-MM-dd")
    @Schema(description = "查询开始时间")
    private LocalDate beginTime;

    @JsonFormat(pattern = "yyyy-MM-dd")
    @Schema(description = "查询结束时间")
    private LocalDate endTime;

    @Schema(description = "是否根据提交创建时间升序排序", defaultValue = "false")
    private Boolean orderByACreateTime = false;

}