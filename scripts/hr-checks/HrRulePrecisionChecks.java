package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.audit.HighRiskAuditVerifier;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.holiday.domain.HolidayCalendar;
import com.cloudflow.common.holiday.domain.HolidayDate;
import com.cloudflow.common.holiday.mapper.HolidayCalendarMapper;
import com.cloudflow.common.holiday.mapper.HolidayDateMapper;
import com.cloudflow.common.holiday.mapper.HolidayResolverMapper;
import com.cloudflow.common.holiday.service.HolidayCalendarServiceImpl;
import com.cloudflow.hr.config.HrRedisConfiguration;
import com.cloudflow.hr.domain.dto.HrShiftPayload;
import com.cloudflow.hr.domain.entity.*;
import com.cloudflow.hr.mapper.HrShiftMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.lang.reflect.Constructor;
import java.lang.reflect.Parameter;
import java.util.LinkedHashMap;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.redisson.config.ClusterServersConfig;
import org.redisson.config.Config;
import org.redisson.config.SingleServerConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationContext;

import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.BiFunction;

public final class HrRulePrecisionChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        for (Class<?> entity : List.of(HolidayCalendar.class, HolidayDate.class, HrLeaveLedger.class, HrShift.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "hr-rule-checks"), entity);
        }
        identity();
        try {
            startupAuditContracts();
            startupRedisContracts();
            calendars();
            attendance();
            shiftWritePayload();
            leaveLedger();
            payroll();
            grievances();
            if (arguments.length > 0) HrRuleDatabaseChecks.run(arguments[0]);
        } finally {
            UserContext.clear();
        }
        System.out.println("PASS: " + checks + " HR rule boundary checks");
    }

    private static void shiftWritePayload() throws Exception {
        ObjectMapper json = new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();
        HrShiftPayload omitted = json.readValue("{\"shiftName\":\"保留日历\"}", com.cloudflow.hr.domain.dto.HrShiftPayload.class);
        equal(false, omitted.isHolidayCalendarIdSpecified(), "omitted shift calendar stays unspecified");
        HrShiftPayload cleared = json.readValue("{\"holidayCalendarId\":null}", com.cloudflow.hr.domain.dto.HrShiftPayload.class);
        equal(true, cleared.isHolidayCalendarIdSpecified(), "explicit null shift calendar is recorded");
        equal(null, cleared.getHolidayCalendarId(), "explicit null shift calendar can inherit department");
        HrShiftPayload selected = json.readValue("{\"holidayCalendarId\":123,\"holidayCalendarIdSpecified\":false}", com.cloudflow.hr.domain.dto.HrShiftPayload.class);
        equal(true, selected.isHolidayCalendarIdSpecified(), "client cannot forge calendar presence metadata");
        equal(123L, selected.getHolidayCalendarId(), "selected shift calendar retained");
        equal(false, json.readTree(json.writeValueAsString(selected)).has("holidayCalendarIdSpecified"), "calendar presence flag is never serialized");
        LinkedHashMap<String, Object> fields = json.convertValue(cleared, new com.fasterxml.jackson.core.type.TypeReference<java.util.LinkedHashMap<String, Object>>() {});
        HrAttendanceBusinessService.preserveShiftDefaults(fields);
        for (String field : List.of("shiftCode", "shiftName", "startTime", "endTime", "breakMinutes", "workMinutes",
                "checkinWindowBeforeMinutes", "checkoutWindowAfterMinutes", "lateGraceMinutes", "earlyExitGraceMinutes",
                "halfDayHoursThreshold", "absentHoursThreshold", "workingHoursCalcMode", "checkinDetermineMode",
                "autoAttendanceFlag", "markOnHolidayFlag", "overtimeThresholdMinutes", "status")) {
            equal(false, fields.containsKey(field), "omitted non-nullable shift field preserves its value: " + field);
        }
        equal(true, fields.containsKey("holidayCalendarId"), "nullable calendar remains available for explicit clearing");
        fields.put("markOnHolidayFlag", 0);
        fields.put("workMinutes", 480);
        HrAttendanceBusinessService.preserveShiftDefaults(fields);
        equal(0, fields.get("markOnHolidayFlag"), "explicit zero flag remains writable");
        equal(480, fields.get("workMinutes"), "explicit shift work minutes retained");
    }

    static void identity() {
        UserContext.setTenantId(100000L);
        UserContext.setUserId(1L);
        UserContext.setUserName("batch-d-check");
        UserContext.setDsType(0);
        UserContext.setRoles(Set.of("hr"));
    }

    private static void startupAuditContracts() throws ReflectiveOperationException {
        for (Class<?> service : List.of(HrAttendanceBusinessService.class, HrLeaveBusinessService.class,
                HrPayrollBatchService.class, HrPayrollConfigurationService.class, HrRuleWorkflowService.class)) {
            Constructor<?> constructor = service.getConstructors()[0];
            Object bean = constructor.newInstance(new Object[constructor.getParameterCount()]);
            ApplicationContext context = proxy(ApplicationContext.class, (method, arguments) -> Map.of(service.getName(), bean));
            new HighRiskAuditVerifier(context).afterSingletonsInstantiated();
            checks++;
        }
    }

    private static void startupRedisContracts() throws ReflectiveOperationException {
        HrRedisConfiguration customizer = new HrRedisConfiguration();
        Parameter parameter = HrRedisConfiguration.class.getMethod("hrRedisPoolCustomizer", int.class).getParameters()[0];
        equal("${cloudflow.hr.redis.minimum-idle-connections:4}", parameter.getAnnotation(Value.class).value(), "HR minimum idle defaults to four");
        Config single = new Config();
        SingleServerConfig server = single.useSingleServer().setAddress("redis://127.0.0.1:6379").setConnectionPoolSize(32).setConnectionMinimumIdleSize(24);
        customizer.hrRedisPoolCustomizer(4).customize(single);
        equal(4, server.getConnectionMinimumIdleSize(), "HR startup only preallocates four connections");
        equal(32, server.getConnectionPoolSize(), "HR maximum pool size preserved");
        customizer.hrRedisPoolCustomizer(0).customize(single);
        equal(0, server.getConnectionMinimumIdleSize(), "zero minimum idle accepted");
        customizer.hrRedisPoolCustomizer(32).customize(single);
        equal(32, server.getConnectionMinimumIdleSize(), "pool size boundary accepted");
        fails(() -> customizer.hrRedisPoolCustomizer(-1).customize(single), "negative minimum idle rejected");
        fails(() -> customizer.hrRedisPoolCustomizer(33).customize(single), "minimum idle above pool size rejected");
        Config cluster = new Config();
        ClusterServersConfig clusterServers = cluster.useClusterServers().addNodeAddress("redis://127.0.0.1:6379").setMasterConnectionMinimumIdleSize(24);
        customizer.hrRedisPoolCustomizer(4).customize(cluster);
        equal(false, cluster.isSingleConfig(), "cluster mode preserved");
        equal(24, clusterServers.getMasterConnectionMinimumIdleSize(), "cluster pool unchanged");
    }

    private static void calendars() {
        HolidayCalendar calendar = new HolidayCalendar();
        calendar.setCalendarId(100L); calendar.setTenantId(100000L); calendar.setStatus("ENABLED");
        calendar.setDefaultFlag(1); calendar.setDeleted(0); calendar.setWeeklyRestDays("6,7");
        calendar.setWorkStartTime(LocalTime.of(9, 0)); calendar.setWorkEndTime(LocalTime.of(18, 0));
        calendar.setLunchStartTime(LocalTime.NOON); calendar.setLunchEndTime(LocalTime.of(13, 0));
        List<HolidayDate> dates = List.of(holiday("2026-01-01", "HOLIDAY", 1), holiday("2026-01-02", "REST", 0), holiday("2026-01-04", "WORKDAY", 0));
        HolidayCalendarMapper calendarMapper = proxy(HolidayCalendarMapper.class, (method, values) -> calendar);
        HolidayDateMapper dateMapper = proxy(HolidayDateMapper.class, (method, values) -> dates);
        HolidayResolverMapper resolver = proxy(HolidayResolverMapper.class, (method, values) -> method.equals("hasShiftCalendarColumn") ? false : null);
        HolidayCalendarServiceImpl service = new HolidayCalendarServiceImpl(calendarMapper, dateMapper, resolver, null);
        equal(100L, service.resolveCalendarId(1002L, LocalDate.of(2026, 1, 1)), "tenant calendar fallback");
        decimal("0", service.calcLeaveDays(100L, LocalDateTime.parse("2026-01-01T09:00"), LocalDateTime.parse("2026-01-02T18:00"), false), "statutory and adjusted holidays excluded");
        decimal("1", service.calcLeaveDays(100L, LocalDateTime.parse("2026-01-03T09:00"), LocalDateTime.parse("2026-01-04T18:00"), false), "makeup Sunday included, ordinary Saturday excluded");
        decimal("3", service.calcLeaveDays(100L, LocalDateTime.parse("2025-12-31T09:00"), LocalDateTime.parse("2026-01-05T18:00"), false), "leave spans years and holidays");
        equal(480L, service.calcWorkMinutes(100L, LocalDateTime.parse("2026-01-05T09:00"), LocalDateTime.parse("2026-01-05T18:00")), "calendar lunch excluded");
        HolidayCalendarServiceImpl missing = new HolidayCalendarServiceImpl(proxy(HolidayCalendarMapper.class, (method, values) -> null), dateMapper, resolver, null);
        fails(() -> missing.resolveCalendarId(1002L, LocalDate.of(2026, 1, 5)), "missing all calendars fails explicitly");
        HolidayResolverMapper shiftResolver = proxy(HolidayResolverMapper.class, (method, values) -> switch (method) {
            case "hasShiftCalendarColumn" -> true;
            case "selectAssignedShiftId" -> 9L;
            case "selectShiftCalendarId" -> 11L;
            default -> null;
        });
        equal(11L, new HolidayCalendarServiceImpl(calendarMapper, dateMapper, shiftResolver, null).resolveCalendarId(1002L, LocalDate.of(2026, 1, 5)), "shift calendar has priority");
        HolidayResolverMapper departmentResolver = proxy(HolidayResolverMapper.class, (method, values) -> switch (method) {
            case "hasShiftCalendarColumn" -> true;
            case "selectEmployeeDeptId" -> 9L;
            case "selectDeptCalendarId" -> 12L;
            default -> null;
        });
        equal(12L, new HolidayCalendarServiceImpl(calendarMapper, dateMapper, departmentResolver, null).resolveCalendarId(1002L, LocalDate.of(2026, 1, 5)), "department calendar precedes tenant fallback");
        HrShift night = shift("22:00", "06:00", 0);
        HrLeaveDayCalculator dayCalculator = new HrLeaveDayCalculator(service, shiftResolver, proxy(HrShiftMapper.class, (method, values) -> night), null);
        HrLeaveType hourly = new HrLeaveType(); hourly.setUnit("HOUR"); hourly.setIncludeHolidayFlag(0);
        decimal("2", dayCalculator.quantity(1002L, hourly, LocalDate.of(2026, 1, 5), LocalDateTime.parse("2026-01-05T23:00"), LocalDateTime.parse("2026-01-06T01:00")), "overnight hourly leave");
        hourly.setUnit("DAY");
        decimal("0.25", dayCalculator.quantity(1002L, hourly, LocalDate.of(2026, 1, 5), LocalDateTime.parse("2026-01-05T23:00"), LocalDateTime.parse("2026-01-06T01:00")), "overnight day fraction uses actual shift duration");
        decimal("1", dayCalculator.quantity(1002L, hourly, LocalDate.of(2026, 1, 5), LocalDateTime.parse("2026-01-05T22:00"), LocalDateTime.parse("2026-01-06T06:00")), "complete overnight shift is one day");
        night.setBreakMinutes(60);
        fails(() -> dayCalculator.quantity(1002L, hourly, LocalDate.of(2026, 1, 5), LocalDateTime.parse("2026-01-05T23:00"), LocalDateTime.parse("2026-01-06T01:00")), "partial night leave cannot guess unspecified rest location");
        ObjectNode restConfig = new com.fasterxml.jackson.databind.ObjectMapper().createObjectNode().put("breakStartTime", "00:00").put("breakEndTime", "01:00");
        HrShiftBreaks.BreakSpan rest = HrShiftBreaks.resolve(night, LocalDate.of(2026, 1, 5), restConfig, true);
        equal(60L, rest.overlapMinutes(LocalDateTime.parse("2026-01-05T23:30"), LocalDateTime.parse("2026-01-06T01:30")), "overnight rest overlap deducted exactly");
        equal(0L, rest.overlapMinutes(LocalDateTime.parse("2026-01-05T22:00"), LocalDateTime.parse("2026-01-05T23:00")), "leave before rest does not lose working minutes");
        restConfig.put("breakEndTime", "02:00");
        fails(() -> HrShiftBreaks.resolve(night, LocalDate.of(2026, 1, 5), restConfig, true), "rest duration must match shift configuration");
    }

    private static HolidayDate holiday(String date, String kind, int triplePay) {
        HolidayDate holiday = new HolidayDate(); holiday.setHolidayDate(LocalDate.parse(date)); holiday.setDateType(kind);
        holiday.setTriplePayFlag(triplePay); holiday.setCalendarId(100L); holiday.setTenantId(100000L); holiday.setDeleted(0);
        return holiday;
    }

    private static void attendance() {
        HrShift day = shift("09:00", "18:00", 60);
        equal("NORMAL", judge(day, "IN@09:00", "OUT@18:00").getStatus(), "normal day");
        equal(480, judge(day, "IN@09:00", "OUT@18:00").getWorkMinutes(), "nine hour span less lunch");
        equal("LATE", judge(day, "IN@09:20", "OUT@18:00").getStatus(), "late arrival");
        equal("EARLY_EXIT", judge(day, "IN@09:00", "OUT@17:40").getStatus(), "early departure");
        equal("LATE_AND_EARLY", judge(day, "IN@09:20", "OUT@17:40").getStatus(), "both deviations retained");
        equal("ABSENT", judge(day).getStatus(), "absent after checkout window");
        equal("PENDING", HrAttendanceJudge.judge(day, LocalDate.of(2026, 1, 5), List.of(), LocalDateTime.parse("2026-01-05T12:00")).getStatus(), "unfinished day remains pending");
        equal("HALF_DAY", judge(day, "IN@09:00", "OUT@13:00").getStatus(), "half-day threshold");
        day.setWorkingHoursCalcMode("PAIRED"); day.setCheckinDetermineMode("ALTERNATING");
        equal(480, judge(day, "IN@09:00", "OUT@12:00", "IN@13:00", "OUT@18:00").getWorkMinutes(), "recorded lunch not deducted twice");
        equal(480, judge(day, "IN@09:00", "IN@09:02", "OUT@12:00", "IN@13:00", "OUT@18:00").getWorkMinutes(), "duplicate IN does not lose opened interval");
        equal(480, judge(day, "OUT@08:50", "IN@09:00", "OUT@12:00", "IN@13:00", "OUT@18:00").getWorkMinutes(), "unpaired leading OUT ignored");
        equal("ABSENT", judge(day, "IN@09:00", "OUT@12:00", "IN@13:00").getStatus(), "paired missing final OUT");
        day.setWorkingHoursCalcMode("FIRST_LAST");
        equal("ABSENT", judge(day, "IN@09:00", "OUT@12:00", "IN@13:00").getStatus(), "alternating missing final OUT also fails");
        HrShift night = shift("22:00", "06:00", 0);
        equal(LocalDate.of(2026, 1, 5), HrAttendanceJudge.attendanceDate(night, LocalDateTime.parse("2026-01-06T06:00"), "OUT"), "night checkout belongs to start date");
        List<HrAttendanceCheckin> raw = List.of(checkin("2026-01-05T22:00", "IN"), checkin("2026-01-06T06:00", "OUT"));
        equal(480, HrAttendanceJudge.judge(night, LocalDate.of(2026, 1, 5), raw, LocalDateTime.parse("2026-01-06T09:00")).getWorkMinutes(), "overnight work minutes");
        night.setWorkMinutes(481);
        fails(() -> HrAttendanceJudge.validateShift(night), "invalid expected minutes rejected");
    }

    private static HrAttendanceRecord judge(HrShift shift, String... punches) {
        List<HrAttendanceCheckin> raw = new ArrayList<>();
        for (String punch : punches) {
            String[] parts = punch.split("@");
            raw.add(checkin("2026-01-05T" + parts[1], parts[0]));
        }
        return HrAttendanceJudge.judge(shift, LocalDate.of(2026, 1, 5), raw, LocalDateTime.parse("2026-01-06T09:00"));
    }

    static HrShift shift(String start, String end, int breakMinutes) {
        HrShift shift = new HrShift(); shift.setId(9L); shift.setTenantId(100000L);
        shift.setStartTime(LocalTime.parse(start)); shift.setEndTime(LocalTime.parse(end)); shift.setBreakMinutes(breakMinutes);
        shift.setCheckinWindowBeforeMinutes(120); shift.setCheckoutWindowAfterMinutes(120);
        shift.setAbsentHoursThreshold(new BigDecimal("2")); shift.setHalfDayHoursThreshold(new BigDecimal("4"));
        shift.setWorkingHoursCalcMode("FIRST_LAST"); shift.setCheckinDetermineMode("EARLIEST_LATEST");
        return shift;
    }

    private static HrAttendanceCheckin checkin(String when, String kind) {
        HrAttendanceCheckin checkin = new HrAttendanceCheckin(); checkin.setCheckTime(LocalDateTime.parse(when)); checkin.setLogType(kind);
        return checkin;
    }

    private static void leaveLedger() {
        List<HrLeaveLedger> rows = new ArrayList<>();
        rows.add(entry(1, "ALLOCATION", "5")); rows.add(entry(2, "FREEZE", "-2"));
        decimal("3", HrLeaveBusinessService.balanceFromLedger(rows).getAvailableQuota(), "freeze reduces availability");
        rows.add(entry(3, "APPLICATION", "-2")); rows.add(entry(4, "UNFREEZE", "2"));
        decimal("3", HrLeaveBusinessService.balanceFromLedger(rows).getAvailableQuota(), "approval freezes become actual usage");
        decimal("0", HrLeaveBusinessService.balanceFromLedger(rows).getFrozenQuota(), "approval clears freeze");
        HrLeaveLedger reverse = entry(5, "ADJUSTMENT", "2"); reverse.setReversalOfId(3L); rows.add(reverse);
        decimal("5", HrLeaveBusinessService.balanceFromLedger(rows).getAvailableQuota(), "reversal inherits application category");
        HrLeaveLedger reverseAgain = entry(6, "ADJUSTMENT", "-2"); reverseAgain.setReversalOfId(5L); rows.add(reverseAgain);
        decimal("3", HrLeaveBusinessService.balanceFromLedger(rows).getAvailableQuota(), "reversal chains restore original usage");
        reverse.setReversalOfId(6L);
        fails(() -> HrLeaveBusinessService.balanceFromLedger(rows), "cyclic reversals rejected");
        reverse.setReversalOfId(99L);
        fails(() -> HrLeaveBusinessService.balanceFromLedger(rows), "missing reversal source rejected");
        HrLeaveLedger carry = entry(10, "CARRY_FORWARD", "2"); carry.setToDate(LocalDate.of(2026, 1, 31));
        HrLeaveLedger allocation = entry(11, "ALLOCATION", "3"); allocation.setToDate(LocalDate.of(2026, 12, 31));
        HrLeaveLedger used = entry(12, "APPLICATION", "-1");
        List<HrLeaveLedger> expiring = new ArrayList<>(List.of(carry, allocation, used));
        decimal("1", HrLeaveBusinessService.remainingCredit(expiring, 10L), "consumption uses earliest expiring credit first");
        expiring.add(entry(13, "FREEZE", "-1"));
        decimal("0", HrLeaveBusinessService.remainingCredit(expiring, 10L), "frozen carry credit is protected from expiry");
        expiring.add(entry(14, "UNFREEZE", "1"));
        HrLeaveLedger undo = entry(15, "ADJUSTMENT", "1"); undo.setReversalOfId(12L); expiring.add(undo);
        decimal("2", HrLeaveBusinessService.remainingCredit(expiring, 10L), "usage reversal preserves original carry expiry");
        HrLeaveLedger expiry = entry(16, "EXPIRY", "-2"); expiry.setSourceBizType("LEAVE_LEDGER"); expiry.setSourceBizId("10"); expiring.add(expiry);
        decimal("0", HrLeaveBusinessService.remainingCredit(expiring, 10L), "expired credit cannot be consumed twice");
    }

    private static HrLeaveLedger entry(long id, String kind, String quantity) {
        HrLeaveLedger entry = new HrLeaveLedger(); entry.setLedgerId(id); entry.setTransactionType(kind); entry.setLeaveDays(new BigDecimal(quantity));
        return entry;
    }

    private static void payroll() {
        List<HrPayrollTaxCalculator.Bracket> brackets = List.of(new HrPayrollTaxCalculator.Bracket(BigDecimal.ZERO, null, new BigDecimal("0.10"), BigDecimal.ZERO));
        decimal("1000", HrPayrollTaxCalculator.calculate(BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("10000"), new BigDecimal("5000"), brackets).currentTax(), "first month synthetic tax fixture");
        decimal("500", HrPayrollTaxCalculator.calculate(new BigDecimal("10000"), new BigDecimal("5000"), new BigDecimal("1000"), new BigDecimal("5000"), new BigDecimal("5000"), brackets).currentTax(), "cumulative tax subtracts prior paid amount");
        decimal("0", HrPayrollTaxCalculator.calculate(new BigDecimal("15000"), BigDecimal.ZERO, new BigDecimal("1500"), new BigDecimal("-12000"), BigDecimal.ZERO, brackets).currentTax(), "negative current tax does not create refund");
        decimal("300", HrPayrollTaxCalculator.calculate(new BigDecimal("-5000"), BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("8000"), BigDecimal.ZERO, brackets).currentTax(), "negative raw income is retained in accumulation");
        fails(() -> HrPayrollTaxCalculator.validate(List.of()), "unconfigured tax table rejected");
        fails(() -> HrPayrollTaxCalculator.validate(List.of(new HrPayrollTaxCalculator.Bracket(BigDecimal.ONE, null, BigDecimal.ZERO, BigDecimal.ZERO))), "tax bracket gap rejected");
        for (int units : List.of(17, 19, 22, 28, 29, 30, 31)) {
            BigDecimal total = BigDecimal.ZERO;
            for (int index = 0; index < units; index++) total = total.add(HrPayrollProration.portion(new BigDecimal("10000.01"), index, 1, units));
            decimal("10000.01", total, "installments preserve exact total for " + units + " days");
        }
        fails(() -> HrPayrollProration.portion(BigDecimal.ONE, 0, 1, 0), "zero proration denominator rejected");
        fails(() -> HrPayrollProration.portion(BigDecimal.ONE, 10, 11, 20), "proration cannot exceed period");
    }

    private static void grievances() {
        HrGrievance grievance = new HrGrievance(); grievance.setEmployeeId(100L); grievance.setAgainstType("NONE"); grievance.setHandlerId(20L);
        equal(true, HrGrievanceRules.canRead(grievance, 10L, 100L, false), "applicant reads own case");
        equal(false, HrGrievanceRules.canManage(grievance, 10L, 100L, true), "HR applicant cannot handle own case");
        equal(false, HrGrievanceRules.canRead(grievance, 11L, 101L, false), "unrelated employee cannot read case");
        equal(true, HrGrievanceRules.canManage(grievance, 20L, 101L, false), "designated handler can manage");
        equal(true, HrGrievanceRules.canRead(grievance, 30L, 102L, true), "unconflicted HR can read");
        grievance.setAgainstType("USER"); grievance.setAgainstId(20L);
        equal(false, HrGrievanceRules.canRead(grievance, 20L, 101L, true), "targeted HR handler cannot read");
        equal(false, HrGrievanceRules.canRead(grievance, null, 100L, true), "anonymous access blocked");
        grievance.setStatus("SUBMITTED");
        equal("ACCEPTED", HrGrievanceRules.nextStatus(grievance, "accept", null), "accept submitted case");
        equal("WITHDRAWN", HrGrievanceRules.nextStatus(grievance, "withdraw", null), "withdraw before acceptance");
        grievance.setStatus("ACCEPTED");
        fails(() -> HrGrievanceRules.nextStatus(grievance, "withdraw", null), "withdraw after acceptance blocked");
        equal("INVESTIGATING", HrGrievanceRules.nextStatus(grievance, "investigate", null), "investigation transition");
        grievance.setStatus("RESOLVED");
        equal("INVESTIGATING", HrGrievanceRules.nextStatus(grievance, "confirm", false), "first rejected conclusion returns to investigation");
        grievance.setSatisfiedFlag(0);
        fails(() -> HrGrievanceRules.nextStatus(grievance, "confirm", false), "second rejected conclusion cannot reopen again");
        equal("CLOSED", HrGrievanceRules.nextStatus(grievance, "confirm", true), "satisfied employee closes case");
        grievance.setStatus(null);
        fails(() -> HrGrievanceRules.nextStatus(grievance, null, null), "null status or action rejected");
    }

    @SuppressWarnings("unchecked")
    static <T> T proxy(Class<T> contract, BiFunction<String, Object[], Object> handler) {
        return (T) Proxy.newProxyInstance(contract.getClassLoader(), new Class<?>[]{contract}, (instance, method, arguments) -> {
            if (method.getDeclaringClass() == Object.class) return switch (method.getName()) {
                case "toString" -> "check-proxy:" + contract.getSimpleName();
                case "hashCode" -> System.identityHashCode(instance);
                case "equals" -> instance == arguments[0];
                default -> null;
            };
            return handler.apply(method.getName(), arguments == null ? new Object[0] : arguments);
        });
    }

    static void decimal(String expected, BigDecimal actual, String label) {
        if (actual == null || new BigDecimal(expected).compareTo(actual) != 0) throw new AssertionError(label + ": expected " + expected + ", found " + actual);
        checks++;
    }

    static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected " + expected + ", found " + actual);
        checks++;
    }

    static void fails(Runnable action, String label) {
        try { action.run(); }
        catch (RuntimeException expected) { checks++; return; }
        throw new AssertionError(label + ": expected explicit failure");
    }
}
