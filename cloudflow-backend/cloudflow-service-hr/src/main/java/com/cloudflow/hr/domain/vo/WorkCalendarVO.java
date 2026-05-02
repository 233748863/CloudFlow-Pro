package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
public class WorkCalendarVO {

    private Long id;

    private LocalDate calendarDate;

    private String dayType;

    private String dayTypeName;

    private String dayName;

    private String source;

    private Integer status;

    private String statusDesc;

    private LocalDateTime createTime;
}
