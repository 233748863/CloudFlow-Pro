package com.cloudflow.hr.domain.vo.performance;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * HR 绩效强制分布规则 VO（剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrPerfDistributionRuleVO", description = "HR 绩效强制分布规则 VO")
public class HrPerfDistributionRuleVO {
    @Schema(description = "规则 ID") private Long id;
    @Schema(description = "目标 ID（null = 全局规则）") private Long objectiveId;
    @Schema(description = "规则名称") private String ruleName;
    @Schema(description = "分布配置（每档 grade/percent/minCount/maxCount）") private List<Map<String, Object>> distribution;
    @Schema(description = "总人数（用于估算）") private Integer totalPopulation;
    @Schema(description = "强制模式（BLOCK/WARN）") private String enforceMode;
    @Schema(description = "状态") private String status;
    @Schema(description = "备注") private String remark;
    @Schema(description = "创建人") private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
