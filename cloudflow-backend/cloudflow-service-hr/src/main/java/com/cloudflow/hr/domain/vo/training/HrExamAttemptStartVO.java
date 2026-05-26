package com.cloudflow.hr.domain.vo.training;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * HR 考试开始作答结果 VO。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(name = "HrExamAttemptStartVO", description = "HR 考试开始作答结果 VO")
public class HrExamAttemptStartVO {
    @Schema(description = "作答 ID") private Long attemptId;
}
