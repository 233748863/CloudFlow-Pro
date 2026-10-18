package com.cloudflow.auth.domain.vo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

/**
 * 日期类型展示对象。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DayTypeVO {
    private LocalDate date;
    private String dateType;
    private String holidayName;
    private Integer triplePayFlag;
}
