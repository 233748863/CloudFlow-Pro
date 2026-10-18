package com.cloudflow.common.holiday.api;

import java.time.LocalDate;

/**
 * 员工日历归属解析器。
 */
public interface HolidayCalendarResolver {
    Long resolveCalendarId(Long employeeId, LocalDate date);
}
