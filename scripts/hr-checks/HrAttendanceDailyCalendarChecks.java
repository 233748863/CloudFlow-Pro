package com.cloudflow.hr.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.holiday.api.HolidayCalendarCalculation;
import com.cloudflow.common.holiday.domain.DayTypeInfo;
import com.cloudflow.common.holiday.domain.EmployeeCalendarDay;
import com.cloudflow.common.holiday.mapper.HolidayCalendarMapper;
import com.cloudflow.common.holiday.mapper.HolidayDateMapper;
import com.cloudflow.common.holiday.mapper.HolidayResolverMapper;
import com.cloudflow.common.holiday.service.HolidayCalendarServiceImpl;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.common.tenant.support.SysTenantLiteMapper;
import com.cloudflow.hr.job.HrRulePrecisionJobs;
import java.time.YearMonth;
import com.cloudflow.hr.domain.entity.HrAttendanceMonthly;
import com.cloudflow.hr.domain.entity.HrAttendanceRecord;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.*;
import com.cloudflow.hr.service.HrAttendanceBusinessService;
import com.cloudflow.hr.service.HrLeaveDayCalculator;
import com.cloudflow.hr.service.HrRuleSupport;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Runs the real daily handler and calendar callers on a disposable database; no scheduler or Redis lock is claimed. */
public final class HrAttendanceDailyCalendarChecks {
    private static final long TENANT = 996900L;
    private static final long EMP = 996900L;
    private static final LocalDate DAY = LocalDate.now().minusDays(1);
    private static int checks;
    private final JdbcTemplate jdbc;
    private final SqlSessionTemplate sessions;
    private final Map<Class<?>, Object> dependencies = new HashMap<>();
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final HolidayCalendarService calendars;
    private final HrAttendanceBusinessService service;
    private final HrRuleSupport support;
    public static void main(String[] args) throws Exception {
        if (args.length != 2 || !args[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_settlement_foundation_[a-f0-9]{32}\\?.*")) throw new IllegalArgumentException("Owned scratch database required");
        try {
            actor(TENANT);
            HrAttendanceDailyCalendarChecks fixture = new HrAttendanceDailyCalendarChecks(args);
            fixture.seed();
            fixture.daily();
            fixture.calendarFailures();
            System.out.println("D2_DAILY_CALENDAR: checks=" + checks + "; actual_mysql=true; actual_service=true; actual_handler=true; actual_tenant_iterator=true; production_tenant_interceptor=true; distributed_lock=false; http=false; natural_scheduler=false; system_clock_changed=false");
        } finally { UserContext.clear(); TenantContext.clear(); }
    }
    private HrAttendanceDailyCalendarChecks(String[] args) throws Exception {
        DriverManagerDataSource data = new DriverManagerDataSource(args[0], "root", "");
        jdbc = new JdbcTemplate(data);
        require(Path.of(args[1]).toRealPath().equals(Path.of(Objects.requireNonNull(jdbc.queryForObject("SELECT @@datadir", String.class))).toRealPath()), "owned database");
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig();
        global.setBanner(false); global.setDbConfig(new GlobalConfig.DbConfig()); global.setMetaObjectHandler(new MyMetaObjectHandler());
        GlobalConfigUtils.setGlobalConfig(configuration, global);
        List<Class<?>> mapperTypes = List.of(HrEmployeeMapper.class, HrAuditLogMapper.class, HrAttendanceCheckinMapper.class,
                HrAttendanceRecordMapper.class, HrAttendanceMonthlyMapper.class, HrAttendanceRuleMapper.class,
                HrShiftMapper.class, HrScheduleAssignmentMapper.class, HrTimeRequestMapper.class,
                HolidayCalendarMapper.class, HolidayDateMapper.class, HolidayResolverMapper.class, SysTenantLiteMapper.class);
        for (Class<?> mapper : mapperTypes) configuration.addMapper(mapper);
        List<Resource> resources = new ArrayList<>();
        for (String name : List.of("HrAttendanceRecordMapper", "HrAuditLogMapper", "HrEmployeeMapper",
                "HrAttendanceMonthlyMapper", "HrAttendanceCheckinMapper", "HrTimeRequestMapper")) {
            resources.add(new FileSystemResource("cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/" + name + ".xml"));
        }
        for (String name : List.of("HolidayResolverMapper", "HolidayCalendarMapper", "HolidayDateMapper")) {
            resources.add(new FileSystemResource("cloudflow-backend/cloudflow-common/cloudflow-common-holiday/src/main/resources/mapper/holiday/" + name + ".xml"));
        }
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(data); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
        factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        factory.setMapperLocations(resources.toArray(Resource[]::new));
        sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        for (Class<?> mapper : mapperTypes) dependencies.put(mapper, sessions.getMapper(mapper));
        support = new HrRuleSupport(new DataSourceTransactionManager(data), null,
                mapper(HrEmployeeMapper.class), mapper(HrAuditLogMapper.class), json, null) {
            @Override public <T> T locked(String resource, Supplier<T> action) { return transaction(action); }
        };
        calendars = new HolidayCalendarServiceImpl(mapper(HolidayCalendarMapper.class), mapper(HolidayDateMapper.class), mapper(HolidayResolverMapper.class), null);
        dependencies.put(HrRuleSupport.class, support); dependencies.put(ObjectMapper.class, json);
        dependencies.put(HolidayCalendarService.class, calendars);
        dependencies.put(HrLeaveDayCalculator.class, new HrLeaveDayCalculator(calendars, mapper(HolidayResolverMapper.class), mapper(HrShiftMapper.class), mapper(HrAttendanceRuleMapper.class)));
        Constructor<?> constructor = HrAttendanceBusinessService.class.getConstructors()[0];
        Object[] parameters = new Object[constructor.getParameterCount()];
        for (int index = 0; index < parameters.length; index++) parameters[index] = dependencies.get(constructor.getParameterTypes()[index]);
        service = (HrAttendanceBusinessService) constructor.newInstance(parameters);
    }

    private void seed() {
        // This connection is restricted by main and the owner check to the disposable schema.
        jdbc.update("UPDATE sys_tenant SET status='1'");
        for (int index = 0; index < 4; index++) {
            jdbc.update("INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name,status,expire_time) VALUES(?,?,?,?,?)",
                    TENANT + index, "D2-DAILY-" + index, "每日隔离" + index, index == 2 ? "1" : "0", index == 3 ? DAY.atStartOfDay() : null);
        }
        jdbc.update("INSERT INTO sys_holiday_calendar(calendar_id,tenant_id,calendar_code,calendar_name,default_flag,weekly_rest_days) VALUES(996900,996900,'D2-DAY-DEFAULT','每日默认',1,'6,7'),(996901,996900,'D2-DAY-HOLIDAY','每日假日',0,'6,7'),(996902,996901,'D2-DAY-OTHER','其他租户',1,'6,7')");
        for (long calendarId : List.of(996900L, 996901L, 996902L)) {
            jdbc.update("INSERT INTO sys_holiday_date(tenant_id,calendar_id,holiday_date,date_type,holiday_name,year_no) VALUES(?,?,?,?,?,?)",
                    calendarId == 996902L ? TENANT + 1 : TENANT, calendarId, DAY, calendarId == 996901L ? "HOLIDAY" : "WORKDAY", "固定测试日型", DAY.getYear());
        }
        jdbc.update("INSERT INTO sys_dept(dept_id,tenant_id,dept_name) VALUES(996900,996900,'每日部门'),(996901,996901,'其他租户部门')");
        for (int index = 0; index < 8; index++) {
            jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date) VALUES(?,996900,?,?,'UNKNOWN',996900,'REGULAR',?)",
                    EMP + index, "D2-DAILY-EMP-" + index, "每日员工" + index, index == 5 ? DAY.plusDays(1) : DAY.minusYears(1));
        }
        for (int index = 1; index <= 3; index++) {
            jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date) VALUES(?,?,?,?, 'UNKNOWN',996901,'REGULAR',?)",
                    EMP + 10 + index, TENANT + index, "D2-OTHER-" + index, "其他租户员工" + index, DAY.minusYears(1));
        }
        jdbc.update("INSERT INTO hr_shift(id,tenant_id,shift_code,shift_name,start_time,end_time,break_minutes,work_minutes,holiday_calendar_id,auto_attendance_flag,late_grace_minutes,process_attendance_after) VALUES(996900,996900,'D2-DAILY-ON','正常','09:00','18:00',60,480,996900,1,10,NULL),(996901,996900,'D2-DAILY-OFF','关闭','09:00','18:00',60,480,996900,0,10,NULL),(996902,996900,'D2-DAILY-LATER','起算','09:00','18:00',60,480,996900,1,10,?),(996903,996900,'D2-DAILY-HOLIDAY','假日','09:00','18:00',60,480,996901,1,10,NULL),(996904,996901,'D2-DAILY-OTHER','他租户','09:00','18:00',60,480,996902,1,10,NULL)", DAY.plusDays(1));
        for (int index = 0; index < 7; index++) {
            long shiftId = index == 1 ? 996901L : index == 2 ? 996902L : index == 6 ? 996903L : 996900L;
            jdbc.update("INSERT INTO hr_schedule_assignment(tenant_id,target_type,target_id,shift_id,effective_start,status) VALUES(996900,'EMPLOYEE',?,?,?,'ACTIVE')", EMP + index, shiftId, DAY.minusYears(1));
        }
        jdbc.update("INSERT INTO hr_schedule_assignment(tenant_id,target_type,target_id,shift_id,effective_start,status) VALUES(996901,'EMPLOYEE',996911,996904,?,'ACTIVE')", DAY.minusYears(1));
        for (long employeeId : List.of(EMP, EMP + 3, EMP + 4, EMP + 11)) {
            long tenantId = employeeId == EMP + 11 ? TENANT + 1 : TENANT;
            for (String kind : List.of("IN", "OUT")) {
                jdbc.update("INSERT INTO hr_attendance_checkin(tenant_id,employee_id,attendance_date,check_time,log_type,check_method,location_valid_flag,offshift_flag,skip_auto_flag) VALUES(?,?,?,?,?,'APP',1,0,0)",
                        tenantId, employeeId, DAY, "IN".equals(kind) ? DAY.atTime(9, 8) : DAY.atTime(18, 0), kind);
            }
        }
        jdbc.update("INSERT INTO hr_attendance_record(tenant_id,employee_id,attendance_date,shift_id,status,work_minutes,manual_adjusted_flag,remark) VALUES(996900,996903,?,996900,'NORMAL',333,1,'原人工保护'),(996900,996904,?,996900,'NORMAL',444,0,'原封账')", DAY, DAY);
        jdbc.update("INSERT INTO hr_attendance_monthly(tenant_id,employee_id,year,month,status) VALUES(996900,996904,?,?,'CONFIRMED')", DAY.getYear(), DAY.getMonthValue());
    }
    private HrRulePrecisionJobs handler() {
        return new HrRulePrecisionJobs(new TenantIterator(mapper(SysTenantLiteMapper.class)), null, service, null, null, support, json);
    }
    private void daily() {
        require(new java.util.HashSet<>(new TenantIterator(mapper(SysTenantLiteMapper.class)).listActiveTenantIds()).equals(java.util.Set.of(TENANT, TENANT + 1)), "real iterator includes two active unexpired tenants only");
        List<Map<String, Object>> raw = rawFacts();
        List<Map<String, Object>> otherRecords = jdbc.queryForList("SELECT * FROM hr_attendance_record WHERE tenant_id NOT BETWEEN 996900 AND 996903 ORDER BY id");
        List<Map<String, Object>> protectedRows = jdbc.queryForList("SELECT * FROM hr_attendance_record WHERE employee_id IN(996903,996904) ORDER BY id");
        List<Map<String, Object>> closedMonth = jdbc.queryForList("SELECT * FROM hr_attendance_monthly WHERE employee_id=996904");
        require(handler().attendanceDailyCalc() == 4, "daily handler affects normal, holiday, no-shift and other active tenant");
        require(Objects.equals(UserContext.getTenantId(), TENANT) && Objects.equals(TenantContext.getTenantId(), TENANT), "tenant context restored after success");
        require(count("SELECT COUNT(*) FROM hr_attendance_record WHERE employee_id=996900 AND attendance_date=? AND status='NORMAL' AND work_minutes=472 AND late_minutes=0", DAY) == 1, "yesterday normal punch judgment");
        require(count("SELECT COUNT(*) FROM hr_attendance_record WHERE employee_id IN(996901,996902,996905)") == 0, "automatic off, start after and not yet hired skipped");
        require(count("SELECT COUNT(*) FROM hr_attendance_record WHERE employee_id=996906 AND attendance_date=? AND status='HOLIDAY' AND expected_minutes=0", DAY) == 1, "shift holiday calendar respected");
        require(count("SELECT COUNT(*) FROM hr_attendance_record WHERE employee_id=996907 AND attendance_date=? AND status='PENDING'", DAY) == 1, "no-shift falls back to tenant workday without invented absence");
        require(count("SELECT COUNT(*) FROM hr_attendance_record WHERE tenant_id=996901 AND employee_id=996911 AND attendance_date=? AND status='NORMAL' AND work_minutes=472", DAY) == 1, "other tenant daily calculation");
        require(count("SELECT COUNT(*) FROM hr_attendance_record WHERE tenant_id IN(996902,996903)") == 0, "disabled and expired tenants not visited");
        require(count("SELECT COUNT(*) FROM hr_attendance_record WHERE tenant_id BETWEEN 996900 AND 996903 AND attendance_date<>?", DAY) == 0, "daily handler writes yesterday only");
        require(otherRecords.equals(jdbc.queryForList("SELECT * FROM hr_attendance_record WHERE tenant_id NOT BETWEEN 996900 AND 996903 ORDER BY id")), "preexisting seed records outside test tenants preserved");
        require(protectedRows.equals(jdbc.queryForList("SELECT * FROM hr_attendance_record WHERE employee_id IN(996903,996904) ORDER BY id")), "manual and sealed rows fully preserved");
        require(closedMonth.equals(jdbc.queryForList("SELECT * FROM hr_attendance_monthly WHERE employee_id=996904")), "sealed monthly row fully preserved");
        List<Map<String, Object>> identifiers = jdbc.queryForList("SELECT id,tenant_id,employee_id,attendance_date FROM hr_attendance_record ORDER BY id");
        require(handler().attendanceDailyCalc() == 4, "second daily handler succeeds");
        require(identifiers.equals(jdbc.queryForList("SELECT id,tenant_id,employee_id,attendance_date FROM hr_attendance_record ORDER BY id")), "rerun preserves daily identities and does not duplicate");
        require(raw.equals(rawFacts()), "daily handling preserves every original punch fact");
        require(count("SELECT COUNT(*) FROM hr_attendance_checkin c JOIN hr_attendance_record r ON r.id=c.attendance_record_id AND r.tenant_id=c.tenant_id AND r.employee_id=c.employee_id AND r.attendance_date=c.attendance_date WHERE c.employee_id IN(996900,996911)") == 4, "generated results link four original punches to their own day");
    }
    private void calendarFailures() {
        jdbc.update("UPDATE sys_holiday_calendar SET default_flag=0 WHERE calendar_id=996900");
        Map<String, Object> before = snapshot();
        rejects(() -> service.calculate(EMP + 7, DAY), "missing default calendar preview rejected");
        rejects(() -> service.recalculate(EMP + 7, DAY, DAY, false), "missing default calendar range rejected");
        rejects(() -> service.summarizeMonth(EMP + 7, YearMonth.from(DAY), false), "missing default calendar summary rejected");
        require(before.equals(snapshot()), "three missing calendar callers leave daily monthly punch and audit unchanged");
        List<Map<String, Object>> failedEmployee = jdbc.queryForList("SELECT * FROM hr_attendance_record WHERE employee_id=996907");
        int otherVersion = count("SELECT version FROM hr_attendance_record WHERE employee_id=996911");
        rejects(() -> handler().attendanceDailyCalc(), "failed tenant makes the overall daily handler fail");
        require(Objects.equals(UserContext.getTenantId(), TENANT) && Objects.equals(TenantContext.getTenantId(), TENANT), "tenant context restored after failure");
        require(count("SELECT version FROM hr_attendance_record WHERE employee_id=996911") > otherVersion, "other active tenant still processed after failing tenant");
        require(failedEmployee.equals(jdbc.queryForList("SELECT * FROM hr_attendance_record WHERE employee_id=996907")), "failed employee keeps previous day");
        jdbc.update("UPDATE sys_holiday_calendar SET default_flag=1,status='DISABLED' WHERE calendar_id=996900");
        before = snapshot();
        rejects(() -> service.calculate(EMP, DAY), "disabled assigned calendar preview rejected");
        rejects(() -> service.recalculate(EMP, DAY, DAY, false), "disabled assigned calendar range rejected");
        rejects(() -> service.summarizeMonth(EMP, YearMonth.from(DAY), false), "disabled assigned calendar summary rejected");
        require(before.equals(snapshot()), "disabled calendar callers leave all business rows unchanged");
        jdbc.update("UPDATE sys_holiday_calendar SET status='ENABLED' WHERE calendar_id=996900");
        require(handler().attendanceDailyCalc() == 4, "restored calendar daily execution recovers");
        require(count("SELECT COUNT(*) FROM (SELECT tenant_id,employee_id,attendance_date,COUNT(*) n FROM hr_attendance_record GROUP BY tenant_id,employee_id,attendance_date HAVING n>1) d") == 0, "unique daily results after recovery");
    }
    private void rejects(Runnable action, String label) {
        boolean rejected = false;
        try { action.run(); } catch (RuntimeException expected) { rejected = true; }
        require(rejected, label);
    }
    private <T> T mapper(Class<T> type) { return sessions.getMapper(type); }
    private List<Map<String, Object>> rawFacts() {
        List<Map<String, Object>> result = jdbc.queryForList("SELECT * FROM hr_attendance_checkin ORDER BY checkin_id");
        for (Map<String, Object> row : result) row.remove("attendance_record_id");
        return result;
    }
    private int count(String sql, Object... args) { return Objects.requireNonNull(jdbc.queryForObject(sql, Integer.class, args)); }
    private Map<String, Object> snapshot() {
        return Map.of("records", jdbc.queryForList("SELECT * FROM hr_attendance_record ORDER BY id"),
                "monthly", jdbc.queryForList("SELECT * FROM hr_attendance_monthly ORDER BY id"),
                "punches", jdbc.queryForList("SELECT * FROM hr_attendance_checkin ORDER BY checkin_id"),
                "audit", jdbc.queryForList("SELECT * FROM hr_audit_log ORDER BY id"));
    }
    private static void actor(long tenant) {
        TenantContext.setTenantId(tenant); UserContext.setTenantId(tenant); UserContext.setUserId(996900L); UserContext.setUserName("d2-daily-check"); UserContext.setDsType(0);
    }
    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }
}
