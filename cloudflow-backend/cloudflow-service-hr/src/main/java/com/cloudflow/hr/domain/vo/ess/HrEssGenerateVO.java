package com.cloudflow.hr.domain.vo.ess;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * HR 月度生成结果 VO（工资条 / 福利明细共用）。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(name = "HrEssGenerateVO", description = "HR 月度生成结果 VO")
public class HrEssGenerateVO {
    @Schema(description = "工资 / 福利月份 yyyy-MM") private String periodMonth;
    @Schema(description = "本次新建记录数") private Integer created;
}
