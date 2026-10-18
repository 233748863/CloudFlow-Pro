package com.cloudflow.common.holiday.domain;

import java.time.LocalDate;

/** A dated assignment resolved with the same precedence as the single-day resolver. */
public record EmployeeCalendarDay(LocalDate attendanceDate, Long shiftId, Long calendarId) { }
