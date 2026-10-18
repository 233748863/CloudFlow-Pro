package com.cloudflow.hr.service;

import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.holiday.api.HolidayCalendarCalculation;
import com.cloudflow.common.holiday.mapper.HolidayResolverMapper;
import com.cloudflow.hr.domain.entity.HrLeaveType;
import com.cloudflow.hr.domain.entity.HrShift;
import com.cloudflow.hr.domain.entity.HrTimeRequest;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrShiftMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class HrLeaveDayCalculator {
    private final HolidayCalendarService calendars;
    private final HolidayResolverMapper resolverMapper;
    private final HrShiftMapper shiftMapper;
    private final com.cloudflow.hr.mapper.HrAttendanceRuleMapper ruleMapper;

    public BigDecimal quantity(Long employeeId, HrLeaveType type, LocalDate date, LocalDateTime start, LocalDateTime end) {
        return quantity(employeeId, type, date, start, end, shift(employeeId, date), null);
    }

    private BigDecimal quantity(Long employeeId, HrLeaveType type, LocalDate date, LocalDateTime start, LocalDateTime end,
            HrShift shift, HolidayCalendarCalculation calculation) {
        boolean night = shift != null && !shift.getEndTime().isAfter(shift.getStartTime());
        LocalDateTime dayStart = night ? date.atTime(shift.getStartTime()) : date.atStartOfDay();
        LocalDateTime dayEnd = night ? HrAttendanceJudge.shiftEnd(shift, date) : date.plusDays(1).atStartOfDay();
        LocalDateTime from = start.isAfter(dayStart) ? start : dayStart;
        LocalDateTime to = end.isBefore(dayEnd) ? end : dayEnd;
        if (!to.isAfter(from)) return BigDecimal.ZERO;
        Long calendarId = calculation == null ? calendars.resolveCalendarId(employeeId, date) : null;
        if (HrRuleSupport.flag(type.getOptionalLeaveFlag()) && !"HOLIDAY".equals((calculation == null
                ? calendars.getDateType(calendarId, date) : calculation.getDateType(date)).getDateType())) {
            throw new HrBusinessException("OPTIONAL_HOLIDAY_REQUIRED", "可选节假日假只能用于日历中的节假日");
        }
        boolean includeHoliday = HrRuleSupport.flag(type.getIncludeHolidayFlag());
        if (!includeHoliday && !(calculation == null ? calendars.isWorkday(calendarId, date)
                : "WORKDAY".equalsIgnoreCase(calculation.getDateType(date).getDateType()))) return BigDecimal.ZERO;
        if (night) {
            int expected = expectedMinutes(shift, date);
            boolean complete = !from.isAfter(dayStart) && !to.isBefore(dayEnd);
            long minutes = expected;
            if (!complete) {
                int declaredBreak = shift.getBreakMinutes() == null ? 0 : shift.getBreakMinutes();
                Long ruleId = resolverMapper.selectAssignedRuleId(employeeId, date, HrRuleSupport.tenantId());
                com.cloudflow.hr.domain.entity.HrAttendanceRule rule = ruleId == null ? null : ruleMapper.selectById(ruleId);
                if (rule != null && !Objects.equals(rule.getTenantId(), HrRuleSupport.tenantId())) throw new HrBusinessException("INVALID_RULE", "排班关联的考勤规则无效");
                HrShiftBreaks.BreakSpan rest = HrShiftBreaks.resolve(shift, date, rule == null ? null : rule.getConfigJson(), declaredBreak > 0);
                if (expected != ChronoUnit.MINUTES.between(dayStart, dayEnd) - declaredBreak) {
                    throw new HrBusinessException("SHIFT_HOURS_AMBIGUOUS", "部分夜班请假要求应出勤分钟数等于班次时长扣除已配置休息时长");
                }
                minutes = ChronoUnit.MINUTES.between(from, to) - (rest == null ? 0 : rest.overlapMinutes(from, to));
            }
            return BigDecimal.valueOf(minutes).divide(BigDecimal.valueOf("HOUR".equals(type.getUnit()) ? 60 : expected), 8, RoundingMode.HALF_UP);
        }
        if ("HOUR".equals(type.getUnit())) {
            long minutes = includeHoliday ? ChronoUnit.MINUTES.between(from, to)
                    : calculation == null ? calendars.calcWorkMinutes(calendarId, from, to) : calculation.calcWorkMinutes(from, to);
            return BigDecimal.valueOf(minutes).divide(BigDecimal.valueOf(60), 8, RoundingMode.HALF_UP);
        }
        LocalDateTime effectiveEnd = to.toLocalDate().isAfter(date) ? to.minusNanos(1) : to;
        return calculation == null ? calendars.calcLeaveDays(calendarId, from, effectiveEnd, includeHoliday)
                : calculation.calcLeaveDays(from, effectiveEnd, includeHoliday);
    }

    public BigDecimal fraction(Long employeeId, HrTimeRequest request, LocalDate date, boolean includeHoliday) {
        return fraction(employeeId, request, date, includeHoliday, shift(employeeId, date), null);
    }

    public BigDecimal fraction(Long employeeId, HrTimeRequest request, LocalDate date, boolean includeHoliday,
            HrShift shift, HolidayCalendarCalculation calculation) {
        HrLeaveType type = new HrLeaveType();
        type.setUnit(request.getUnit() == null ? "DAY" : request.getUnit());
        type.setIncludeHolidayFlag(includeHoliday ? 1 : 0);
        BigDecimal quantity = quantity(employeeId, type, date, request.getStartTime(), request.getEndTime(), shift, calculation);
        if (quantity.signum() == 0 || !"HOUR".equals(type.getUnit())) return quantity.min(BigDecimal.ONE);
        long expected = shift != null ? expectedMinutes(shift, date) : calculation == null
                ? calendars.calcWorkMinutes(calendars.resolveCalendarId(employeeId, date), date.atStartOfDay(), date.plusDays(1).atStartOfDay())
                : calculation.calcWorkMinutes(date.atStartOfDay(), date.plusDays(1).atStartOfDay());
        if (expected <= 0) throw new HrBusinessException("EXPECTED_HOURS_MISSING", "该日缺少应工作分钟数，无法换算小时假：" + date);
        return quantity.multiply(BigDecimal.valueOf(60)).divide(BigDecimal.valueOf(expected), 8, RoundingMode.HALF_UP).min(BigDecimal.ONE);
    }

    private HrShift shift(Long employeeId, LocalDate date) {
        Long shiftId = resolverMapper.selectAssignedShiftId(employeeId, date, HrRuleSupport.tenantId());
        if (shiftId == null) return null;
        HrShift shift = shiftMapper.selectById(shiftId);
        if (shift == null || !Objects.equals(shift.getTenantId(), HrRuleSupport.tenantId())) throw new HrBusinessException("SHIFT_NOT_FOUND", "员工排班关联班次不存在");
        HrAttendanceJudge.validateShift(shift);
        return shift;
    }

    private int expectedMinutes(HrShift shift, LocalDate date) {
        return shift.getWorkMinutes() == null ? Math.toIntExact(ChronoUnit.MINUTES.between(date.atTime(shift.getStartTime()), HrAttendanceJudge.shiftEnd(shift, date)))
                - (shift.getBreakMinutes() == null ? 0 : shift.getBreakMinutes()) : shift.getWorkMinutes();
    }
}
