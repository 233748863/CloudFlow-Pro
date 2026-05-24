package com.cloudflow.hr.domain.vo.labor;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 工伤康复跟踪记录 VO。
 */
@Data
@Schema(name = "HrWorkInjuryRehabilitationVO", description = "工伤康复跟踪记录")
public class HrWorkInjuryRehabilitationVO {

    private Long id;
    private Long injuryId;
    private LocalDate returnDate;
    private String positionAdjustment;
    private Long newPositionId;
    private String newPositionName;
    private String abilityAssessment;
    private LocalDate followUpAt;
    private String status;
    private LocalDateTime createTime;
}
