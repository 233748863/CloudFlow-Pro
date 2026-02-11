package cn.joywon.poco.merchant.ReportModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

@Data
@Schema(description = "联合营销商家分润排名查询参数")
public class JointMarketingProfitRankDTO {

    @NotNull(message = "开始日期不能为空")
    @Schema(description = "查询开始日期")
    private LocalDate startDate;

    @NotNull(message = "结束日期不能为空")
    @Schema(description = "查询结束日期")
    private LocalDate endDate;

    @Schema(description = "联合营销计划ID")
    private String planId;

    @Schema(description = "排名数量限制")
    private Integer limit = 10;

    @Schema(description = "排名类型: TOTAL-总收益, MONTHLY-月收益, WEEKLY-周收益")
    private String rankType = "TOTAL";

    @Schema(description = "行业分类筛选")
    private String industryId;

    @Schema(description = "地区筛选")
    private String region;

    @Schema(description = "是否包含零收益商家")
    private Boolean includeZeroProfit = false;

}