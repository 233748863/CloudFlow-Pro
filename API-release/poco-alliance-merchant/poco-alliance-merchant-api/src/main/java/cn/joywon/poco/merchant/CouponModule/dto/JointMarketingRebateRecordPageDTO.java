package cn.joywon.poco.merchant.CouponModule.dto;

import cn.joywon.poco.merchant.Common.page.PageQueryDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDate;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "联合营销返利记录分页查询DTO")
public class JointMarketingRebateRecordPageDTO extends PageQueryDTO {

    @Schema(description = "计划ID")
    private Long planId;

    @Schema(description = "规则ID")
    private Long ruleId;

    @Schema(description = "状态: WAITING_VERIFY-待核销, PENDING_SETTLEMENT-待结算, SETTLED-已结算, CANCELLED-已取消")
    private String status;

    @Schema(description = "开始日期")
    private LocalDate startDate;

    @Schema(description = "结束日期")
    private LocalDate endDate;
}
