package com.cloudflow.common.holiday.domain;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

/**
 * 日期类型及加班倍率信息。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DayTypeInfo {
    private LocalDate date;
    private String dateType;
    private String holidayName;
    private Integer triplePayFlag;
}
