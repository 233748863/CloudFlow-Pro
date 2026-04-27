package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.time.LocalDate;

@Data
public class PerformanceObjectiveQueryDTO {

    private String keyword;

    private String status;

    private LocalDate cycleStartDate;

    private LocalDate cycleEndDate;

    private Integer pageNum = 1;

    private Integer pageSize = 10;
}
