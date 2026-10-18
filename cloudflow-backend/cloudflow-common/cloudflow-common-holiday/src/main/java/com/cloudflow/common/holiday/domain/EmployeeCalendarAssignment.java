package com.cloudflow.common.holiday.domain;

import java.time.LocalDate;

public record EmployeeCalendarAssignment(LocalDate scheduleDate, LocalDate effectiveStart,
        LocalDate effectiveEnd, Long shiftId, Long calendarId) {
    public boolean includes(LocalDate date) {
        if (scheduleDate != null) return scheduleDate.equals(date);
        return effectiveStart != null && !date.isBefore(effectiveStart)
                && (effectiveEnd == null || !date.isAfter(effectiveEnd));
    }
}
