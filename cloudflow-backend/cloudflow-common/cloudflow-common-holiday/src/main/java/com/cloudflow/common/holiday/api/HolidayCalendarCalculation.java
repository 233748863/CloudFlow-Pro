package com.cloudflow.common.holiday.api;

import com.cloudflow.common.holiday.domain.DayTypeInfo;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** Calendar calculation data for one caller transaction; never retain across requests or tenants. */
public interface HolidayCalendarCalculation {
    DayTypeInfo getDateType(LocalDate date);
    BigDecimal calcLeaveDays(LocalDateTime start, LocalDateTime end, boolean includeHoliday);
    long calcWorkMinutes(LocalDateTime start, LocalDateTime end);
}
