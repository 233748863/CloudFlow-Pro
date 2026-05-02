package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.time.LocalDate;

@Data
public class WorkCalendarQueryDTO {

    private LocalDate startDate;

    private LocalDate endDate;

    private String dayType;
}
