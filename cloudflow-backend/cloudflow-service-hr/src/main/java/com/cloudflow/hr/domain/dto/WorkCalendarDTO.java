package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

@Data
public class WorkCalendarDTO {

    @NotNull(message = "日期不能为空")
    private LocalDate calendarDate;

    @NotBlank(message = "日期类型不能为空")
    private String dayType;

    private String dayName;

    private String source;

    private Integer status;
}
