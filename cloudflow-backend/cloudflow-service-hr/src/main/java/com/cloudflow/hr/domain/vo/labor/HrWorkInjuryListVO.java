package com.cloudflow.hr.domain.vo.labor;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 工伤分页行 VO。字段精简，详细信息走详情接口。
 */
@Data
@Schema(name = "HrWorkInjuryListVO", description = "工伤分页行")
public class HrWorkInjuryListVO {

    private Long id;
    private String injuryNo;
    private Long employeeId;
    private String employeeName;
    private LocalDateTime occurredAt;
    private String injuryLevel;
    private String status;
    private LocalDateTime createTime;
}
