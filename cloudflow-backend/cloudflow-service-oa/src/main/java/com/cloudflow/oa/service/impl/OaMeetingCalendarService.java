package com.cloudflow.oa.service.impl;

import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.holiday.domain.DayTypeInfo;
import com.cloudflow.oa.mapper.OaMeetingMapper;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class OaMeetingCalendarService {
    private final OaMeetingMapper meetings;
    private final HolidayCalendarService calendars;

    public DayTypeInfo verified(Long calendarId, LocalDate date) {
        DayTypeInfo stored = meetings.calendarFact(OaRecordSupport.tenantId(), calendarId, date);
        OaMeetingRules.require(stored != null, "ROOM_CALENDAR_UNVERIFIED", date + "没有核定的会议室日历日期，请先由管理员或HR维护");
        DayTypeInfo resolved = calendars.getDateType(calendarId, date);
        OaMeetingRules.require(resolved != null && stored.getDateType().equals(resolved.getDateType()),
                "ROOM_CALENDAR_UNVERIFIED", "会议室日历正在更新，请重试");
        return resolved;
    }
}
