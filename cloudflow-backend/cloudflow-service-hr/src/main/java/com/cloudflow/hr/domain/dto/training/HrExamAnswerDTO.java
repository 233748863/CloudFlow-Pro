package com.cloudflow.hr.domain.dto.training;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 考试单题作答入参。
 *
 * <p>{@code answer} 字段对客观题为选项 key（如 "A" 或 "A,B"），对主观题为答案文本。
 */
@Data
@Schema(name = "HrExamAnswerDTO", description = "考试单题作答入参")
public class HrExamAnswerDTO {

    @Schema(description = "题目 ID")
    private Long questionId;

    @Schema(description = "答案 客观题为选项 key（A/B/C 或 A,B,C） 主观题为答案文本")
    private String answer;
}
