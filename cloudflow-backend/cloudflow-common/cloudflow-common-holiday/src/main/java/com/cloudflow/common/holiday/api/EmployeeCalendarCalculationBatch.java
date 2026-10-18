package com.cloudflow.common.holiday.api;

import com.cloudflow.common.holiday.domain.EmployeeCalendarDay;
import java.time.LocalDate;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Assignment and calendar calculation data resolved together for the caller's transaction. */
public record EmployeeCalendarCalculationBatch(
        List<EmployeeCalendarDay> assignments,
        Map<LocalDate, HolidayCalendarCalculation> calculations) {
    public EmployeeCalendarCalculationBatch {
        assignments = List.copyOf(assignments);
        calculations = Collections.unmodifiableMap(new LinkedHashMap<>(calculations));
    }
}
