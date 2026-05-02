package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Data
public class EffectiveAttendanceRuleVO {

    private Long ruleId;

    private String ruleName;

    private String ruleType;

    private String sourceType;

    private Long sourceTargetId;

    private String sourceTargetName;

    private Long shiftId;

    private String shiftName;

    private LocalTime checkInTime;

    private LocalTime checkOutTime;

    private Integer breakMinutes;

    private Integer lateThreshold;

    private Integer earlyThreshold;

    private Integer severeLateMinutes;

    private Integer absentMinutes;

    private Boolean overtimeEnabled;

    private Integer overtimeMinMinutes;

    private Boolean photoRequired;

    private Integer radius;

    private List<String> checkMethods;

    private String dayType;

    private String dayName;

    private LocalDate effectiveDate;
}
