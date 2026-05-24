package com.cloudflow.hr.domain.dto.labor;

import com.cloudflow.common.core.domain.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * 工伤分页/列表查询入参。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(name = "HrWorkInjuryQueryDTO", description = "工伤分页查询入参")
public class HrWorkInjuryQueryDTO extends PageQuery {

    @Schema(description = "工伤编号 模糊匹配")
    private String injuryNo;

    @Schema(description = "员工 ID")
    private Long employeeId;

    @Schema(description = "状态：REPORTED/INVESTIGATING/DETERMINING/CLOSED")
    private String status;

    @Schema(description = "受伤等级：MINOR/MODERATE/SEVERE")
    private String injuryLevel;

    @Schema(description = "发生时间起")
    private LocalDateTime occurredFrom;

    @Schema(description = "发生时间止")
    private LocalDateTime occurredTo;
}
