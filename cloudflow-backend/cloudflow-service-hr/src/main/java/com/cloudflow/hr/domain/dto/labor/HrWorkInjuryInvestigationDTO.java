package com.cloudflow.hr.domain.dto.labor;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

/**
 * 工伤调查记录新增/修改入参。
 */
@Data
@Schema(name = "HrWorkInjuryInvestigationDTO", description = "工伤调查记录入参")
public class HrWorkInjuryInvestigationDTO {

    @Schema(description = "调查人员工 ID")
    @NotNull(message = "调查人不能为空")
    private Long investigatorId;

    @Schema(description = "调查日期")
    @NotNull(message = "调查日期不能为空")
    private LocalDate investigationDate;

    @Schema(description = "现场照片附件 ID 列表")
    private List<String> scenePhotos;

    @Schema(description = "证人证言")
    @Size(max = 2048)
    private String witnessStatements;

    @Schema(description = "调查结论")
    @Size(max = 2048)
    private String conclusion;

    @Schema(description = "责任划分：EMPLOYEE/COMPANY/THIRD_PARTY/JOINT")
    @Size(max = 32)
    private String responsibilityType;
}
