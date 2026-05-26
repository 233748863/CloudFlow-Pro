package com.cloudflow.hr.domain.vo.performance;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * HR 绩效强制分布校验结果 VO。
 */
@Data
@Schema(name = "HrPerfDistributionValidateVO", description = "HR 绩效强制分布校验结果 VO")
public class HrPerfDistributionValidateVO {
    @Schema(description = "总样本数") private Integer total;
    @Schema(description = "按等级分桶计数") private Map<String, Integer> countsByGrade;
    @Schema(description = "是否通过（BLOCK 模式有 violations 即 false；WARN 模式始终 true）") private Boolean valid;
    @Schema(description = "是否命中规则") private Boolean hasRule;
    @Schema(description = "命中规则 ID") private Long ruleId;
    @Schema(description = "命中规则名称") private String ruleName;
    @Schema(description = "强制模式（BLOCK/WARN）") private String enforceMode;
    @Schema(description = "按等级配额（含 percent/expectedMax/minAllowed/maxAllowed/actual）") private Map<String, Map<String, Object>> quotaByGrade;
    @Schema(description = "违规项列表（OVER/UNDER + 详情）") private List<Map<String, Object>> violations;
}
