package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.entity.HrAttendanceCheckin;
import com.cloudflow.hr.domain.entity.HrAttendanceRule;
import com.cloudflow.hr.domain.entity.HrShift;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

import static com.cloudflow.hr.service.HrHException.*;

public final class HrOvertimeCalculator {
    public static final String ROUNDING_POLICY = "CUMULATIVE_FLOOR_2_V1";
    private static final BigDecimal SIXTY = BigDecimal.valueOf(60);
    private static final BigDecimal MAX_QUANTITY = new BigDecimal("999999.99");
    private static final BigDecimal MAX_MONEY = new BigDecimal("9999999999999999.99");

    private HrOvertimeCalculator() {}

    public static int requestedMinutes(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null || !end.isAfter(start) || start.getSecond() != 0 || end.getSecond() != 0
                || start.getNano() != 0 || end.getNano() != 0 || end.isAfter(start.toLocalDate().plusDays(1).atStartOfDay())) {
            throw invalid("申请须使用整分钟，且只覆盖一个自然日；结束可为次日零点");
        }
        return minutes(start, end);
    }

    public static String dayType(String dateType, Integer triplePayFlag) {
        if (Integer.valueOf(0).equals(triplePayFlag)) {
            if ("WORKDAY".equals(dateType)) return "WORKDAY";
            if ("REST".equals(dateType) || "HOLIDAY".equals(dateType)) return "REST_DAY";
        }
        if (Integer.valueOf(1).equals(triplePayFlag) && "HOLIDAY".equals(dateType)) return "HOLIDAY";
        throw conflict("CALENDAR_CONFLICT", "日历日期类型与三倍工资日标记矛盾");
    }

    public static Calculation calculate(HrShift shift, HrAttendanceRule rule, LocalDate attendanceDate,
            boolean workday, LocalDateTime start, LocalDateTime end, List<HrAttendanceCheckin> raw) {
        requestedMinutes(start, end);
        HrAttendanceJudge.validateShift(shift);
        if (rule == null || shift.getOvertimeThresholdMinutes() == null || shift.getBreakMinutes() == null
                || shift.getWorkMinutes() == null || shift.getWorkingHoursCalcMode() == null || shift.getCheckinDetermineMode() == null) {
            throw conflict("ATTENDANCE_POLICY_MISSING", "须先核定班次工时、休息、阈值及打卡配对规则");
        }
        if (!Objects.equals(rule.getShiftId(), shift.getId())) throw conflict("RULE_SHIFT_CONFLICT", "考勤规则与班次不一致");
        if (raw == null || raw.stream().anyMatch(card -> card == null || card.getCheckTime() == null || card.getCheckinId() == null)) throw conflict("CHECKIN_EVIDENCE_INVALID", "打卡证据缺少原始编号或时间");
        List<HrAttendanceCheckin> cards = raw.stream().sorted(Comparator.comparing(HrAttendanceCheckin::getCheckTime)
                .thenComparing(HrAttendanceCheckin::getCheckinId)).toList();
        if (cards.size() < 2) throw conflict("PAIRED_CHECKINS_REQUIRED", "缺少真实成对进出卡，请先补卡或核正");
        List<Evidence> evidence = new ArrayList<>();
        for (HrAttendanceCheckin card : cards) {
            if (card.getCheckinId() == null || card.getCheckTime() == null || !Objects.equals(card.getShiftId(), shift.getId())
                    || !Objects.equals(card.getAttendanceDate(), attendanceDate) || !Integer.valueOf(0).equals(card.getSkipAutoFlag())
                    || !Integer.valueOf(1).equals(card.getLocationValidFlag()) || !("IN".equals(card.getLogType()) || "OUT".equals(card.getLogType()))) {
                throw conflict("CHECKIN_EVIDENCE_INVALID", "打卡归属、位置或自动处理标记异常，请先核正");
            }
            evidence.add(new Evidence(card.getCheckinId(), card.getLogType(), card.getCheckTime(), card.getShiftId(),
                    card.getAttendanceDate(), card.getOvertimeTypeId(), card.getOvertimeRequestId()));
        }
        List<Span> paired = new ArrayList<>();
        HrAttendanceCheckin opened = null;
        for (HrAttendanceCheckin card : cards) {
            if (opened == null && "IN".equals(card.getLogType())) opened = card;
            else if (opened != null && "OUT".equals(card.getLogType()) && card.getCheckTime().isAfter(opened.getCheckTime())) {
                LocalDateTime from = ceilingMinute(opened.getCheckTime());
                LocalDateTime to = card.getCheckTime().truncatedTo(ChronoUnit.MINUTES);
                if (to.isAfter(from)) paired.add(new Span(from, to, List.of(opened.getCheckinId(), card.getCheckinId()), "WORK"));
                opened = null;
            } else throw conflict("CHECKIN_PAIR_CONFLICT", "进出卡不能唯一配对，请先核正");
        }
        if (opened != null || paired.isEmpty()) throw conflict("PAIRED_CHECKINS_REQUIRED", "打卡尚未形成完整工作区间");
        HrShiftBreaks.BreakSpan rest = HrShiftBreaks.resolve(shift, attendanceDate, rule.getConfigJson(), shift.getBreakMinutes() > 0);
        if (rest != null && (rest.start().getSecond() != 0 || rest.start().getNano() != 0 || rest.end().getSecond() != 0 || rest.end().getNano() != 0)) throw conflict("SHIFT_BREAK_INVALID", "加班核算的休息时段须采用整分钟配置");
        boolean usePairs = "PAIRED".equals(shift.getWorkingHoursCalcMode()) || "ALTERNATING".equals(shift.getCheckinDetermineMode());
        List<Span> work = new ArrayList<>();
        if (usePairs) work.addAll(paired);
        else {
            for (int pairIndex = 1; pairIndex < paired.size(); pairIndex++) {
                LocalDateTime gapStart = paired.get(pairIndex - 1).endTime();
                LocalDateTime gapEnd = paired.get(pairIndex).startTime();
                if (gapEnd.isAfter(gapStart) && (rest == null || gapStart.isBefore(rest.start()) || gapEnd.isAfter(rest.end()))) {
                    throw conflict("BREAK_EVIDENCE_REQUIRED", "首末卡口径存在未配置休息，请先补齐休息依据");
                }
            }
            work.add(new Span(paired.get(0).startTime(), paired.get(paired.size() - 1).endTime(),
                    evidence.stream().map(Evidence::checkinId).toList(), "WORK"));
        }
        List<Span> excluded = new ArrayList<>();
        if (rest != null) {
            List<Span> net = new ArrayList<>();
            for (Span span : work) {
                Span overlap = intersect(span, rest.start(), rest.end(), "BREAK");
                if (overlap == null) net.add(span);
                else {
                    excluded.add(overlap);
                    addSpan(net, span.startTime(), overlap.startTime(), span.sourceCheckinIds(), "WORK");
                    addSpan(net, overlap.endTime(), span.endTime(), span.sourceCheckinIds(), "WORK");
                }
            }
            work = net;
        }
        int expected = workday ? shift.getWorkMinutes() : 0;
        int threshold = shift.getOvertimeThresholdMinutes();
        int remainingExclusion = Math.addExact(expected, threshold);
        List<Span> eligible = new ArrayList<>();
        for (Span span : work) {
            int removed = Math.min(remainingExclusion, span.minutes());
            if (removed > 0) {
                excluded.add(new Span(span.startTime(), span.startTime().plusMinutes(removed), span.sourceCheckinIds(), "EXCLUDED"));
                remainingExclusion -= removed;
            }
            addSpan(eligible, span.startTime().plusMinutes(removed), span.endTime(), span.sourceCheckinIds(), "WORK");
        }
        List<Span> segments = new ArrayList<>();
        for (Span span : eligible) {
            Span intersection = intersect(span, start, end, "WORK");
            if (intersection != null) segments.add(intersection);
        }
        int actual = segments.stream().mapToInt(Span::minutes).sum();
        int excludedMinutes = 0;
        for (Span span : excluded) {
            Span intersection = intersect(span, start, end, span.kind());
            if (intersection != null) { segments.add(intersection); excludedMinutes += intersection.minutes(); }
        }
        segments.sort(Comparator.comparing(Span::startTime).thenComparing(Span::kind));
        return new Calculation(actual, excludedMinutes, expected, threshold, List.copyOf(segments), List.copyOf(evidence));
    }

    public static BigDecimal hours(long minutes) { return BigDecimal.valueOf(minutes).divide(SIXTY, 2, RoundingMode.HALF_UP); }

    public static boolean exceeds(long minutes, BigDecimal limitHours) {
        if (limitHours == null || limitHours.signum() <= 0) throw conflict("OVERTIME_LIMIT_MISSING", "日月加班上限尚未核定");
        return BigDecimal.valueOf(minutes).compareTo(limitHours.multiply(SIXTY)) > 0;
    }

    public static BigDecimal money(int minutes, BigDecimal hourlyRate, BigDecimal multiplier) {
        decimal(hourlyRate, MAX_MONEY, "基础时薪");
        decimal(multiplier, new BigDecimal("99.99"), "加班费倍率");
        if (minutes <= 0) throw invalid("核定分钟数必须为正数");
        BigDecimal amount = BigDecimal.valueOf(minutes).multiply(hourlyRate).multiply(multiplier).divide(SIXTY, 2, RoundingMode.HALF_UP);
        decimal(amount, MAX_MONEY, "加班费金额");
        return amount;
    }

    public static BigInteger weighted(int minutes, BigDecimal ratio) {
        decimal(ratio, new BigDecimal("99.99"), "调休比例");
        if (minutes <= 0) throw invalid("核定分钟数必须为正数");
        return BigInteger.valueOf(minutes).multiply(ratio.movePointRight(2).toBigIntegerExact());
    }

    public static BigDecimal credit(BigInteger weighted) {
        if (weighted.signum() < 0) throw conflict("ROUNDING_HISTORY_CONFLICT", "调休累计依据异常");
        BigDecimal credit = new BigDecimal(weighted.divide(BigInteger.valueOf(60)), 2);
        if (credit.compareTo(MAX_QUANTITY) > 0) throw conflict("QUANTITY_OVERFLOW", "调休累计数量超过存储精度");
        return credit;
    }

    public static Rounding rounding(BigInteger previous, BigDecimal previousCredit, int minutes, BigDecimal ratio) {
        BigDecimal before = credit(previous);
        if (previousCredit == null || before.compareTo(previousCredit) != 0) throw conflict("ROUNDING_HISTORY_CONFLICT", "历史已授额度与精确分钟累计不一致，须先核查");
        BigInteger total = previous.add(weighted(minutes, ratio));
        BigDecimal after = credit(total);
        return new Rounding(previous, total, before, after, after.subtract(before), total.remainder(BigInteger.valueOf(60)).intValueExact());
    }

    private static void decimal(BigDecimal value, BigDecimal maximum, String label) {
        if (value == null || value.signum() <= 0 || value.scale() > 2 || value.compareTo(maximum) > 0) throw invalid(label + "须为允许精度内的正数，最多两位小数");
    }

    private static LocalDateTime ceilingMinute(LocalDateTime value) {
        LocalDateTime truncated = value.truncatedTo(ChronoUnit.MINUTES);
        return value.equals(truncated) ? truncated : truncated.plusMinutes(1);
    }

    private static int minutes(LocalDateTime start, LocalDateTime end) { return Math.toIntExact(ChronoUnit.MINUTES.between(start, end)); }
    private static void addSpan(List<Span> spans, LocalDateTime start, LocalDateTime end, List<Long> ids, String kind) {
        if (end.isAfter(start)) spans.add(new Span(start, end, ids, kind));
    }

    private static Span intersect(Span span, LocalDateTime start, LocalDateTime end, String kind) {
        LocalDateTime from = start.isAfter(span.startTime()) ? start : span.startTime();
        LocalDateTime to = end.isBefore(span.endTime()) ? end : span.endTime();
        return to.isAfter(from) ? new Span(from, to, span.sourceCheckinIds(), kind) : null;
    }

    public record Span(LocalDateTime startTime, LocalDateTime endTime, List<Long> sourceCheckinIds, String kind) {
        public int minutes() { return HrOvertimeCalculator.minutes(startTime, endTime); }
    }
    public record Evidence(Long checkinId, String logType, LocalDateTime checkTime, Long shiftId,
            LocalDate attendanceDate, Long overtimeTypeId, Long overtimeRequestId) {}
    public record Calculation(int actualMinutes, int excludedMinutes, int expectedMinutes, int thresholdMinutes,
            List<Span> segments, List<Evidence> evidence) {}
    public record Rounding(BigInteger weightedBefore, BigInteger weightedAfter, BigDecimal creditBefore,
            BigDecimal creditAfter, BigDecimal quantity, int residualNumerator) {}
}
