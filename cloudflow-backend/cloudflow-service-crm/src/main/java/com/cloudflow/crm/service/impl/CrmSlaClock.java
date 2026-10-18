package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.exception.CrmBusinessException;

import com.cloudflow.common.holiday.api.HolidayCalendarService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

@Component
@RequiredArgsConstructor
public class CrmSlaClock {
    private final HolidayCalendarService calendarService;

    public long elapsed(Long calendarId, boolean roundTheClock, LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null || end.isBefore(start)) return 0;
        LocalDateTime from = start.truncatedTo(ChronoUnit.MINUTES);
        LocalDateTime to = end.truncatedTo(ChronoUnit.MINUTES);
        return roundTheClock ? ChronoUnit.MINUTES.between(from, to) : calendarService.calcWorkMinutes(calendarId, from, to);
    }

    public LocalDateTime add(Long calendarId, boolean roundTheClock, LocalDateTime from, long minutes) {
        if (from == null) return null;
        if (minutes < 0) throw new CrmBusinessException("SLA分钟数不能为负");
        LocalDateTime cursor = from.truncatedTo(ChronoUnit.MINUTES);
        if (roundTheClock || minutes == 0) return cursor.plusMinutes(minutes);
        long remaining = minutes;
        for (int traversedDays = 0; traversedDays < 36600; traversedDays++) {
            LocalDateTime dayEnd = cursor.toLocalDate().plusDays(1).atStartOfDay();
            long available = calendarService.calcWorkMinutes(calendarId, cursor, dayEnd);
            if (available >= remaining) {
                long lower = 0;
                long upper = ChronoUnit.MINUTES.between(cursor, dayEnd);
                while (lower < upper) {
                    long middle = lower + (upper - lower) / 2;
                    if (calendarService.calcWorkMinutes(calendarId, cursor, cursor.plusMinutes(middle)) >= remaining) upper = middle;
                    else lower = middle + 1;
                }
                return cursor.plusMinutes(lower);
            }
            remaining -= available;
            cursor = dayEnd;
        }
        throw new IllegalStateException("日历在36600天内未提供足够工作分钟");
    }
}
