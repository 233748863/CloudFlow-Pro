package com.cloudflow.hr.domain.dto.training;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import lombok.Data;

import java.util.List;

/**
 * 考试提交答卷入参。
 */
@Data
@Schema(name = "HrExamAttemptSubmitDTO", description = "考试提交答卷入参")
public class HrExamAttemptSubmitDTO {

    @Schema(description = "答案列表")
    @Valid
    private List<HrExamAnswerDTO> answers;
}
