package com.cloudflow.hr.domain.vo.training;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * HR 培训班次状态变更结果 VO。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(name = "HrTrainingSessionStatusVO", description = "HR 培训班次状态变更结果 VO")
public class HrTrainingSessionStatusVO {
    @Schema(description = "变更后的状态") private String status;
}
