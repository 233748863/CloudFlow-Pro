package com.cloudflow.hr.domain.vo.training;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * HR 考试提交结果 VO（含自动判分结果与状态）。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(name = "HrExamAttemptSubmitVO", description = "HR 考试提交结果 VO")
public class HrExamAttemptSubmitVO {
    @Schema(description = "作答 ID") private Long attemptId;
    @Schema(description = "状态 SUBMITTED/GRADED") private String status;
    @Schema(description = "客观题自动判分总分") private BigDecimal score;
    @Schema(description = "是否通过（仅在无主观题且 passScore 配置时返回）") private Boolean passFlag;
    @Schema(description = "是否含主观题") private Boolean hasSubjective;
}
