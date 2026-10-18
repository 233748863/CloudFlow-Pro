package com.cloudflow.auth.domain.dto;

import lombok.Data;

import java.time.LocalDate;

/**
 * 日期例外项。
 */
@Data
public class HolidayDateItemDTO {
    private LocalDate holidayDate;
    private String dateType;
    private String holidayName;
    private Integer triplePayFlag;
    private String remark;
}
