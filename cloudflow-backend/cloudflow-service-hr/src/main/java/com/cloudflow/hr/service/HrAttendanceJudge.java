package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.entity.HrAttendanceCheckin;
import com.cloudflow.hr.domain.entity.HrAttendanceRecord;
import com.cloudflow.hr.domain.entity.HrShift;
import com.cloudflow.hr.exception.HrBusinessException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public final class HrAttendanceJudge {
    private HrAttendanceJudge() {}

    public static HrAttendanceRecord judge(HrShift shift, LocalDate date, List<HrAttendanceCheckin> raw, LocalDateTime now) {
        validateShift(shift);
        LocalDateTime start = date.atTime(shift.getStartTime());
        LocalDateTime end = shiftEnd(shift, date);
        int expected = shift.getWorkMinutes() == null ? Math.max(0, minutes(start, end) - safe(shift.getBreakMinutes())) : shift.getWorkMinutes();
        List<HrAttendanceCheckin> checkins = raw.stream().filter(checkin -> checkin.getCheckTime() != null
                        && !HrRuleSupport.flag(checkin.getSkipAutoFlag()) && !HrRuleSupport.flag(checkin.getOffshiftFlag()))
                .filter(checkin -> inWindow(shift, date, checkin.getCheckTime()))
                .sorted(Comparator.comparing(HrAttendanceCheckin::getCheckTime).thenComparing(
                        HrAttendanceCheckin::getCheckinId, Comparator.nullsLast(Comparator.naturalOrder()))).toList();
        HrAttendanceRecord result = new HrAttendanceRecord();
        result.setAttendanceDate(date);
        result.setShiftId(shift.getId());
        result.setExpectedMinutes(expected);
        result.setWorkMinutes(0);
        result.setLateMinutes(0);
        result.setEarlyExitMinutes(0);
        result.setOvertimeMinutes(0);
        result.setHalfDayFlag(0);
        result.setAbsentFlag(0);
        result.setCheckinCount(checkins.size());
        result.setDateType("WORKDAY");
        List<CheckinPair> pairs = pairs(checkins);
        LocalDateTime first = checkins.isEmpty() ? null : checkins.get(0).getCheckTime();
        LocalDateTime last = checkins.size() < 2 ? null : checkins.get(checkins.size() - 1).getCheckTime();
        if ("ALTERNATING".equals(shift.getCheckinDetermineMode()) || "PAIRED".equals(shift.getWorkingHoursCalcMode())) {
            first = pairs.isEmpty() ? null : pairs.get(0).in();
            last = pairs.isEmpty() ? null : pairs.get(pairs.size() - 1).out();
        }
        result.setFirstCheckinTime(first);
        result.setLastCheckoutTime(last);
        if (first == null || last == null || !last.isAfter(first)) {
            boolean finished = !now.isBefore(end.plusMinutes(safe(shift.getCheckoutWindowAfterMinutes())));
            result.setStatus(finished ? "ABSENT" : "PENDING");
            result.setAbsentFlag(finished ? 1 : 0);
            return result;
        }
        int elapsed = "PAIRED".equals(shift.getWorkingHoursCalcMode())
                ? pairs.stream().mapToInt(pair -> minutes(pair.in(), pair.out())).sum() : minutes(first, last);
        int recordedBreak = "PAIRED".equals(shift.getWorkingHoursCalcMode()) ? Math.max(0, minutes(first, last) - elapsed) : 0;
        int work = Math.max(0, elapsed - Math.max(0, safe(shift.getBreakMinutes()) - recordedBreak));
        if (("PAIRED".equals(shift.getWorkingHoursCalcMode()) || "ALTERNATING".equals(shift.getCheckinDetermineMode()))
                && !"OUT".equals(checkins.get(checkins.size() - 1).getLogType())) {
            boolean finished = !now.isBefore(end.plusMinutes(safe(shift.getCheckoutWindowAfterMinutes())));
            result.setWorkMinutes(work);
            result.setStatus(finished ? "ABSENT" : "PENDING");
            result.setAbsentFlag(finished ? 1 : 0);
            return result;
        }
        int late = Math.max(0, minutes(start, first) - safe(shift.getLateGraceMinutes()));
        int early = Math.max(0, minutes(last, end) - safe(shift.getEarlyExitGraceMinutes()));
        boolean absent = below(work, shift.getAbsentHoursThreshold());
        boolean halfDay = !absent && below(work, shift.getHalfDayHoursThreshold());
        String status = absent ? "ABSENT" : halfDay ? "HALF_DAY" : late > 0 && early > 0 ? "LATE_AND_EARLY"
                : late > 0 ? "LATE" : early > 0 ? "EARLY_EXIT" : "NORMAL";
        result.setStatus(status);
        result.setWorkMinutes(work);
        result.setLateMinutes(late);
        result.setEarlyExitMinutes(early);
        result.setAbsentFlag(absent ? 1 : 0);
        result.setHalfDayFlag(halfDay ? 1 : 0);
        if (shift.getOvertimeThresholdMinutes() != null) result.setOvertimeMinutes(Math.max(0, work - expected - shift.getOvertimeThresholdMinutes()));
        return result;
    }

    public static LocalDateTime shiftEnd(HrShift shift, LocalDate date) {
        LocalDateTime end = date.atTime(shift.getEndTime());
        return shift.getEndTime().isAfter(shift.getStartTime()) ? end : end.plusDays(1);
    }

    public static boolean inWindow(HrShift shift, LocalDate date, LocalDateTime checkTime) {
        return !checkTime.isBefore(date.atTime(shift.getStartTime()).minusMinutes(safe(shift.getCheckinWindowBeforeMinutes())))
                && !checkTime.isAfter(shiftEnd(shift, date).plusMinutes(safe(shift.getCheckoutWindowAfterMinutes())));
    }

    public static LocalDate attendanceDate(HrShift shift, LocalDateTime checkTime, String logType) {
        LocalDate selected = checkTime.toLocalDate();
        long closest = Long.MAX_VALUE;
        for (int offset = -1; offset <= 1; offset++) {
            LocalDate candidate = checkTime.toLocalDate().plusDays(offset);
            if (!inWindow(shift, candidate, checkTime)) continue;
            LocalDateTime expected = "OUT".equals(logType) ? shiftEnd(shift, candidate) : candidate.atTime(shift.getStartTime());
            long distance = Math.abs(ChronoUnit.SECONDS.between(expected, checkTime));
            if (distance < closest) { selected = candidate; closest = distance; }
        }
        return selected;
    }

    public static void validateShift(HrShift shift) {
        if (shift == null || shift.getStartTime() == null || shift.getEndTime() == null) throw new HrBusinessException("INVALID_SHIFT", "班次开始和结束时间不能为空");
        for (Integer value : new Integer[]{shift.getBreakMinutes(), shift.getWorkMinutes(), shift.getLateGraceMinutes(),
                shift.getEarlyExitGraceMinutes(), shift.getCheckinWindowBeforeMinutes(), shift.getCheckoutWindowAfterMinutes(), shift.getOvertimeThresholdMinutes()}) {
            if (value != null && value < 0) throw new HrBusinessException("INVALID_SHIFT", "班次分钟数不能为负");
        }
        int availableMinutes = minutes(LocalDate.of(2000, 1, 1).atTime(shift.getStartTime()), shiftEnd(shift, LocalDate.of(2000, 1, 1))) - safe(shift.getBreakMinutes());
        if (availableMinutes <= 0 || shift.getWorkMinutes() != null && (shift.getWorkMinutes() <= 0 || shift.getWorkMinutes() > availableMinutes)) {
            throw new HrBusinessException("INVALID_SHIFT", "应出勤分钟数须为正数，且不得超过班次时长扣除休息后的分钟数");
        }
        if (shift.getAbsentHoursThreshold() != null && shift.getAbsentHoursThreshold().signum() < 0
                || shift.getHalfDayHoursThreshold() != null && shift.getHalfDayHoursThreshold().signum() < 0
                || shift.getAbsentHoursThreshold() != null && shift.getHalfDayHoursThreshold() != null
                && shift.getAbsentHoursThreshold().compareTo(shift.getHalfDayHoursThreshold()) > 0) {
            throw new HrBusinessException("INVALID_SHIFT", "缺勤阈值须不大于半天阈值，且两者不可为负数");
        }
        if (shift.getWorkingHoursCalcMode() != null && !List.of("FIRST_LAST", "PAIRED").contains(shift.getWorkingHoursCalcMode())
                || shift.getCheckinDetermineMode() != null && !List.of("EARLIEST_LATEST", "ALTERNATING").contains(shift.getCheckinDetermineMode())) {
            throw new HrBusinessException("INVALID_SHIFT", "班次打卡或工时计算方式无效");
        }
    }

    private static List<CheckinPair> pairs(List<HrAttendanceCheckin> checkins) {
        List<CheckinPair> pairs = new ArrayList<>();
        LocalDateTime opened = null;
        for (HrAttendanceCheckin checkin : checkins) {
            if ("IN".equals(checkin.getLogType()) && opened == null) opened = checkin.getCheckTime();
            else if ("OUT".equals(checkin.getLogType()) && opened != null && checkin.getCheckTime().isAfter(opened)) {
                pairs.add(new CheckinPair(opened, checkin.getCheckTime()));
                opened = null;
            }
        }
        return pairs;
    }

    private static boolean below(int minutes, BigDecimal hours) {
        return hours != null && BigDecimal.valueOf(minutes).compareTo(hours.multiply(BigDecimal.valueOf(60))) < 0;
    }
    private static int minutes(LocalDateTime from, LocalDateTime to) { return Math.toIntExact(ChronoUnit.MINUTES.between(from, to)); }
    private static int safe(Integer value) { return value == null ? 0 : value; }
    private record CheckinPair(LocalDateTime in, LocalDateTime out) {}
}
