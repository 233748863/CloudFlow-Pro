package com.cloudflow.common.holiday.api;

import com.cloudflow.common.holiday.domain.DayTypeInfo;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 工作日与假期计算服务。
 */
public interface HolidayCalendarService extends HolidayCalendarResolver {
    boolean isWorkday(Long calendarId, LocalDate date);
    int countWorkdays(Long calendarId, LocalDate start, LocalDate end);
    BigDecimal calcLeaveDays(Long calendarId, LocalDateTime start, LocalDateTime end, boolean includeHoliday);
    long calcWorkMinutes(Long calendarId, LocalDateTime start, LocalDateTime end);
    LocalDate nextWorkday(Long calendarId, LocalDate from, int n);
    DayTypeInfo getDateType(Long calendarId, LocalDate date);
    EmployeeCalendarCalculationBatch getEmployeeCalculationBatch(Long employeeId, java.util.List<LocalDate> dates);
    default java.util.Map<LocalDate, DayTypeInfo> getEmployeeDateTypes(Long employeeId, java.util.List<LocalDate> dates) {
        java.util.Map<LocalDate, DayTypeInfo> result = new java.util.LinkedHashMap<>();
        for (LocalDate date : dates) result.put(date, getDateType(resolveCalendarId(employeeId, date), date));
        return result;
    }
    default java.util.Map<LocalDate, HolidayCalendarCalculation> getEmployeeCalculations(Long employeeId, java.util.List<LocalDate> dates) {
        java.util.Map<LocalDate, HolidayCalendarCalculation> result = new java.util.LinkedHashMap<>();
        HolidayCalendarService service = this;
        for (LocalDate date : dates) {
            Long calendarId = resolveCalendarId(employeeId, date);
            result.put(date, new HolidayCalendarCalculation() {
                @Override public DayTypeInfo getDateType(LocalDate target) { return service.getDateType(calendarId, target); }
                @Override public BigDecimal calcLeaveDays(LocalDateTime start, LocalDateTime end, boolean includeHoliday) {
                    return service.calcLeaveDays(calendarId, start, end, includeHoliday);
                }
                @Override public long calcWorkMinutes(LocalDateTime start, LocalDateTime end) { return service.calcWorkMinutes(calendarId, start, end); }
            });
        }
        return result;
    }
    void invalidateAssignments();
}
