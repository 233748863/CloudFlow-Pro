package com.cloudflow.hr.domain.vo.labor;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 工伤详情 VO。
 *
 * <p>剔除 deleted/version/audit 字段，对外仅暴露业务字段。
 */
@Data
@Schema(name = "HrWorkInjuryVO", description = "工伤详情")
public class HrWorkInjuryVO {

    private Long id;
    private String injuryNo;
    private Long employeeId;
    private String employeeName;
    private LocalDateTime occurredAt;
    private String location;
    private String eventDescription;
    private String injuryPart;
    private String injuryLevel;
    private String status;
    private String processInstanceId;
    private LocalDateTime determinedAt;
    private Integer determinedGrade;
    private String remark;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
