package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class OvertimeStatisticsVO {

    private Long employeeId;

    private String employeeName;

    private String employeeNo;

    private Integer year;

    private Integer month;

    private BigDecimal workdayHours;

    private BigDecimal weekendHours;

    private BigDecimal holidayHours;

    private BigDecimal totalHours;

    private BigDecimal timeOffHours;

    private Integer overtimeCount;
}
