package com.cloudflow.hr.domain.vo.labor;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 工伤调查记录 VO。
 */
@Data
@Schema(name = "HrWorkInjuryInvestigationVO", description = "工伤调查记录")
public class HrWorkInjuryInvestigationVO {

    private Long id;
    private Long injuryId;
    private Long investigatorId;
    private String investigatorName;
    private LocalDate investigationDate;
    private List<String> scenePhotos;
    private String witnessStatements;
    private String conclusion;
    private String responsibilityType;
    private LocalDateTime createTime;
}
