package com.cloudflow.hr.domain.dto.labor;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 工伤登记/修改入参。
 *
 * <p>剔除系统字段（id/tenantId/processInstanceId/determinedAt/determinedGrade/audit）。
 */
@Data
@Schema(name = "HrWorkInjuryDTO", description = "工伤登记/修改入参")
public class HrWorkInjuryDTO {

    @Schema(description = "工伤编号；不传由后端生成 WI-{timestamp}")
    @Size(max = 64)
    private String injuryNo;

    @Schema(description = "受伤员工 ID")
    @NotNull(message = "员工 ID 不能为空")
    private Long employeeId;

    @Schema(description = "发生时间")
    @NotNull(message = "发生时间不能为空")
    private LocalDateTime occurredAt;

    @Schema(description = "事故地点")
    @Size(max = 256)
    private String location;

    @Schema(description = "事件经过")
    @Size(max = 2048)
    private String eventDescription;

    @Schema(description = "受伤部位")
    @Size(max = 128)
    private String injuryPart;

    @Schema(description = "受伤等级：MINOR/MODERATE/SEVERE")
    @Size(max = 16)
    private String injuryLevel;

    @Schema(description = "状态：REPORTED/INVESTIGATING/DETERMINING/CLOSED；不传默认 REPORTED")
    @Size(max = 32)
    private String status;

    @Schema(description = "备注")
    @Size(max = 512)
    private String remark;
}
