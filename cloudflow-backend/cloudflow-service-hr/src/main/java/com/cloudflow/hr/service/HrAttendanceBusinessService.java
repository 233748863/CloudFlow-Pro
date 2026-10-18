package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.holiday.api.HolidayCalendarCalculation;
import com.cloudflow.common.holiday.api.EmployeeCalendarCalculationBatch;
import com.cloudflow.common.holiday.domain.DayTypeInfo;
import com.cloudflow.common.holiday.domain.EmployeeCalendarDay;
import com.cloudflow.common.holiday.mapper.HolidayResolverMapper;
import com.cloudflow.hr.domain.dto.HrAttendanceCheckinPayload;
import com.cloudflow.hr.domain.dto.HrAttendanceRecordPayload;
import com.cloudflow.hr.domain.dto.HrAttendanceRecalcRequest;
import com.cloudflow.hr.domain.dto.HrEmployeeSelection;
import com.cloudflow.hr.domain.dto.HrShiftPayload;
import com.cloudflow.hr.domain.dto.HrAttendanceRulePayload;
import com.cloudflow.hr.domain.dto.HrScheduleAssignmentPayload;
import com.cloudflow.hr.domain.entity.*;
import com.cloudflow.hr.domain.vo.attendance.HrAttendanceRecordVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

import static com.cloudflow.hr.service.HrRuleSupport.*;

@Service
@RequiredArgsConstructor
public class HrAttendanceBusinessService {
    private final HrAttendanceCheckinMapper checkinMapper;
    private final HrAttendanceRecordMapper recordMapper;
    private final HrAttendanceMonthlyMapper monthlyMapper;
    private final HrAttendanceRuleMapper ruleMapper;
    private final HrShiftMapper shiftMapper;
    private final HrScheduleAssignmentMapper scheduleMapper;
    private final HrLookupMapper lookupMapper;
    private final HrTimeRequestMapper timeRequestMapper;
    private final HolidayCalendarService holidayCalendarService;
    private final HolidayResolverMapper resolverMapper;
    private final HrRuleSupport support;
    private final HrRuleAsyncExecutor asyncExecutor;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;
    private final HrLeaveDayCalculator dayCalculator;
    private final org.springframework.beans.factory.ObjectProvider<HrOvertimeService> overtimeService;
    private final HrHConfigurationGuard hGuard;
    private final HrAttendancePhotoService attendancePhotos;

    public record ShiftInfo(Long shiftId, String shiftName, LocalDate attendanceDate,
                            LocalDateTime startTime, LocalDateTime endTime) { }
    public record TodayAttendance(LocalDate today, LocalDateTime serverTime, ShiftInfo shift,
                                  ShiftInfo inShift, ShiftInfo outShift, List<HrAttendanceCheckin> checkins) { }

    public TodayAttendance today(Long employeeId) {
        support.assertEmployeeScope(employeeId);
        LocalDateTime now = LocalDateTime.now();
        LocalDate date = now.toLocalDate();
        HrAttendanceCheckinPayload payload = new HrAttendanceCheckinPayload();
        payload.setEmployeeId(employeeId);
        payload.setCheckTime(now);
        payload.setLogType("IN");
        ShiftMatch in = matchShift(payload);
        payload.setLogType("OUT");
        ShiftMatch out = matchShift(payload);
        List<HrAttendanceCheckin> records = checkins(employeeId, date.minusDays(1), date.plusDays(1)).stream()
                .filter(row -> date.equals(row.getAttendanceDate()) || row.getCheckTime() != null
                        && date.equals(row.getCheckTime().toLocalDate())).toList();
        return new TodayAttendance(date, now, shiftInfo(resolveShift(employeeId, date), date),
                shiftInfo(in.shift(), in.date()), shiftInfo(out.shift(), out.date()), records);
    }

    private ShiftInfo shiftInfo(HrShift shift, LocalDate date) {
        return shift == null ? null : new ShiftInfo(shift.getId(), shift.getShiftName(), date,
                date.atTime(shift.getStartTime()), HrAttendanceJudge.shiftEnd(shift, date));
    }

    public List<HrAttendanceRecordVO> ownRecords(Long employeeId) {
        Long userId = UserContext.getUserId();
        if (userId == null) throw new HrBusinessException("UNAUTHORIZED", "当前登录态缺失，无法解析员工身份");
        if (!Objects.equals(support.employee(employeeId).getUserId(), userId)) {
            throw new HrBusinessException("FORBIDDEN_CROSS_EMPLOYEE", "员工自助仅可查看本人考勤数据");
        }
        return recordMapper.selectList(new LambdaQueryWrapper<HrAttendanceRecord>()
                .eq(HrAttendanceRecord::getTenantId, tenantId())
                .eq(HrAttendanceRecord::getEmployeeId, employeeId)
                .eq(HrAttendanceRecord::getDeleted, 0)
                .orderByDesc(HrAttendanceRecord::getAttendanceDate)
                .orderByDesc(HrAttendanceRecord::getId)).stream()
                .map(record -> objectMapper.convertValue(record, HrAttendanceRecordVO.class)).toList();
    }

    public Long checkin(HrAttendanceCheckinPayload payload) {
        if (payload == null || payload.getCheckTime() == null || payload.getLogType() == null
                || !List.of("IN", "OUT").contains(payload.getLogType())) throw new HrBusinessException("INVALID_CHECKIN", "打卡须提供员工、时间及IN/OUT类型");
        support.assertEmployeeScope(payload.getEmployeeId());
        if (payload.getCheckMethod() == null) payload.setCheckMethod("APP");
        if (!List.of("APP", "FACE", "CARD", "WIFI", "GPS", "MANUAL").contains(payload.getCheckMethod())) throw new HrBusinessException("INVALID_CHECK_METHOD", "打卡方式无效");
        if (payload.getOvertimeTypeId() != null) throw new HrBusinessException("OVERTIME_TYPE_SERVER_ONLY", "加班类型仅能由独立申请解析，客户端不可指定");
        if (payload.getPhotoFileId() != null) attendancePhotos.assertOwned(payload.getPhotoFileId());
        return support.locked("attendance-config", () -> {
            if (payload.getOvertimeRequestId() != null) return overtimeService.getObject().withCheckin(payload,
                    link -> insertCheckin(payload, new ShiftMatch(link.shift(), link.attendanceDate()), link.requestId(), link.overtimeTypeId()));
            return insertCheckin(payload, matchShift(payload), null, null);
        });
    }

    private Long insertCheckin(HrAttendanceCheckinPayload payload, ShiftMatch match, Long overtimeRequestId, Long overtimeTypeId) {
        return support.locked(attendanceLock(payload.getEmployeeId(), match.date()), () -> {
            assertMonthOpen(payload.getEmployeeId(), match.date());
            List<HrAttendanceCheckin> existing = checkinMapper.selectList(new LambdaQueryWrapper<HrAttendanceCheckin>()
                    .eq(HrAttendanceCheckin::getTenantId, tenantId()).eq(HrAttendanceCheckin::getEmployeeId, payload.getEmployeeId())
                    .eq(HrAttendanceCheckin::getCheckTime, payload.getCheckTime()).eq(HrAttendanceCheckin::getLogType, payload.getLogType())
                    .eq(HrAttendanceCheckin::getCheckMethod, payload.getCheckMethod()));
            if (!existing.isEmpty()) {
                if (overtimeRequestId != null && existing.get(0).getOvertimeRequestId() != null && !overtimeRequestId.equals(existing.get(0).getOvertimeRequestId())) throw new HrBusinessException("CHECKIN_SOURCE_CONFLICT", "此原始卡已经关联其他申请，不允许改写");
                return existing.get(0).getCheckinId();
            }
            HrAttendanceCheckin row = new HrAttendanceCheckin();
            row.setTenantId(tenantId());
            row.setEmployeeId(payload.getEmployeeId());
            row.setOvertimeRequestId(overtimeRequestId); row.setOvertimeTypeId(overtimeTypeId);
            row.setLogType(payload.getLogType());
            row.setCheckTime(payload.getCheckTime());
            row.setShiftId(match.shift() == null ? null : match.shift().getId());
            row.setAttendanceDate(match.date());
            row.setDeviceId(payload.getDeviceId());
            row.setCheckMethod(payload.getCheckMethod());
            row.setLatitude(payload.getLatitude());
            row.setLongitude(payload.getLongitude());
            row.setLocationName(payload.getLocationName());
            row.setLocationValidFlag(locationValid(payload, match.date()) ? 1 : 0);
            row.setOffshiftFlag(match.shift() == null || !HrAttendanceJudge.inWindow(match.shift(), match.date(), payload.getCheckTime()) ? 1 : 0);
            row.setSkipAutoFlag(flag(payload.getSkipAutoFlag()) ? 1 : 0);
            row.setPhotoFileId(payload.getPhotoFileId());
            row.setRemark(payload.getRemark());
            row.setCreateBy(userName());
            row.setCreateTime(LocalDateTime.now());
            checkinMapper.insert(row);
            support.audit("ATTENDANCE_CHECKIN", row.getCheckinId(), "CHECKIN", Map.of("employeeId", row.getEmployeeId(), "attendanceDate", row.getAttendanceDate()));
            return row.getCheckinId();
        });
    }

    public List<HrAttendanceCheckin> checkins(Long employeeId, LocalDate from, LocalDate to) {
        support.assertEmployeeScope(employeeId);
        validateRange(from, to);
        return checkinMapper.selectList(new LambdaQueryWrapper<HrAttendanceCheckin>()
                .eq(HrAttendanceCheckin::getTenantId, tenantId()).eq(HrAttendanceCheckin::getEmployeeId, employeeId)
                .between(HrAttendanceCheckin::getAttendanceDate, from, to).orderByAsc(HrAttendanceCheckin::getCheckTime));
    }

    public HrAttendanceRecord calculate(Long employeeId, LocalDate date) {
        support.assertEmployeeScope(employeeId);
        if (date == null) throw new HrBusinessException("INVALID_DATE", "考勤日期不能为空");
        HrShift shift = resolveShift(employeeId, date);
        Long calendarId = holidayCalendarService.resolveCalendarId(employeeId, date);
        String dateType = holidayCalendarService.getDateType(calendarId, date).getDateType();
        List<HrAttendanceCheckin> raw = List.of();
        List<HrTimeRequest> approved = List.of();
        if (shift != null && ("WORKDAY".equals(dateType) || flag(shift.getMarkOnHolidayFlag()))) {
            raw = checkins(employeeId, date, date);
            approved = approvedRequests(employeeId, date.atStartOfDay(), date.plusDays(2).atStartOfDay());
        }
        return calculateFromFacts(employeeId, date, shift, dateType, raw, approved, LocalDateTime.now());
    }

    private List<HrTimeRequest> approvedRequests(Long employeeId, LocalDateTime from, LocalDateTime to) {
        return timeRequestMapper.selectApprovedOverlapping(tenantId(), employeeId, from, to);
    }

    private HrAttendanceRecord calculateFromFacts(Long employeeId, LocalDate date, HrShift shift, String dateType,
            List<HrAttendanceCheckin> raw, List<HrTimeRequest> approved, LocalDateTime now) {
        HrAttendanceRecord result;
        if (!"WORKDAY".equals(dateType) && (shift == null || !flag(shift.getMarkOnHolidayFlag()))) {
            result = emptyRecord(date, shift, dateType);
            result.setExpectedMinutes(0);
        } else if (shift == null) result = emptyRecord(date, null, "PENDING");
        else {
            result = HrAttendanceJudge.judge(shift, date, raw, now);
            LocalDateTime start = date.atTime(shift.getStartTime());
            LocalDateTime end = HrAttendanceJudge.shiftEnd(shift, date);
            List<HrTimeRequest> overlapping = approved.stream().filter(request -> request.getStartTime().isBefore(end)
                    && request.getEndTime().isAfter(start)).toList();
            if (overlapping.stream().anyMatch(request -> "LEAVE".equals(request.getRequestType()))) result.setStatus("LEAVE");
            else if (overlapping.stream().anyMatch(request -> "BUSINESS_TRIP".equals(request.getRequestType()))) result.setStatus("BUSINESS_TRIP");
            if (List.of("LEAVE", "BUSINESS_TRIP").contains(result.getStatus())) {
                result.setLateMinutes(0); result.setEarlyExitMinutes(0); result.setHalfDayFlag(0); result.setAbsentFlag(0);
            }
            if (raw.stream().anyMatch(checkin -> Integer.valueOf(0).equals(checkin.getLocationValidFlag()))) result.setRemark("存在打卡位置异常，待HR核查");
        }
        result.setDateType(dateType);
        result.setTenantId(tenantId()); result.setEmployeeId(employeeId); result.setManualAdjustedFlag(0); result.setDeleted(0);
        result.setVersion(0); result.setCreateBy(userName()); result.setUpdateBy(userName());
        result.setCreateTime(now); result.setUpdateTime(now); result.setRecalcTime(now);
        return result;
    }

    public HrAttendanceRecord calculateAndSave(Long employeeId, LocalDate date, boolean forceOverwrite) {
        return support.locked(attendanceLock(employeeId, date), () -> {
            HrAttendanceRecord old = findRecord(employeeId, date);
            if (old != null && flag(old.getManualAdjustedFlag()) && !forceOverwrite) return old;
            assertMonthOpen(employeeId, date);
            HrShift shift = resolveShift(employeeId, date);
            if (shift != null && (Integer.valueOf(0).equals(shift.getAutoAttendanceFlag())
                    || shift.getProcessAttendanceAfter() != null && date.isBefore(shift.getProcessAttendanceAfter()))) return old;
            HrAttendanceRecord fresh = calculate(employeeId, date);
            if (old == null) recordMapper.insert(fresh);
            else {
                fresh.setId(old.getId()); fresh.setVersion(old.getVersion()); fresh.setCreateBy(old.getCreateBy()); fresh.setCreateTime(old.getCreateTime());
                if (recordMapper.updateById(fresh) != 1) throw new HrBusinessException("ATTENDANCE_CONFLICT", "考勤记录已被其他操作修改");
            }
            checkinMapper.update(null, new LambdaUpdateWrapper<HrAttendanceCheckin>().eq(HrAttendanceCheckin::getTenantId, tenantId())
                    .eq(HrAttendanceCheckin::getEmployeeId, employeeId).eq(HrAttendanceCheckin::getAttendanceDate, date)
                    .set(HrAttendanceCheckin::getAttendanceRecordId, fresh.getId()));
            return fresh;
        });
    }

    public Map<String, Object> requestRecalculation(HrAttendanceRecalcRequest request) {
        if (request == null || !request.isConfirmed()) throw new HrBusinessException("CONFIRMATION_REQUIRED", "请确认考勤重算范围");
        validateRange(request.getStartDate(), request.getEndDate());
        List<HrEmployee> employees = support.selectAttendanceEmployees(request);
        long expected = Math.multiplyExact(employees.size(), ChronoUnit.DAYS.between(request.getStartDate(), request.getEndDate()) + 1);
        if (expected > 500) {
            HrAttendanceRecalcRequest task = objectMapper.convertValue(request, HrAttendanceRecalcRequest.class);
            task.setEmployeeIds(employees.stream().map(HrEmployee::getId).toList());
            return Map.of("asynchronous", true, "executeNo", asyncExecutor.submit("hrAttendanceRecalcAsync", task));
        }
        return Map.of("asynchronous", false, "affected", recalculate(request, employees));
    }

    public int recalculate(Long employeeId, LocalDate from, LocalDate to, boolean force) {
        HrAttendanceRecalcRequest request = new HrAttendanceRecalcRequest();
        request.setStartDate(from); request.setEndDate(to); request.setForceOverwrite(force);
        if (employeeId != null) request.setEmployeeIds(List.of(employeeId));
        validateRange(from, to);
        return recalculate(request, support.selectAttendanceEmployees(request));
    }

    public int recalculate(HrAttendanceRecalcRequest request, List<HrEmployee> employees) {
        validateRange(request.getStartDate(), request.getEndDate());
        int affected = 0;
        int skipped = 0;
        for (HrEmployee employee : employees) {
            for (YearMonth month = YearMonth.from(request.getStartDate()); !month.isAfter(YearMonth.from(request.getEndDate())); month = month.plusMonths(1)) {
                LocalDate from = request.getStartDate().isAfter(month.atDay(1)) ? request.getStartDate() : month.atDay(1);
                LocalDate to = request.getEndDate().isBefore(month.atEndOfMonth()) ? request.getEndDate() : month.atEndOfMonth();
                MonthRecalculation result = recalculateMonth(employee.getId(), month, from, to, request.isForceOverwrite());
                affected += result.affected(); skipped += result.skipped();
            }
        }
        support.audit("ATTENDANCE", null, "RECALCULATE", Map.of("from", request.getStartDate(), "to", request.getEndDate(), "affected", affected, "skipped", skipped, "forceOverwrite", request.isForceOverwrite()));
        return affected;
    }

    private MonthRecalculation recalculateMonth(Long employeeId, YearMonth month, LocalDate from, LocalDate to, boolean force) {
        return support.locked(attendanceLock(employeeId, from), () -> {
            HrEmployee employee = support.attendanceEmployeeInScope(employeeId);
            int requested = Math.toIntExact(ChronoUnit.DAYS.between(from, to)) + 1;
            HrAttendanceMonthly current = findMonth(employeeId, month);
            if (current != null && "CONFIRMED".equals(current.getStatus())) return new MonthRecalculation(0, requested);
            List<LocalDate> dates = employmentDates(employee, month);
            EmployeeCalendarCalculationBatch calendars = holidayCalendarService.getEmployeeCalculationBatch(employeeId, dates);
            Map<LocalDate, HolidayCalendarCalculation> calendarCalculations = calendars.calculations();
            Map<LocalDate, DayTypeInfo> dateTypes = new HashMap<>();
            calendarCalculations.forEach((date, calculation) -> dateTypes.put(date, calculation.getDateType(date)));
            List<EmployeeCalendarDay> assignments = calendars.assignments();
            List<Long> shiftIds = assignments.stream().map(EmployeeCalendarDay::shiftId).filter(Objects::nonNull).distinct().toList();
            Map<Long, HrShift> shifts = new HashMap<>();
            if (!shiftIds.isEmpty()) {
                for (HrShift shift : shiftMapper.selectBatchIds(shiftIds)) {
                    if (!Objects.equals(shift.getTenantId(), tenantId())) throw new HrBusinessException("SHIFT_NOT_FOUND", "班次不存在");
                    HrAttendanceJudge.validateShift(shift); shifts.put(shift.getId(), shift);
                }
                if (shifts.size() != shiftIds.size()) throw new HrBusinessException("SHIFT_NOT_FOUND", "班次不存在");
            }
            Map<LocalDate, HrShift> assignedShifts = new HashMap<>();
            for (EmployeeCalendarDay assignment : assignments) assignedShifts.put(assignment.attendanceDate(), shifts.get(assignment.shiftId()));
            Map<LocalDate, List<HrAttendanceCheckin>> punches = new HashMap<>();
            for (HrAttendanceCheckin punch : checkinMapper.selectEmployeeDates(tenantId(), employeeId, from, to)) {
                punches.computeIfAbsent(punch.getAttendanceDate(), key -> new ArrayList<>()).add(punch);
            }
            // The summary covers the whole month even when only part of it is recalculated.
            List<HrTimeRequest> approved = approvedRequests(employeeId, month.atDay(1).atStartOfDay(), month.plusMonths(1).atDay(2).atStartOfDay());
            Map<LocalDate, HrAttendanceRecord> byDate = new HashMap<>();
            for (HrAttendanceRecord existing : monthRecords(employeeId, month)) byDate.put(existing.getAttendanceDate(), existing);
            List<HrAttendanceRecord> inserts = new ArrayList<>(), updates = new ArrayList<>();
            List<LocalDate> processed = new ArrayList<>();
            LocalDateTime now = LocalDateTime.now();
            for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
                if (!employedOn(employee, date)) continue;
                HrAttendanceRecord old = byDate.get(date);
                if (old != null && flag(old.getManualAdjustedFlag()) && !force) continue;
                HrShift shift = assignedShifts.get(date);
                if (shift != null && (Integer.valueOf(0).equals(shift.getAutoAttendanceFlag())
                        || shift.getProcessAttendanceAfter() != null && date.isBefore(shift.getProcessAttendanceAfter()))) continue;
                HrAttendanceRecord fresh = calculateFromFacts(employeeId, date, shift, dateTypes.get(date).getDateType(),
                        punches.getOrDefault(date, List.of()), approved, now);
                if (old == null) inserts.add(fresh);
                else { fresh.setId(old.getId()); fresh.setVersion(old.getVersion()); updates.add(fresh); }
                byDate.put(date, fresh); processed.add(date);
            }
            // Compute the summary before writes, so all day calculations use one transaction-local input snapshot.
            HrAttendanceMonthly summary = calculateMonthSummary(employee, month, false, current, new ArrayList<>(byDate.values()), dateTypes, assignedShifts, approved, calendarCalculations);
            if (!inserts.isEmpty() && recordMapper.insertCalculatedBatch(inserts) != inserts.size()) {
                throw new HrBusinessException("ATTENDANCE_CONFLICT", "考勤批量写入未完成");
            }
            if (!updates.isEmpty() && recordMapper.updateCalculatedBatch(tenantId(), employeeId, updates) != updates.size()) {
                throw new HrBusinessException("ATTENDANCE_CONFLICT", "考勤记录已被其他操作修改");
            }
            if (!processed.isEmpty()) recordMapper.linkCalculatedCheckins(tenantId(), employeeId, processed);
            saveMonthlySummary(summary);
            return new MonthRecalculation(processed.size(), requested - processed.size());
        });
    }

    private List<HrAttendanceRecord> monthRecords(Long employeeId, YearMonth month) {
        return recordMapper.selectEmployeeDates(tenantId(), employeeId, month.atDay(1), month.atEndOfMonth());
    }

    private boolean employedOn(HrEmployee employee, LocalDate date) {
        return (employee.getHireDate() == null || !date.isBefore(employee.getHireDate()))
                && (employee.getResignDate() == null || !date.isAfter(employee.getResignDate()));
    }

    private List<LocalDate> employmentDates(HrEmployee employee, YearMonth month) {
        return month.atDay(1).datesUntil(month.plusMonths(1).atDay(1)).filter(date -> employedOn(employee, date)).toList();
    }

    private record MonthRecalculation(int affected, int skipped) { }

    public void adjust(Long recordId, HrAttendanceRecordPayload payload) {
        HrAttendanceRecord original = recordMapper.selectById(recordId);
        if (original == null || !Objects.equals(tenantId(), original.getTenantId())) throw new HrBusinessException("RECORD_NOT_FOUND", "考勤记录不存在");
        support.assertEmployeeScope(original.getEmployeeId());
        if (payload == null || !StringUtils.hasText(payload.getRemark()) || payload.getStatus() == null
                || !List.of("NORMAL", "LATE", "EARLY_EXIT", "LATE_AND_EARLY", "HALF_DAY", "ABSENT", "LEAVE", "HOLIDAY", "REST", "BUSINESS_TRIP", "PENDING").contains(payload.getStatus())) {
            throw new HrBusinessException("INVALID_ADJUSTMENT", "请选择有效判定并填写调整原因");
        }
        support.locked(attendanceLock(original.getEmployeeId(), original.getAttendanceDate()), () -> {
            assertMonthOpen(original.getEmployeeId(), original.getAttendanceDate());
            for (Integer value : new Integer[]{payload.getWorkMinutes(), payload.getExpectedMinutes(), payload.getLateMinutes(), payload.getEarlyExitMinutes()}) {
                if (value != null && value < 0) throw new HrBusinessException("INVALID_ADJUSTMENT", "考勤分钟数不可为负");
            }
            LambdaUpdateWrapper<HrAttendanceRecord> update = new LambdaUpdateWrapper<HrAttendanceRecord>()
                    .eq(HrAttendanceRecord::getTenantId, tenantId()).eq(HrAttendanceRecord::getId, recordId)
                    .set(HrAttendanceRecord::getStatus, payload.getStatus()).set(HrAttendanceRecord::getManualAdjustedFlag, 1)
                    .set(HrAttendanceRecord::getAbsentFlag, "ABSENT".equals(payload.getStatus()) ? 1 : 0)
                    .set(HrAttendanceRecord::getHalfDayFlag, "HALF_DAY".equals(payload.getStatus()) ? 1 : 0)
                    .set(HrAttendanceRecord::getRemark, payload.getRemark()).set(HrAttendanceRecord::getUpdateBy, userName())
                    .set(payload.getWorkMinutes() != null, HrAttendanceRecord::getWorkMinutes, payload.getWorkMinutes())
                    .set(payload.getExpectedMinutes() != null, HrAttendanceRecord::getExpectedMinutes, payload.getExpectedMinutes())
                    .set(payload.getLateMinutes() != null, HrAttendanceRecord::getLateMinutes, payload.getLateMinutes())
                    .set(payload.getEarlyExitMinutes() != null, HrAttendanceRecord::getEarlyExitMinutes, payload.getEarlyExitMinutes());
            recordMapper.update(null, update);
            support.audit("ATTENDANCE", recordId, "MANUAL_ADJUST", payload);
            return null;
        });
        summarizeMonth(original.getEmployeeId(), YearMonth.from(original.getAttendanceDate()), false);
    }

    public HrAttendanceMonthly summarizeMonth(Long employeeId, YearMonth month, boolean confirm) {
        support.assertEmployeeScope(employeeId);
        return support.locked(attendanceLock(employeeId, month.atDay(1)), () -> {
            HrAttendanceMonthly current = findMonth(employeeId, month);
            if (current != null && "CONFIRMED".equals(current.getStatus())) return current;
            HrEmployee employee = support.employee(employeeId);
            Map<LocalDate, DayTypeInfo> dateTypes = holidayCalendarService.getEmployeeDateTypes(employeeId, employmentDates(employee, month));
            List<HrTimeRequest> approved = approvedRequests(employeeId, month.atDay(1).atStartOfDay(), month.plusMonths(1).atDay(2).atStartOfDay());
            HrAttendanceMonthly summary = calculateMonthSummary(employee, month, confirm, current, monthRecords(employeeId, month), dateTypes, null, approved, null);
            saveMonthlySummary(summary);
            if (confirm) support.audit("ATTENDANCE_MONTHLY", summary.getId(), "CONFIRM", Map.of("month", month.toString()));
            return summary;
        });
    }

    private HrAttendanceMonthly calculateMonthSummary(HrEmployee employee, YearMonth month, boolean confirm,
            HrAttendanceMonthly current, List<HrAttendanceRecord> rows, Map<LocalDate, DayTypeInfo> dateTypes,
            Map<LocalDate, HrShift> assignedShifts, List<HrTimeRequest> approved, Map<LocalDate, HolidayCalendarCalculation> calendarCalculations) {
        Long employeeId = employee.getId();
        Map<LocalDate, HrAttendanceRecord> byDate = new java.util.HashMap<>();
        for (HrAttendanceRecord row : rows) byDate.put(row.getAttendanceDate(), row);
        BigDecimal workDays = BigDecimal.ZERO;
        for (LocalDate date = month.atDay(1); !date.isAfter(month.atEndOfMonth()); date = date.plusDays(1)) {
            if (employee.getHireDate() != null && date.isBefore(employee.getHireDate())
                    || employee.getResignDate() != null && date.isAfter(employee.getResignDate())) continue;
            DayTypeInfo dayType = dateTypes.get(date);
            if (dayType != null && "WORKDAY".equals(dayType.getDateType())) {
                workDays = workDays.add(BigDecimal.ONE);
                HrAttendanceRecord row = byDate.get(date);
                if (confirm && (row == null || "PENDING".equals(row.getStatus()))) throw new HrBusinessException("ATTENDANCE_INCOMPLETE", "考勤未齐备：" + date);
            }
        }
        BigDecimal actual = BigDecimal.ZERO;
        BigDecimal absent = BigDecimal.ZERO;
        BigDecimal leave = BigDecimal.ZERO;
        BigDecimal overtime = BigDecimal.ZERO;
        int late = 0;
        int early = 0;
        for (HrAttendanceRecord row : rows) {
            if (employee.getHireDate() != null && row.getAttendanceDate().isBefore(employee.getHireDate())
                    || employee.getResignDate() != null && row.getAttendanceDate().isAfter(employee.getResignDate())) continue;
            if (row.getLateMinutes() != null && row.getLateMinutes() > 0) late++;
            if (row.getEarlyExitMinutes() != null && row.getEarlyExitMinutes() > 0) early++;
            if ("WORKDAY".equals(row.getDateType())) {
                if ("ABSENT".equals(row.getStatus())) absent = absent.add(BigDecimal.ONE);
                else if ("HALF_DAY".equals(row.getStatus())) { absent = absent.add(new BigDecimal("0.5")); actual = actual.add(new BigDecimal("0.5")); }
                else if ("LEAVE".equals(row.getStatus())) {
                    BigDecimal fraction = leaveFraction(employeeId, row.getAttendanceDate(), approved, assignedShifts, calendarCalculations);
                    leave = leave.add(fraction);
                    actual = actual.add(BigDecimal.ONE.subtract(fraction));
                }
                else if (!"PENDING".equals(row.getStatus())) actual = actual.add(BigDecimal.ONE);
            }
            if (row.getOvertimeMinutes() != null) overtime = overtime.add(BigDecimal.valueOf(row.getOvertimeMinutes()));
        }
        HrAttendanceMonthly summary = current == null ? new HrAttendanceMonthly() : current;
        summary.setTenantId(tenantId()); summary.setEmployeeId(employeeId); summary.setYear(month.getYear()); summary.setMonth(month.getMonthValue());
        summary.setWorkDays(amount(workDays)); summary.setActualDays(amount(actual)); summary.setAbsentDays(amount(absent)); summary.setLeaveDays(amount(leave));
        summary.setLateTimes(late); summary.setEarlyTimes(early); summary.setOvertimeHours(overtime.divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP));
        summary.setAttendanceRate(workDays.signum() == 0 ? BigDecimal.ZERO : actual.multiply(BigDecimal.valueOf(100)).divide(workDays, 2, RoundingMode.HALF_UP));
        summary.setStatus(confirm ? "CONFIRMED" : "DRAFT"); summary.setUpdateTime(LocalDateTime.now());
        if (current == null) { summary.setCreateTime(LocalDateTime.now()); summary.setVersion(0); }
        return summary;
    }

    private void saveMonthlySummary(HrAttendanceMonthly summary) {
        if (summary.getId() == null) monthlyMapper.insert(summary);
        else if (monthlyMapper.updateById(summary) != 1) throw new HrBusinessException("ATTENDANCE_CONFLICT", "月考勤已被其他操作修改");
    }

    public void applyAppeal(HrAttendanceAppeal appeal) {
        if (appeal == null || !Objects.equals(tenantId(), appeal.getTenantId()) || appeal.getAttendanceRecordId() == null) {
            throw new HrBusinessException("INVALID_APPEAL", "考勤申诉必须关联日考勤结论");
        }
        support.locked(attendanceLock(appeal.getEmployeeId(), appeal.getAttendanceDate()), () -> {
            HrAttendanceRecord current = recordMapper.selectById(appeal.getAttendanceRecordId());
            if (current == null || !Objects.equals(current.getTenantId(), tenantId()) || !Objects.equals(current.getEmployeeId(), appeal.getEmployeeId())
                    || !Objects.equals(current.getAttendanceDate(), appeal.getAttendanceDate())) throw new HrBusinessException("INVALID_APPEAL_RECORD", "申诉员工、日期与日考勤结论不匹配");
            if (Objects.equals(current.getAppealId(), appeal.getId()) && flag(current.getManualAdjustedFlag())) return null;
            assertMonthOpen(appeal.getEmployeeId(), appeal.getAttendanceDate());
            for (String logType : List.of("IN", "OUT")) {
                LocalDateTime time = "IN".equals(logType) ? appeal.getExpectedCheckIn() : appeal.getExpectedCheckOut();
                if (time == null) continue;
                HrAttendanceCheckinPayload punch = new HrAttendanceCheckinPayload();
                punch.setEmployeeId(appeal.getEmployeeId()); punch.setLogType(logType); punch.setCheckTime(time);
                punch.setCheckMethod("MANUAL"); punch.setRemark("申诉补卡，申诉ID=" + appeal.getId());
                Long checkinId = checkin(punch);
                if (!Objects.equals(checkinMapper.selectById(checkinId).getAttendanceDate(), appeal.getAttendanceDate())) {
                    throw new HrBusinessException("INVALID_APPEAL_TIME", "补卡时间未归属于申诉考勤日");
                }
            }
            if (appeal.getExpectedCheckIn() != null || appeal.getExpectedCheckOut() != null) calculateAndSave(appeal.getEmployeeId(), appeal.getAttendanceDate(), true);
            else recordMapper.update(null, new LambdaUpdateWrapper<HrAttendanceRecord>().eq(HrAttendanceRecord::getId, current.getId())
                    .eq(HrAttendanceRecord::getTenantId, tenantId()).set(HrAttendanceRecord::getStatus, "NORMAL")
                    .set(HrAttendanceRecord::getAbsentFlag, 0).set(HrAttendanceRecord::getHalfDayFlag, 0)
                    .set(HrAttendanceRecord::getLateMinutes, 0).set(HrAttendanceRecord::getEarlyExitMinutes, 0)
                    .set(HrAttendanceRecord::getWorkMinutes, current.getExpectedMinutes()));
            recordMapper.update(null, new LambdaUpdateWrapper<HrAttendanceRecord>().eq(HrAttendanceRecord::getTenantId, tenantId())
                    .eq(HrAttendanceRecord::getId, current.getId()).set(HrAttendanceRecord::getManualAdjustedFlag, 1)
                    .set(HrAttendanceRecord::getAppealId, appeal.getId()).set(HrAttendanceRecord::getRemark, "申诉修正：" + appeal.getReason()));
            support.audit("ATTENDANCE", current.getId(), "APPEAL_ADJUST", Map.of("appealId", appeal.getId()));
            return null;
        });
        summarizeMonth(appeal.getEmployeeId(), YearMonth.from(appeal.getAttendanceDate()), false);
    }

    public Long saveShift(Long shiftId, HrShiftPayload payload) {
        if (payload == null) throw new HrBusinessException("INVALID_SHIFT", "班次不能为空");
        Map<String, Object> fields = support.configurationPayload(payload, "id");
        preserveShiftDefaults(fields);
        if (!payload.isHolidayCalendarIdSpecified()) fields.remove("holidayCalendarId");
        return support.locked("attendance-config", () -> {
            hGuard.assertMutable("shift", shiftId);
            HrShift current = shiftId == null ? null : getShift(shiftId);
            if (current != null && payload.getVersion() != null && !Objects.equals(payload.getVersion(), current.getVersion())) {
                throw new HrBusinessException("SHIFT_VERSION_CONFLICT", "班次已被修改，请刷新后重试");
            }
            Map<String, Object> merged = current == null ? new java.util.LinkedHashMap<>()
                    : support.configurationPayload(current, "id");
            merged.putAll(fields);
            HrShift shift = objectMapper.convertValue(merged, HrShift.class);
            if (!StringUtils.hasText(shift.getShiftCode()) || !StringUtils.hasText(shift.getShiftName())) {
                throw new HrBusinessException("INVALID_SHIFT", "班次编码和名称不能为空");
            }
            HrAttendanceJudge.validateShift(shift);
            if (shift.getHolidayCalendarId() != null) holidayCalendarService.getDateType(shift.getHolidayCalendarId(), LocalDate.now());
            Long savedId = shiftId;
            if (shiftId == null) savedId = crudService.create(HrShift.class, fields);
            else crudService.update(HrShift.class, shiftId, fields);
            holidayCalendarService.invalidateAssignments();
            return savedId;
        });
    }

    static void preserveShiftDefaults(Map<String, Object> fields) {
        for (String field : List.of("shiftCode", "shiftName", "startTime", "endTime", "breakMinutes", "workMinutes",
                "checkinWindowBeforeMinutes", "checkoutWindowAfterMinutes", "lateGraceMinutes", "earlyExitGraceMinutes",
                "halfDayHoursThreshold", "absentHoursThreshold", "workingHoursCalcMode", "checkinDetermineMode",
                "autoAttendanceFlag", "markOnHolidayFlag", "overtimeThresholdMinutes", "status")) {
            if (fields.get(field) == null) fields.remove(field);
        }
    }

    public Long saveRule(Long ruleId, HrAttendanceRulePayload payload) {
        if (payload == null || !StringUtils.hasText(payload.getRuleName())) throw new HrBusinessException("INVALID_RULE", "考勤规则名称不能为空");
        if (payload.getShiftId() != null) getShift(payload.getShiftId());
        HrShiftBreaks.resolve(payload.getShiftId() == null ? null : getShift(payload.getShiftId()), LocalDate.of(2000, 1, 1), payload.getConfigJson(), false);
        if (!payload.hasValidCheckMethods()) {
            throw new HrBusinessException("INVALID_RULE", "规则包含不支持的打卡方式");
        }
        if (payload.getConfigJson() != null && payload.getConfigJson().hasNonNull("geofence")) {
            JsonNode fence = payload.getConfigJson().path("geofence");
            if (!fence.path("latitude").isNumber() || !fence.path("longitude").isNumber() || !fence.path("radiusMeters").isNumber()
                    || Math.abs(fence.path("latitude").asDouble()) > 90 || Math.abs(fence.path("longitude").asDouble()) > 180
                    || fence.path("radiusMeters").asDouble() <= 0) throw new HrBusinessException("INVALID_GEOFENCE", "围栏须包含合法经纬度及正数半径");
        }
        return support.locked("attendance-config", () -> {
            hGuard.assertMutable("rule", ruleId);
            Map<String, Object> fields = support.configurationPayload(payload, "id");
            Long savedId = ruleId;
            if (ruleId == null) savedId = crudService.create(HrAttendanceRule.class, fields);
            else crudService.update(HrAttendanceRule.class, ruleId, fields);
            holidayCalendarService.invalidateAssignments();
            return savedId;
        });
    }

    public Long saveSchedule(Long scheduleId, HrScheduleAssignmentPayload payload) {
        if (payload != null && payload.getSourceShiftRequestId() != null) throw new HrBusinessException("H_SOURCE_SERVER_ONLY", "调班来源字段仅由内部审批应用生成");
        if (payload == null || payload.getTargetId() == null || payload.getTargetType() == null
                || !List.of("EMPLOYEE", "DEPT").contains(payload.getTargetType())
                || payload.getScheduleDate() == null && payload.getEffectiveStart() == null
                || payload.getEffectiveEnd() != null && payload.getEffectiveStart() != null && payload.getEffectiveEnd().isBefore(payload.getEffectiveStart())) {
            throw new HrBusinessException("INVALID_SCHEDULE", "排班须指定员工或部门以及有效日期范围");
        }
        assertScheduleScope(objectMapper.convertValue(payload, HrScheduleAssignment.class));
        if ("DEPT".equals(payload.getTargetType())) {
            if (lookupMapper.findDeptName(tenantId(), payload.getTargetId()) == null) throw new HrBusinessException("INVALID_DEPARTMENT", "部门不存在");
        }
        if (payload.getRuleId() != null) {
            HrAttendanceRule rule = ruleMapper.selectById(payload.getRuleId());
            if (rule == null || !Objects.equals(rule.getTenantId(), tenantId())) throw new HrBusinessException("INVALID_RULE", "考勤规则不存在");
            if (payload.getShiftId() == null && rule.getShiftId() == null) throw new HrBusinessException("INVALID_SHIFT", "排班须绑定班次");
        } else if (payload.getShiftId() == null) throw new HrBusinessException("INVALID_SHIFT", "排班须绑定班次");
        if (payload.getShiftId() != null) getShift(payload.getShiftId());
        return support.locked("attendance-config", () -> {
            hGuard.assertMutable("schedule", scheduleId);
            if (scheduleId != null) {
                HrScheduleAssignment original = scheduleMapper.selectById(scheduleId);
                if (original == null || !Objects.equals(original.getTenantId(), tenantId())) throw new HrBusinessException("SCHEDULE_NOT_FOUND", "排班不存在");
                assertScheduleScope(original);
            }
            Map<String, Object> fields = support.configurationPayload(payload, "id");
            Long savedId = scheduleId;
            if (scheduleId == null) savedId = crudService.create(HrScheduleAssignment.class, fields);
            else crudService.update(HrScheduleAssignment.class, scheduleId, fields);
            hGuard.assertAssignmentSnapshots();
            holidayCalendarService.invalidateAssignments();
            return savedId;
        });
    }

    @Audit(name = "删除考勤配置", spel = "#id", highRisk = true)
    public void deleteConfiguration(String resource, Long id) {
        support.locked("attendance-config", () -> {
            hGuard.assertMutable(resource, id);
            Class<?> entity = switch (resource) {
                case "shift" -> HrShift.class;
                case "rule" -> HrAttendanceRule.class;
                case "schedule" -> HrScheduleAssignment.class;
                default -> throw new HrBusinessException("INVALID_RESOURCE", "考勤配置类别无效");
            };
            if ("schedule".equals(resource)) {
                HrScheduleAssignment original = scheduleMapper.selectById(id);
                if (original == null || !Objects.equals(original.getTenantId(), tenantId())) throw new HrBusinessException("SCHEDULE_NOT_FOUND", "排班不存在");
                assertScheduleScope(original);
            }
            if (!"schedule".equals(resource) && scheduleMapper.selectCount(new LambdaQueryWrapper<HrScheduleAssignment>()
                    .eq(HrScheduleAssignment::getTenantId, tenantId())
                    .eq("shift".equals(resource), HrScheduleAssignment::getShiftId, id)
                    .eq("rule".equals(resource), HrScheduleAssignment::getRuleId, id)) > 0) throw new HrBusinessException("CONFIG_IN_USE", "配置已被排班引用，不能删除");
            if ("shift".equals(resource) && (ruleMapper.selectCount(new LambdaQueryWrapper<HrAttendanceRule>()
                    .eq(HrAttendanceRule::getTenantId, tenantId()).eq(HrAttendanceRule::getShiftId, id)) > 0
                    || recordMapper.selectCount(new LambdaQueryWrapper<HrAttendanceRecord>()
                    .eq(HrAttendanceRecord::getTenantId, tenantId()).eq(HrAttendanceRecord::getShiftId, id)) > 0
                    || checkinMapper.selectCount(new LambdaQueryWrapper<HrAttendanceCheckin>()
                    .eq(HrAttendanceCheckin::getTenantId, tenantId()).eq(HrAttendanceCheckin::getShiftId, id)) > 0)) throw new HrBusinessException("CONFIG_IN_USE", "班次已被规则、考勤或原始打卡引用，不能删除");
            crudService.delete(entity, id);
            holidayCalendarService.invalidateAssignments();
            return null;
        });
    }

    private HrShift resolveShift(Long employeeId, LocalDate date) {
        Long shiftId = resolverMapper.selectAssignedShiftId(employeeId, date, tenantId());
        return shiftId == null ? null : getShift(shiftId);
    }

    private void assertScheduleScope(HrScheduleAssignment schedule) {
        if ("EMPLOYEE".equals(schedule.getTargetType())) { support.assertEmployeeScope(schedule.getTargetId()); return; }
        Integer scope = com.cloudflow.common.core.context.UserContext.getDsType();
        boolean allowed = scope == null || scope == 0 || scope == 3
                && Objects.equals(schedule.getTargetId(), com.cloudflow.common.core.context.UserContext.getDeptId())
                || (scope == 1 || scope == 2) && com.cloudflow.common.core.context.UserContext.getDsDeptIds().contains(schedule.getTargetId());
        if (!allowed) throw new HrBusinessException("FORBIDDEN", "无权维护该部门排班");
    }

    private HrShift getShift(Long shiftId) {
        HrShift shift = shiftMapper.selectById(shiftId);
        if (shift == null || !Objects.equals(tenantId(), shift.getTenantId())) throw new HrBusinessException("SHIFT_NOT_FOUND", "班次不存在");
        HrAttendanceJudge.validateShift(shift);
        return shift;
    }

    private ShiftMatch matchShift(HrAttendanceCheckinPayload payload) {
        ShiftMatch selected = null;
        long closest = Long.MAX_VALUE;
        for (int offset = -1; offset <= 1; offset++) {
            LocalDate date = payload.getCheckTime().toLocalDate().plusDays(offset);
            HrShift shift = resolveShift(payload.getEmployeeId(), date);
            if (shift == null || payload.getShiftId() != null && !payload.getShiftId().equals(shift.getId())
                    || !HrAttendanceJudge.inWindow(shift, date, payload.getCheckTime())) continue;
            LocalDateTime expected = "OUT".equals(payload.getLogType()) ? HrAttendanceJudge.shiftEnd(shift, date) : date.atTime(shift.getStartTime());
            long distance = Math.abs(ChronoUnit.SECONDS.between(expected, payload.getCheckTime()));
            if (distance < closest) { closest = distance; selected = new ShiftMatch(shift, date); }
        }
        if (selected != null) return selected;
        LocalDate date = payload.getCheckTime().toLocalDate();
        HrShift shift = resolveShift(payload.getEmployeeId(), date);
        if (payload.getShiftId() != null && (shift == null || !payload.getShiftId().equals(shift.getId()))) throw new HrBusinessException("SHIFT_NOT_ASSIGNED", "指定班次不属于该员工的有效排班");
        return new ShiftMatch(shift, date);
    }

    private boolean locationValid(HrAttendanceCheckinPayload payload, LocalDate date) {
        if (payload.getLatitude() != null && payload.getLatitude().abs().compareTo(BigDecimal.valueOf(90)) > 0
                || payload.getLongitude() != null && payload.getLongitude().abs().compareTo(BigDecimal.valueOf(180)) > 0) throw new HrBusinessException("INVALID_LOCATION", "经纬度超出合法范围");
        Long ruleId = resolverMapper.selectAssignedRuleId(payload.getEmployeeId(), date, tenantId());
        HrAttendanceRule rule = ruleId == null ? null : ruleMapper.selectById(ruleId);
        if (rule == null) return true;
        if (!Objects.equals(rule.getTenantId(), tenantId())) throw new HrBusinessException("INVALID_RULE", "考勤规则不属于当前租户");
        if (!rule.hasValidCheckMethods()) throw new HrBusinessException("INVALID_RULE", "打卡方式配置无效，请先核定有效打卡方式");
        if (rule.getCheckMethods() != null && !rule.getCheckMethods().isEmpty() && !"MANUAL".equals(payload.getCheckMethod())
                && !rule.getCheckMethods().contains(payload.getCheckMethod())) throw new HrBusinessException("CHECK_METHOD_NOT_ALLOWED", "当前规则不允许此打卡方式");
        if (rule.getConfigJson() == null || "MANUAL".equals(payload.getCheckMethod())) return true;
        JsonNode fence = rule.getConfigJson().path("geofence");
        if (fence.isMissingNode() || fence.isNull()) return true;
        if (!fence.path("latitude").isNumber() || !fence.path("longitude").isNumber() || !fence.path("radiusMeters").isNumber()
                || fence.path("radiusMeters").asDouble() <= 0) throw new HrBusinessException("INVALID_GEOFENCE", "考勤围栏配置不完整");
        if (payload.getLatitude() == null || payload.getLongitude() == null) return false;
        double latitude = Math.toRadians(payload.getLatitude().doubleValue());
        double centerLatitude = Math.toRadians(fence.path("latitude").asDouble());
        double deltaLatitude = latitude - centerLatitude;
        double deltaLongitude = Math.toRadians(payload.getLongitude().doubleValue() - fence.path("longitude").asDouble());
        double haversine = Math.pow(Math.sin(deltaLatitude / 2), 2) + Math.cos(latitude) * Math.cos(centerLatitude) * Math.pow(Math.sin(deltaLongitude / 2), 2);
        double distance = 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, haversine)));
        return distance <= fence.path("radiusMeters").asDouble();
    }

    private HrAttendanceRecord findRecord(Long employeeId, LocalDate date) {
        return recordMapper.selectOne(new LambdaQueryWrapper<HrAttendanceRecord>().eq(HrAttendanceRecord::getTenantId, tenantId())
                .eq(HrAttendanceRecord::getEmployeeId, employeeId).eq(HrAttendanceRecord::getAttendanceDate, date).eq(HrAttendanceRecord::getDeleted, 0));
    }

    private BigDecimal leaveFraction(Long employeeId, LocalDate date, List<HrTimeRequest> requests, Map<LocalDate, HrShift> assignedShifts,
            Map<LocalDate, HolidayCalendarCalculation> calendarCalculations) {
        BigDecimal fraction = BigDecimal.ZERO;
        for (HrTimeRequest request : requests) {
            if (!"LEAVE".equals(request.getRequestType()) || !request.getStartTime().isBefore(date.plusDays(2).atStartOfDay())
                    || !request.getEndTime().isAfter(date.atStartOfDay())) continue;
            fraction = fraction.add(assignedShifts == null ? dayCalculator.fraction(employeeId, request, date, false)
                    : dayCalculator.fraction(employeeId, request, date, false, assignedShifts.get(date), calendarCalculations.get(date)));
        }
        return fraction.min(BigDecimal.ONE);
    }

    public Long createManualRecord(HrAttendanceRecordPayload payload) {
        if (payload == null || payload.getAttendanceDate() == null) throw new HrBusinessException("INVALID_DATE", "考勤日期不能为空");
        support.assertEmployeeScope(payload.getEmployeeId());
        return support.locked(attendanceLock(payload.getEmployeeId(), payload.getAttendanceDate()), () -> {
            if (findRecord(payload.getEmployeeId(), payload.getAttendanceDate()) != null) throw new HrBusinessException("ATTENDANCE_EXISTS", "该员工当日考勤已存在，请使用人工调整");
            assertMonthOpen(payload.getEmployeeId(), payload.getAttendanceDate());
            HrAttendanceRecord record = calculate(payload.getEmployeeId(), payload.getAttendanceDate());
            recordMapper.insert(record);
            adjust(record.getId(), payload);
            return record.getId();
        });
    }

    private HrAttendanceMonthly findMonth(Long employeeId, YearMonth month) {
        return monthlyMapper.selectEmployeeMonth(tenantId(), employeeId, month.getYear(), month.getMonthValue());
    }

    private void assertMonthOpen(Long employeeId, LocalDate date) {
        HrAttendanceMonthly monthly = findMonth(employeeId, YearMonth.from(date));
        if (monthly != null && "CONFIRMED".equals(monthly.getStatus())) throw new HrBusinessException("ATTENDANCE_CLOSED", "该月考勤已封账，不可修改");
    }

    private HrAttendanceRecord emptyRecord(LocalDate date, HrShift shift, String status) {
        HrAttendanceRecord result = new HrAttendanceRecord();
        result.setAttendanceDate(date); result.setShiftId(shift == null ? null : shift.getId()); result.setStatus(status);
        result.setWorkMinutes(0); result.setExpectedMinutes(0); result.setLateMinutes(0); result.setEarlyExitMinutes(0); result.setOvertimeMinutes(0);
        result.setHalfDayFlag(0); result.setAbsentFlag(0); result.setCheckinCount(0);
        return result;
    }

    private void validateRange(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) throw new HrBusinessException("INVALID_DATE_RANGE", "考勤日期范围无效");
    }

    private String attendanceLock(Long employeeId, LocalDate date) { return "attendance:" + employeeId + ":" + YearMonth.from(date); }
    private record ShiftMatch(HrShift shift, LocalDate date) {}
}
