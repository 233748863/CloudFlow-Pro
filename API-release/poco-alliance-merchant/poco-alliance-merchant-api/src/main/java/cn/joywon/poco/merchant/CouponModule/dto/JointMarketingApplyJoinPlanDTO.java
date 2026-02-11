package cn.joywon.poco.merchant.CouponModule.dto;


import cn.joywon.poco.merchant.Common.page.PageQueryDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "可加入的联合营销计划列表查询参数")
public class JointMarketingApplyJoinPlanDTO extends PageQueryDTO {

    @Schema(description = "联合营销计划名称(模糊搜索, 最高优先级)")
    private String planName;

    @Schema(description = "地区编码列表")
    private List<Long> regionCodes;

    @Schema(description = "行业分类ID列表")
    private List<String> industryIds;

    @Schema(description = "商家ID列表(次优先级)")
    private List<String> merchantIds;

}