package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
public class ScheduleRuleAssignmentVO {

    private Long id;

    private Long ruleId;

    private String targetType;

    private Long targetId;

    private String targetName;

    private LocalDate effectiveStart;

    private LocalDate effectiveEnd;

    private Integer status;

    private String statusDesc;

    private LocalDateTime createTime;
}
