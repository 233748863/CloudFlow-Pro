package com.cloudflow.workflow.domain.monitor;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDate;

@Data
public class PerformanceDashboardContext {

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate startDate;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate endDate;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate compareStartDate;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate compareEndDate;

    private String processDefKey;

    private String processLabel;

    private Integer daySpan;
}
