package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.entity.HrShift;
import com.cloudflow.hr.exception.HrBusinessException;
import com.fasterxml.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;

public final class HrShiftBreaks {
    private HrShiftBreaks() {}

    public static BreakSpan resolve(HrShift shift, LocalDate date, JsonNode configuration, boolean required) {
        String start = configuration == null ? "" : configuration.path("breakStartTime").asText("");
        String end = configuration == null ? "" : configuration.path("breakEndTime").asText("");
        if (start.isBlank() && end.isBlank() && !required) return null;
        if (shift == null || start.isBlank() || end.isBlank()) throw new HrBusinessException("SHIFT_BREAK_REQUIRED", "部分夜班请假须先在排班关联的考勤规则中配置休息开始和结束时间");
        try {
            LocalDateTime shiftStart = date.atTime(shift.getStartTime());
            LocalDateTime shiftEnd = HrAttendanceJudge.shiftEnd(shift, date);
            LocalDateTime from = date.atTime(LocalTime.parse(start));
            if (from.isBefore(shiftStart)) from = from.plusDays(1);
            LocalDateTime to = from.toLocalDate().atTime(LocalTime.parse(end));
            if (!to.isAfter(from)) to = to.plusDays(1);
            int declared = shift.getBreakMinutes() == null ? 0 : shift.getBreakMinutes();
            if (from.isBefore(shiftStart) || to.isAfter(shiftEnd) || ChronoUnit.MINUTES.between(from, to) != declared) {
                throw new HrBusinessException("SHIFT_BREAK_INVALID", "休息时段须位于班次内，且时长须与班次休息分钟数一致");
            }
            return new BreakSpan(from, to);
        } catch (DateTimeParseException failure) {
            throw new HrBusinessException("SHIFT_BREAK_INVALID", "休息起止时间格式须为小时:分钟", failure);
        }
    }

    public record BreakSpan(LocalDateTime start, LocalDateTime end) {
        public long overlapMinutes(LocalDateTime from, LocalDateTime to) {
            LocalDateTime overlapStart = from.isAfter(start) ? from : start;
            LocalDateTime overlapEnd = to.isBefore(end) ? to : end;
            return overlapEnd.isAfter(overlapStart) ? ChronoUnit.MINUTES.between(overlapStart, overlapEnd) : 0;
        }
    }
}
