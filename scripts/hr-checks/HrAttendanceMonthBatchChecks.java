package com.cloudflow.hr.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.holiday.api.HolidayCalendarCalculation;
import com.cloudflow.common.holiday.api.EmployeeCalendarCalculationBatch;
import com.cloudflow.common.holiday.domain.DayTypeInfo;
import com.cloudflow.common.holiday.domain.EmployeeCalendarDay;
import com.cloudflow.common.holiday.domain.HolidayCalendar;
import com.cloudflow.common.holiday.domain.HolidayDate;
import com.cloudflow.common.holiday.mapper.HolidayCalendarMapper;
import com.cloudflow.common.holiday.mapper.HolidayDateMapper;
import com.cloudflow.common.holiday.mapper.HolidayResolverMapper;
import com.cloudflow.common.holiday.service.HolidayCalendarServiceImpl;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.entity.HrAttendanceMonthly;
import com.cloudflow.hr.domain.entity.HrAttendanceCheckin;
import com.cloudflow.hr.domain.entity.HrAttendanceRecord;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrTimeRequest;
import com.cloudflow.hr.domain.dto.HrEmployeeSelection;
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
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/** Real SQL, production tenant/version interceptors and transactions; only the distributed lock is replaced. */
public final class HrAttendanceMonthBatchChecks {
    private static final long EMP = 995800L;
    private static final LocalDate FROM = LocalDate.of(2025, 9, 1);
    private static final LocalDate TO = LocalDate.of(2025, 9, 30);
    private static int checks;
    private final JdbcTemplate jdbc;
    private final SqlSessionTemplate sessions;
    private final Map<Class<?>, Object> dependencies = new HashMap<>();
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final HolidayCalendarService calendars;
    private final HrAttendanceBusinessService service;
    private final HrRuleSupport support;
    private final AtomicInteger employeeIdReads = new AtomicInteger();
    private final AtomicInteger attendanceEmployeeReads = new AtomicInteger();
    private final AtomicReference<Runnable> beforeNextLock = new AtomicReference<>();
    private final AtomicInteger assignmentReads = new AtomicInteger();
    private final AtomicInteger schemaReads = new AtomicInteger();
    private final AtomicBoolean conflict = new AtomicBoolean();
    private final AtomicBoolean monthlyConflict = new AtomicBoolean();

    public static void main(String[] args) throws Exception {
        if (args.length != 2 || !args[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_settlement_foundation_[a-f0-9]{32}\\?.*")) {
            throw new IllegalArgumentException("Owned scratch database required");
        }
        try {
            actor(100000L);
            HrAttendanceMonthBatchChecks fixture = new HrAttendanceMonthBatchChecks(args);
            fixture.seed();
            fixture.employeeScopeReuse();
            fixture.attendanceEmployeeProjection();
            fixture.calendarCalculationEquivalence();
            fixture.calendarRangeEquivalence();
            fixture.equivalence();
            fixture.fixedReadEquivalence();
            fixture.partialRangeRetainsOtherLeave();
            fixture.protectionAndClearing();
            fixture.fallbackAndEmployment();
            fixture.rollback();
            fixture.mixedUpdateFields();
            fixture.isolation();
            fixture.calendarAssignmentPriority();
            require(fixture.schemaReads.get() == 1, "all daily and monthly calculations reuse startup schema metadata");
            System.out.println("D2_MONTH_BATCH: checks=" + checks + "; actual_mysql=true; actual_service=true; production_tenant_interceptor=true; distributed_lock=false; http=false; rollback_cases=2");
        } finally { UserContext.clear(); TenantContext.clear(); }
    }

    private HrAttendanceMonthBatchChecks(String[] args) throws Exception {
        DriverManagerDataSource data = new DriverManagerDataSource(args[0], "root", "");
        jdbc = new JdbcTemplate(data);
        require(Path.of(args[1]).toRealPath().equals(Path.of(Objects.requireNonNull(jdbc.queryForObject("SELECT @@datadir", String.class))).toRealPath()), "owned database");
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig();
        global.setBanner(false); global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted")
                .setLogicDeleteValue("1").setLogicNotDeleteValue("0")); global.setMetaObjectHandler(new MyMetaObjectHandler());
        GlobalConfigUtils.setGlobalConfig(configuration, global);
        List<Class<?>> mapperTypes = List.of(HrEmployeeMapper.class, HrAuditLogMapper.class, HrAttendanceCheckinMapper.class,
                HrAttendanceRecordMapper.class, HrAttendanceMonthlyMapper.class, HrAttendanceRuleMapper.class,
                HrShiftMapper.class, HrScheduleAssignmentMapper.class, HrTimeRequestMapper.class,
                HolidayCalendarMapper.class, HolidayDateMapper.class, HolidayResolverMapper.class, HrPositionMapper.class);
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
        HrEmployeeMapper employees = mapper(HrEmployeeMapper.class);
        dependencies.put(HrEmployeeMapper.class, Proxy.newProxyInstance(HrEmployeeMapper.class.getClassLoader(), new Class<?>[]{HrEmployeeMapper.class}, (proxy, method, values) -> {
            if (method.getName().equals("selectById")) employeeIdReads.incrementAndGet();
            if (method.getName().equals("selectAttendanceById")) attendanceEmployeeReads.incrementAndGet();
            try { return method.invoke(employees, values); }
            catch (InvocationTargetException failure) { throw failure.getCause(); }
        }));
        HolidayResolverMapper resolver = mapper(HolidayResolverMapper.class);
        dependencies.put(HolidayResolverMapper.class, Proxy.newProxyInstance(HolidayResolverMapper.class.getClassLoader(), new Class<?>[]{HolidayResolverMapper.class}, (proxy, method, values) -> {
            if (method.isDefault()) return java.lang.reflect.InvocationHandler.invokeDefault(proxy, method, values);
            if (method.getName().equals("selectEmployeeCalendarAssignments")) assignmentReads.incrementAndGet();
            if (method.getName().equals("hasShiftCalendarColumn")) schemaReads.incrementAndGet();
            try { return method.invoke(resolver, values); }
            catch (InvocationTargetException failure) { throw failure.getCause(); }
        }));
        support = new HrRuleSupport(new DataSourceTransactionManager(data), null,
                mapper(HrEmployeeMapper.class), mapper(HrAuditLogMapper.class), json, mapper(HrPositionMapper.class)) {
            @Override public <T> T locked(String resource, Supplier<T> action) {
                Runnable change = beforeNextLock.getAndSet(null);
                if (change != null) change.run();
                return transaction(action);
            }
        };
        HolidayCalendarServiceImpl calendarService = new HolidayCalendarServiceImpl(mapper(HolidayCalendarMapper.class), mapper(HolidayDateMapper.class), mapper(HolidayResolverMapper.class), null);
        calendarService.initializeSchemaMetadata();
        require(schemaReads.get() == 1, "startup reads actual schema metadata through the production tenant interceptor");
        require(assignmentReads.get() == 0, "startup metadata initialization does not read employee assignments");
        calendars = calendarService;
        dependencies.put(HrRuleSupport.class, support); dependencies.put(ObjectMapper.class, json);
        dependencies.put(HolidayCalendarService.class, calendars);
        dependencies.put(HrLeaveDayCalculator.class, new HrLeaveDayCalculator(calendars, mapper(HolidayResolverMapper.class), mapper(HrShiftMapper.class), mapper(HrAttendanceRuleMapper.class)));
        // The real mapper receives a stale version for one row; no SQL result is mocked.
        HrAttendanceRecordMapper records = mapper(HrAttendanceRecordMapper.class);
        dependencies.put(HrAttendanceRecordMapper.class, Proxy.newProxyInstance(HrAttendanceRecordMapper.class.getClassLoader(), new Class<?>[]{HrAttendanceRecordMapper.class}, (proxy, method, values) -> {
            if (method.getName().equals("updateCalculatedBatch") && conflict.compareAndSet(true, false)) {
                List<?> rows = (List<?>) values[2];
                HrAttendanceRecord row = (HrAttendanceRecord) rows.get(rows.size() - 1);
                row.setVersion(row.getVersion() + 100);
            }
            try { return method.invoke(records, values); }
            catch (InvocationTargetException failure) { throw failure.getCause(); }
        }));
        HrAttendanceMonthlyMapper monthly = mapper(HrAttendanceMonthlyMapper.class);
        dependencies.put(HrAttendanceMonthlyMapper.class, Proxy.newProxyInstance(HrAttendanceMonthlyMapper.class.getClassLoader(), new Class<?>[]{HrAttendanceMonthlyMapper.class}, (proxy, method, values) -> {
            if (method.getName().equals("updateById") && monthlyConflict.compareAndSet(true, false)) {
                HrAttendanceMonthly row = (HrAttendanceMonthly) values[0]; row.setVersion(row.getVersion() + 100);
            }
            try { return method.invoke(monthly, values); }
            catch (InvocationTargetException failure) { throw failure.getCause(); }
        }));
        Constructor<?> constructor = HrAttendanceBusinessService.class.getConstructors()[0];
        Object[] parameters = new Object[constructor.getParameterCount()];
        for (int index = 0; index < parameters.length; index++) parameters[index] = dependencies.get(constructor.getParameterTypes()[index]);
        service = (HrAttendanceBusinessService) constructor.newInstance(parameters);
    }

    private void seed() {
        jdbc.update("UPDATE sys_holiday_calendar SET default_flag=0 WHERE tenant_id IN(100000,100001)");
        jdbc.update("INSERT INTO sys_holiday_calendar(calendar_id,tenant_id,calendar_code,calendar_name,default_flag,weekly_rest_days) VALUES(995800,100000,'D2-MONTH-DEFAULT','整月默认',1,'6,7'),(995801,100000,'D2-MONTH-DEPT','整月部门',0,'6,7'),(995802,100000,'D2-MONTH-SHIFT','整月班次',0,'6,7'),(995803,100001,'D2-MONTH-OTHER','其他租户',1,'6,7')");
        jdbc.update("INSERT INTO sys_holiday_date(tenant_id,calendar_id,holiday_date,date_type,holiday_name,year_no) VALUES(100000,995801,'2025-09-03','HOLIDAY','部门假日',2025),(100000,995801,'2025-09-06','WORKDAY','部门调休',2025),(100000,995802,'2025-09-17','HOLIDAY','班次假日',2025),(100001,995803,'2025-09-01','HOLIDAY','其他租户假日',2025)");
        jdbc.update("INSERT INTO sys_dept(dept_id,tenant_id,dept_name,holiday_calendar_id) VALUES(995800,100000,'整月部门',995801),(995801,100000,'默认部门',NULL),(995802,100001,'其他租户部门',995803)");
        for (int index = 0; index < 6; index++) {
            long tenant = index == 4 ? 100001L : 100000L;
            long department = index == 4 ? 995802L : index == 1 || index == 2 ? 995801L : 995800L;
            jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date,resign_date) VALUES(?,?,?,?,?,?, 'REGULAR',?,?)",
                    EMP + index, tenant, "D2-MONTH-" + index, "整月样本" + index, "UNKNOWN", department,
                    index == 3 ? "2025-09-05" : "2025-01-01", index == 3 ? "2025-09-08" : null);
        }
        jdbc.update("INSERT INTO hr_shift(id,tenant_id,shift_code,shift_name,start_time,end_time,break_minutes,work_minutes,holiday_calendar_id,auto_attendance_flag,process_attendance_after) VALUES(995800,100000,'D2-DAY','日班','09:00','18:00',60,480,NULL,1,NULL),(995801,100000,'D2-NIGHT','夜班','22:00','06:00',0,480,995802,1,NULL),(995802,100000,'D2-OFF','关闭','09:00','18:00',60,480,NULL,0,NULL),(995803,100000,'D2-START','起算','09:00','18:00',60,480,NULL,1,'2025-09-14'),(995804,100001,'D2-OTHER','其他租户','09:00','18:00',60,480,NULL,1,NULL)");
        jdbc.update("INSERT INTO hr_attendance_rule(id,tenant_id,rule_code,rule_name,shift_id) VALUES(995800,100000,'D2-MONTH-RULE','规则班次',995800)");
        jdbc.update("INSERT INTO hr_schedule_assignment(tenant_id,target_type,target_id,shift_id,effective_start,status) VALUES(100000,'DEPT',995800,995800,'2025-01-01','ACTIVE'),(100000,'EMPLOYEE',995800,995801,'2025-09-10','ACTIVE'),(100000,'EMPLOYEE',995801,995800,'2025-01-01','ACTIVE'),(100001,'DEPT',995802,995804,'2025-01-01','ACTIVE')");
        jdbc.update("INSERT INTO hr_schedule_assignment(tenant_id,target_type,target_id,shift_id,rule_id,schedule_date,status) VALUES(100000,'EMPLOYEE',995800,NULL,995800,'2025-09-11','PUBLISHED'),(100000,'EMPLOYEE',995800,995802,NULL,'2025-09-12','PUBLISHED'),(100000,'EMPLOYEE',995800,995803,NULL,'2025-09-13','PUBLISHED')");
        jdbc.update("INSERT INTO hr_attendance_record(tenant_id,employee_id,attendance_date,shift_id,status,manual_adjusted_flag,remark,appeal_id) VALUES(100000,995800,'2025-09-15',995801,'NORMAL',1,'人工保护',995899)");
        punch(EMP, "2025-09-01", "2025-09-01 09:00:00", "IN", true);
        punch(EMP, "2025-09-01", "2025-09-01 18:00:00", "OUT", true);
        punch(EMP, "2025-09-02", "2025-09-02 09:00:00", "IN", false);
        punch(EMP, "2025-09-10", "2025-09-10 22:00:00", "IN", true);
        punch(EMP, "2025-09-10", "2025-09-11 06:00:00", "OUT", true);
        punch(EMP, "2025-09-15", "2025-09-15 22:00:00", "IN", true);
        request("D2-LEAVE-DAY", "LEAVE", "2025-09-04 09:00:00", "2025-09-04 18:00:00", "APPROVED");
        request("D2-LEAVE-HALF", "LEAVE", "2025-09-05 09:00:00", "2025-09-05 12:00:00", "APPROVED");
        request("D2-TRIP", "BUSINESS_TRIP", "2025-09-08 09:00:00", "2025-09-08 18:00:00", "APPROVED");
        request("D2-DRAFT", "LEAVE", "2025-09-09 09:00:00", "2025-09-09 18:00:00", "DRAFT");
    }

    private void employeeScopeReuse() {
        try {
            employeeIdReads.set(0);
            require(support.employees(List.of(EMP, EMP + 1, EMP + 4), null).size() == 2, "loaded selection excludes other tenant");
            require(employeeIdReads.get() == 0, "selection scope checks reuse selected rows without per-employee reads");
            employeeIdReads.set(0);
            require(Objects.equals(support.employeeInScope(EMP).getId(), EMP), "scoped read returns the checked employee");
            require(employeeIdReads.get() == 1, "single scoped read loads employee once");
            for (int scope : List.of(1, 2, 3, 4, 99)) {
                UserContext.setDsType(scope);
                UserContext.setDsDeptIds(List.of(995800L));
                UserContext.setDeptId(995800L);
                jdbc.update("UPDATE hr_employee SET user_id=? WHERE id=?", scope == 4 ? 995800L : null, EMP);
                boolean allowed = scope != 99;
                require(support.employees(List.of(EMP, EMP + 1, EMP + 4), null).size() == (allowed ? 1 : 0), "scope selection preserves department/self/unknown boundary " + scope);
                HrEmployeeSelection selection = new HrEmployeeSelection();
                selection.setEmployeeIds(List.of(EMP, EMP + 1, EMP + 4));
                require(support.selectAttendanceEmployees(selection).size() == (allowed ? 1 : 0), "attendance selection preserves department/self/unknown boundary " + scope);
                boolean attendanceRejected = false;
                try { support.attendanceEmployeeInScope(EMP + 1); } catch (HrBusinessException expected) { attendanceRejected = true; }
                require(attendanceRejected, "attendance detail refuses other department or account " + scope);
                if (allowed) require(Objects.equals(support.attendanceEmployeeInScope(EMP).getId(), EMP), "attendance detail allows matching scope " + scope);
                boolean rejected = false;
                try { support.employeeInScope(EMP + 1); } catch (HrBusinessException expected) { rejected = true; }
                require(rejected, "scoped detail refuses other department or account " + scope);
                if (allowed) require(Objects.equals(support.employeeInScope(EMP).getId(), EMP), "scoped detail allows matching scope " + scope);
            }
            actor(100001L);
            boolean wrongTenant = false;
            try { support.employeeInScope(EMP); } catch (HrBusinessException expected) { wrongTenant = true; }
            require(wrongTenant, "scoped read refuses another tenant");
            boolean attendanceWrongTenant = false;
            try { support.attendanceEmployeeInScope(EMP); } catch (HrBusinessException expected) { attendanceWrongTenant = true; }
            require(attendanceWrongTenant, "attendance detail refuses another tenant");
            actor(100000L);
            jdbc.update("UPDATE hr_employee SET deleted=1 WHERE id=?", EMP + 5);
            require(support.employees(List.of(EMP + 5), null).isEmpty(), "loaded selection excludes deleted employee");
            boolean deleted = false;
            try { support.employeeInScope(EMP + 5); } catch (HrBusinessException expected) { deleted = true; }
            require(deleted, "scoped read refuses deleted employee");
            boolean attendanceDeleted = false;
            try { support.attendanceEmployeeInScope(EMP + 5); } catch (HrBusinessException expected) { attendanceDeleted = true; }
            require(attendanceDeleted, "attendance detail refuses deleted employee");
            HrEmployeeSelection deletedSelection = new HrEmployeeSelection();
            deletedSelection.setEmployeeIds(List.of(EMP + 5));
            require(support.selectAttendanceEmployees(deletedSelection).isEmpty(), "attendance selection excludes deleted employee");
        } finally {
            jdbc.update("UPDATE hr_employee SET user_id=NULL WHERE id=?", EMP);
            jdbc.update("UPDATE hr_employee SET deleted=0 WHERE id=?", EMP + 5);
            actor(100000L);
        }
    }

    private void attendanceEmployeeProjection() {
        jdbc.update("INSERT INTO hr_position(id,tenant_id,position_code,position_name,level_id) VALUES(995890,100000,'D2-PROJECTION-1','考勤投影一',995890),(995891,100000,'D2-PROJECTION-2','考勤投影二',995891),(995892,100001,'D2-PROJECTION-X','其他租户职位',995892)");
        jdbc.update("UPDATE hr_employee SET position_id=995890,phone='attendance-projection-phone',email='attendance-projection@example.test' WHERE id=?", EMP);
        jdbc.update("UPDATE hr_employee SET position_id=995891,employee_type='PART_TIME' WHERE id=?", EMP + 1);
        try {
            HrEmployee full = support.employeeInScope(EMP);
            HrEmployee projected = support.attendanceEmployeeInScope(EMP);
            require(full.getPhone() != null && full.getEmail() != null && full.getName() != null, "unrelated full employee reads still retain contact and name fields");
            require(projected.getPhone() == null && projected.getEmail() == null && projected.getName() == null, "attendance detail does not load contact or name fields");
            Map<String, Object> before = json.convertValue(full, new TypeReference<LinkedHashMap<String, Object>>() {});
            Map<String, Object> after = json.convertValue(projected, new TypeReference<LinkedHashMap<String, Object>>() {});
            for (String field : List.of("id", "tenantId", "deleted", "userId", "deptId", "positionId", "employeeType", "hireDate", "resignDate")) {
                require(Objects.equals(before.get(field), after.get(field)), "attendance projection retains actual database value " + field);
            }
            HrEmployeeSelection selection = new HrEmployeeSelection();
            selection.setEmployeeIds(List.of(EMP, EMP + 1, EMP + 4));
            assertAttendanceSelection(selection, List.of(EMP, EMP + 1), "employee and tenant filter");
            selection.setDeptIds(List.of(995800L));
            assertAttendanceSelection(selection, List.of(EMP), "department filter");
            selection.setDeptIds(null); selection.setPositionIds(List.of(995891L));
            assertAttendanceSelection(selection, List.of(EMP + 1), "position filter");
            selection.setPositionIds(null); selection.setJobLevelIds(List.of(995890L));
            assertAttendanceSelection(selection, List.of(EMP), "job level filter");
            selection.setJobLevelIds(List.of(995892L));
            assertAttendanceSelection(selection, List.of(), "foreign job level cannot select an employee");
            selection.setJobLevelIds(null); selection.setEmployeeType("PART_TIME");
            assertAttendanceSelection(selection, List.of(EMP + 1), "employment type filter");
            selection.setPositionIds(List.of(995890L));
            assertAttendanceSelection(selection, List.of(), "combined filters retain intersection");
            selection.setPositionIds(null); selection.setEmployeeType(" ");
            assertAttendanceSelection(selection, List.of(EMP, EMP + 1), "blank employment type preserves unrestricted filter");
            boolean nullRejected = false;
            try { support.attendanceEmployeeInScope(null); } catch (HrBusinessException expected) { nullRejected = true; }
            require(nullRejected, "null employee cannot become an unrestricted attendance detail read");
            for (boolean delete : List.of(false, true)) {
                UserContext.setDsType(3); UserContext.setDeptId(995800L);
                Map<String, Object> unchanged = snapshot();
                beforeNextLock.set(() -> {
                    if (delete) jdbc.update("UPDATE hr_employee SET deleted=1 WHERE id=?", EMP);
                    else jdbc.update("UPDATE hr_employee SET dept_id=995801 WHERE id=?", EMP);
                });
                boolean rejected = false;
                try { service.recalculate(EMP, FROM, TO, false); } catch (HrBusinessException expected) { rejected = true; }
                require(beforeNextLock.get() == null, "employee change occurs after selection and before monthly action " + delete);
                require(rejected, "month action reloads and rechecks changed employee scope or deletion " + delete);
                require(unchanged.equals(snapshot()), "failed post-selection recheck preserves days month punches and audit " + delete);
                jdbc.update("UPDATE hr_employee SET dept_id=995800,deleted=0 WHERE id=?", EMP);
            }
        } finally {
            beforeNextLock.set(null);
            jdbc.update("UPDATE hr_employee SET dept_id=995800,deleted=0,position_id=NULL,phone=NULL,email=NULL WHERE id=?", EMP);
            jdbc.update("UPDATE hr_employee SET position_id=NULL,employee_type='FULL_TIME' WHERE id=?", EMP + 1);
            actor(100000L);
        }
    }

    private void assertAttendanceSelection(HrEmployeeSelection selection, List<Long> expected, String label) {
        List<HrEmployee> selected = support.selectAttendanceEmployees(selection);
        require(selected.stream().map(HrEmployee::getId).toList().equals(expected), "attendance projection " + label);
        require(selected.stream().map(HrEmployee::getId).toList().equals(support.selectEmployees(selection).stream().map(HrEmployee::getId).toList()), "full and attendance selection agree " + label);
        require(selected.stream().allMatch(employee -> employee.getPhone() == null && employee.getEmail() == null && employee.getName() == null), "attendance selection excludes unused personal fields " + label);
    }

    private void calendarCalculationEquivalence() {
        List<LocalDate> dates = FROM.datesUntil(TO.plusDays(1)).toList();
        assignmentReads.set(0);
        EmployeeCalendarCalculationBatch batch = calendars.getEmployeeCalculationBatch(EMP, dates);
        require(assignmentReads.get() == 1, "calendar and assignment batch share one actual query");
        require(batch.assignments().equals(mapper(HolidayResolverMapper.class).selectEmployeeCalendarDays(EMP, dates, 100000L)), "batch exposes the actual dated assignments");
        boolean immutableAssignments = false;
        try { batch.assignments().clear(); } catch (UnsupportedOperationException expected) { immutableAssignments = true; }
        require(immutableAssignments, "caller cannot change resolved assignment collection");
        boolean immutableCalculations = false;
        try { batch.calculations().clear(); } catch (UnsupportedOperationException expected) { immutableCalculations = true; }
        require(immutableCalculations, "caller cannot change resolved calculation collection");
        Map<LocalDate, HolidayCalendarCalculation> calculations = batch.calculations();
        require(calculations.size() == 30, "all dates have a selected calendar calculation");
        for (Map.Entry<LocalDate, HolidayCalendarCalculation> entry : calculations.entrySet()) {
            LocalDate date = entry.getKey();
            Long calendarId = calendars.resolveCalendarId(EMP, date);
            HolidayCalendarCalculation calculation = entry.getValue();
            require(calculation.getDateType(date).equals(calendars.getDateType(calendarId, date)), "reused calendar preserves selected day type " + date);
            require(calculation.calcLeaveDays(date.atTime(9, 0), date.atTime(18, 0), false).compareTo(calendars.calcLeaveDays(calendarId, date.atTime(9, 0), date.atTime(18, 0), false)) == 0, "reused calendar preserves daily leave quantity " + date);
            require(calculation.calcWorkMinutes(date.atTime(9, 0), date.atTime(14, 0)) == calendars.calcWorkMinutes(calendarId, date.atTime(9, 0), date.atTime(14, 0)), "reused calendar preserves work minutes " + date);
        }
        HolidayCalendarCalculation first = calculations.get(FROM);
        require(first.calcWorkMinutes(FROM.atTime(9, 0), FROM.atTime(14, 0)) == 240, "hour calculation excludes lunch");
        require(first.calcLeaveDays(FROM.atTime(9, 0), FROM.atTime(11, 0), false).compareTo(new BigDecimal("0.5")) == 0, "half day boundary retained");
        require(first.calcLeaveDays(FROM.atTime(18, 0), FROM.atTime(9, 0), false).compareTo(BigDecimal.ONE.negate()) == 0, "reverse leave range retained");
        require(first.calcWorkMinutes(FROM.atTime(18, 0), FROM.atTime(9, 0)) == -480, "reverse work range retained");
        require(first.calcWorkMinutes(LocalDate.of(2025, 12, 31).atTime(9, 0), LocalDate.of(2026, 1, 1).atTime(18, 0)) == 960, "same selected calendar loads next year without losing work times");
        HolidayCalendarCalculation holiday = calculations.get(FROM.plusDays(2));
        require(holiday.calcLeaveDays(FROM.plusDays(2).atTime(9, 0), FROM.plusDays(2).atTime(18, 0), false).signum() == 0, "excluded holiday stays zero");
        require(holiday.calcLeaveDays(FROM.plusDays(2).atTime(9, 0), FROM.plusDays(2).atTime(18, 0), true).compareTo(BigDecimal.ONE) == 0, "included holiday stays one day");
        HrLeaveDayCalculator calculator = (HrLeaveDayCalculator) dependencies.get(HrLeaveDayCalculator.class);
        com.cloudflow.hr.domain.entity.HrTimeRequest hour = new com.cloudflow.hr.domain.entity.HrTimeRequest();
        hour.setUnit("HOUR"); hour.setStartTime(FROM.atTime(9, 0)); hour.setEndTime(FROM.atTime(14, 0));
        require(calculator.fraction(EMP, hour, FROM, false, mapper(HrShiftMapper.class).selectById(995800L), first).compareTo(new BigDecimal("0.5")) == 0, "resolved day shift converts four hours to half a day");
        LocalDate night = FROM.plusDays(9);
        hour.setStartTime(night.atTime(22, 0)); hour.setEndTime(night.plusDays(1).atTime(2, 0));
        require(calculator.fraction(EMP, hour, night, false, mapper(HrShiftMapper.class).selectById(995801L), calculations.get(night)).compareTo(new BigDecimal("0.5")) == 0, "resolved night shift clips cross-midnight partial leave");
        try {
            actor(100001L);
            first.calcWorkMinutes(FROM.atTime(9, 0), FROM.atTime(18, 0));
            throw new AssertionError("calendar snapshot must reject another tenant");
        } catch (com.cloudflow.common.core.exception.ServiceException denied) {
            require(Integer.valueOf(403).equals(denied.getCode()), "calendar calculation cannot be reused by another tenant");
        } finally { actor(100000L); }
    }

    private void equivalence() {
        List<LocalDate> dates = FROM.datesUntil(TO.plusDays(1)).toList();
        List<EmployeeCalendarDay> assignments = mapper(HolidayResolverMapper.class).selectEmployeeCalendarDays(EMP, dates, 100000L);
        Map<LocalDate, DayTypeInfo> types = calendars.getEmployeeDateTypes(EMP, dates);
        require(assignments.size() == 30 && types.size() == 30, "all dates mapped by actual batch SQL");
        Map<LocalDate, Map<String, Object>> expected = new LinkedHashMap<>();
        for (EmployeeCalendarDay assignment : assignments) {
            LocalDate date = assignment.attendanceDate();
            require(Objects.equals(assignment.shiftId(), mapper(HolidayResolverMapper.class).selectAssignedShiftId(EMP, date, 100000L)), "batch assignment matches original daily priority " + date);
            require(types.get(date).equals(calendars.getDateType(calendars.resolveCalendarId(EMP, date), date)), "daily and batch calendar agree " + date);
            if (!List.of(12, 13, 15).contains(date.getDayOfMonth())) expected.put(date, fields(service.calculate(EMP, date)));
        }
        List<Map<String, Object>> original = facts();
        assignmentReads.set(0);
        employeeIdReads.set(0);
        attendanceEmployeeReads.set(0);
        beforeNextLock.set(() -> require(employeeIdReads.get() == 0 && attendanceEmployeeReads.get() == 1,
                "one projected employee selection completes before the monthly lock"));
        require(service.recalculate(EMP, FROM, TO, false) == 27, "manual protected plus auto disabled and start date skipped");
        require(assignmentReads.get() == 1, "real month recalculation resolves assignments once");
        require(beforeNextLock.get() == null && employeeIdReads.get() == 0 && attendanceEmployeeReads.get() == 2,
                "real month recalculation independently reloads projected employee scope inside the lock");
        for (Map.Entry<LocalDate, Map<String, Object>> entry : expected.entrySet()) {
            require(entry.getValue().equals(fields(record(EMP, entry.getKey()))), "saved batch equals daily result " + entry.getKey());
        }
        require(original.equals(facts()), "raw punch facts immutable after insert");
        require(count("SELECT COUNT(*) FROM hr_attendance_checkin c JOIN hr_attendance_record r ON r.id=c.attendance_record_id WHERE c.employee_id=? AND c.attendance_date=r.attendance_date AND c.tenant_id=r.tenant_id", EMP) == 5, "processed punches point to their own day result");
        require(count("SELECT COUNT(*) FROM hr_attendance_checkin WHERE employee_id=? AND attendance_date='2025-09-15' AND attendance_record_id IS NULL", EMP) == 1, "protected day link untouched");
        require(new BigDecimal("1.5").compareTo(jdbc.queryForObject("SELECT leave_days FROM hr_attendance_monthly WHERE employee_id=?", BigDecimal.class, EMP)) == 0, "full and half day approved leave accumulated");
        require("BUSINESS_TRIP".equals(record(EMP, FROM.plusDays(7)).getStatus()), "approved trip applied");
        require("ABSENT".equals(record(EMP, FROM.plusDays(8)).getStatus()), "draft leave ignored");
        List<Map<String, Object>> stable = jdbc.queryForList("SELECT id,attendance_date,version FROM hr_attendance_record WHERE employee_id=? ORDER BY attendance_date", EMP);
        require(service.recalculate(EMP, FROM, TO, false) == 27, "repeat same processed count");
        for (Map<String, Object> before : stable) {
            HrAttendanceRecord after = record(EMP, ((java.sql.Date) before.get("attendance_date")).toLocalDate());
            require(Objects.equals(before.get("id"), after.getId()), "repeat retains day id");
            int delta = after.getAttendanceDate().getDayOfMonth() == 15 ? 0 : 1;
            require(after.getVersion() == ((Number) before.get("version")).intValue() + delta, "version advances only processed day");
        }
    }

    private void fixedReadEquivalence() {
        HrEmployeeMapper employees = mapper(HrEmployeeMapper.class);
        HrAttendanceMonthlyMapper monthly = mapper(HrAttendanceMonthlyMapper.class);
        HrAttendanceRecordMapper records = mapper(HrAttendanceRecordMapper.class);
        HrAttendanceCheckinMapper checkins = mapper(HrAttendanceCheckinMapper.class);
        HrTimeRequestMapper requests = mapper(HrTimeRequestMapper.class);
        HolidayCalendarMapper calendarRows = mapper(HolidayCalendarMapper.class);
        HolidayDateMapper dates = mapper(HolidayDateMapper.class);
        List<List<Long>> employeeSelections = new ArrayList<>(List.of(List.<Long>of(), List.of(EMP),
                List.of(EMP, EMP, EMP + 1, EMP + 4), List.of(EMP + 4), List.of(0L)));
        employeeSelections.add(null);
        List<List<Long>> departmentSelections = new ArrayList<>(List.of(List.<Long>of(), List.of(995800L),
                List.of(995801L), List.of(995800L, 995800L, 995802L)));
        departmentSelections.add(null);
        for (List<Long> employeeIds : employeeSelections) {
            for (List<Long> departmentIds : departmentSelections) {
                LambdaQueryWrapper<HrEmployee> original = attendanceProjection()
                        .in(employeeIds != null && !employeeIds.isEmpty(), HrEmployee::getId, employeeIds)
                        .in(departmentIds != null && !departmentIds.isEmpty(), HrEmployee::getDeptId, departmentIds)
                        .orderByAsc(HrEmployee::getId);
                sameRead(employees.selectList(original), employees.selectAttendanceCandidates(100000L, employeeIds, departmentIds),
                        "fixed employee candidates retain all projected fields and original ordering");
                HrEmployeeSelection selection = new HrEmployeeSelection();
                selection.setEmployeeIds(employeeIds); selection.setDeptIds(departmentIds);
                require(support.selectAttendanceEmployees(selection).stream().map(HrEmployee::getId).toList()
                        .equals(support.selectEmployees(selection).stream().map(HrEmployee::getId).toList()),
                        "empty duplicate missing employee and department selections preserve business scope");
            }
        }
        for (long employeeId : List.of(EMP, EMP + 3, EMP + 4, 0L)) {
            sameRead(employees.selectOne(attendanceProjection().eq(HrEmployee::getId, employeeId)),
                    employees.selectAttendanceById(100000L, employeeId), "fixed employee detail matches original projection");
            sameRead(monthly.selectOne(new LambdaQueryWrapper<HrAttendanceMonthly>()
                            .eq(HrAttendanceMonthly::getTenantId, 100000L).eq(HrAttendanceMonthly::getEmployeeId, employeeId)
                            .eq(HrAttendanceMonthly::getYear, 2025).eq(HrAttendanceMonthly::getMonth, 9)),
                    monthly.selectEmployeeMonth(100000L, employeeId, 2025, 9), "fixed month matches every original mapped field");
        }
        for (List<LocalDate> range : List.of(List.of(FROM, TO), List.of(FROM, FROM), List.of(TO, TO),
                List.of(TO.plusDays(1), TO.plusDays(2)), List.of(TO, FROM))) {
            sameRows(records.selectList(new LambdaQueryWrapper<HrAttendanceRecord>()
                            .eq(HrAttendanceRecord::getTenantId, 100000L).eq(HrAttendanceRecord::getEmployeeId, EMP)
                            .eq(HrAttendanceRecord::getDeleted, 0).between(HrAttendanceRecord::getAttendanceDate, range.get(0), range.get(1))),
                    records.selectEmployeeDates(100000L, EMP, range.get(0), range.get(1)), "id", "fixed day range preserves values and inclusive endpoints");
            sameRows(checkins.selectList(new LambdaQueryWrapper<HrAttendanceCheckin>()
                            .eq(HrAttendanceCheckin::getTenantId, 100000L).eq(HrAttendanceCheckin::getEmployeeId, EMP)
                            .between(HrAttendanceCheckin::getAttendanceDate, range.get(0), range.get(1))),
                    checkins.selectEmployeeDates(100000L, EMP, range.get(0), range.get(1)), "checkinId", "fixed punch range preserves every raw mapped field");
        }
        for (long calendarId : List.of(EMP, EMP + 1, EMP + 3, 0L)) {
            sameRead(calendarRows.selectOne(new LambdaQueryWrapper<HolidayCalendar>()
                            .eq(HolidayCalendar::getTenantId, 100000L).eq(HolidayCalendar::getCalendarId, calendarId)
                            .eq(HolidayCalendar::getStatus, "ENABLED").eq(HolidayCalendar::getDeleted, 0)),
                    calendarRows.selectEnabledById(100000L, calendarId), "fixed calendar retains all original mapped fields");
            for (int year : List.of(2024, 2025, 2026)) {
                sameRows(dates.selectList(new LambdaQueryWrapper<HolidayDate>()
                                .eq(HolidayDate::getTenantId, 100000L).eq(HolidayDate::getCalendarId, calendarId)
                                .eq(HolidayDate::getYearNo, year).eq(HolidayDate::getDeleted, 0)),
                        dates.selectCalendarYear(100000L, calendarId, year), "dateId", "fixed year and calendar boundaries retain date fields");
            }
        }
        sameRead(calendarRows.selectOne(new LambdaQueryWrapper<HolidayCalendar>()
                        .eq(HolidayCalendar::getTenantId, 100000L).eq(HolidayCalendar::getDefaultFlag, 1)
                        .eq(HolidayCalendar::getStatus, "ENABLED").eq(HolidayCalendar::getDeleted, 0)),
                calendarRows.selectDefaultEnabled(100000L), "fixed default calendar matches original enabled selection");
        sameApprovedRequests(FROM.atStartOfDay(), TO.plusDays(2).atStartOfDay());
        Map<String, Object> before = fixedReadFacts();
        new TransactionTemplate(new DataSourceTransactionManager(Objects.requireNonNull(jdbc.getDataSource()))).execute(status -> {
            try {
                request("D2-FIXED-TOUCH-START", "LEAVE", "2025-09-02 00:00:00", "2025-09-02 12:00:00", "APPROVED");
                request("D2-FIXED-TOUCH-END", "LEAVE", "2025-08-31 12:00:00", "2025-09-01 00:00:00", "APPROVED");
                request("D2-FIXED-INCLUDE-START", "LEAVE", "2025-09-01 00:00:00", "2025-09-01 12:00:00", "APPROVED");
                request("D2-FIXED-INCLUDE-END", "LEAVE", "2025-09-01 12:00:00", "2025-09-02 00:00:00", "APPROVED");
                request("D2-FIXED-DELETED", "LEAVE", "2025-09-01 09:00:00", "2025-09-01 18:00:00", "APPROVED");
                request("D2-FIXED-DRAFT", "LEAVE", "2025-09-01 09:00:00", "2025-09-01 18:00:00", "DRAFT");
                jdbc.update("UPDATE hr_time_request SET deleted=1 WHERE tenant_id=100000 AND request_no='D2-FIXED-DELETED'");
                LocalDateTime from = FROM.atStartOfDay(), to = FROM.plusDays(1).atStartOfDay();
                sameApprovedRequests(from, to);
                require(requests.selectApprovedOverlapping(100000L, EMP, from, to).stream().map(HrTimeRequest::getRequestNo).sorted().toList()
                        .equals(List.of("D2-FIXED-INCLUDE-END", "D2-FIXED-INCLUDE-START")),
                        "only approved undeleted intervals strictly overlapping the requested day are selected");
                jdbc.update("UPDATE hr_employee SET deleted=1 WHERE tenant_id=100000 AND id=?", EMP);
                require(employees.selectAttendanceById(100000L, EMP) == null
                        && employees.selectAttendanceCandidates(100000L, List.of(EMP, EMP), null).isEmpty(), "both employee paths exclude deleted rows");
                jdbc.update("UPDATE hr_attendance_record SET deleted=1 WHERE tenant_id=100000 AND employee_id=? AND attendance_date=?", EMP, FROM);
                require(records.selectEmployeeDates(100000L, EMP, FROM, FROM).isEmpty(), "fixed day query excludes deleted records");
                require(checkins.selectEmployeeDates(100000L, EMP, FROM, FROM).size() == 2, "raw punches survive employee and day deletion");
                jdbc.update("UPDATE sys_holiday_date SET deleted=1 WHERE tenant_id=100000 AND calendar_id=?", EMP + 1);
                require(dates.selectCalendarYear(100000L, EMP + 1, 2025).isEmpty(), "fixed annual query excludes deleted date overrides");
                jdbc.update("UPDATE sys_holiday_calendar SET status='DISABLED' WHERE tenant_id=100000 AND calendar_id=?", EMP);
                sessions.clearCache();
                require(calendarRows.selectEnabledById(100000L, EMP) == null && calendarRows.selectDefaultEnabled(100000L) == null,
                        "disabled calendar cannot satisfy explicit or default lookup");
                jdbc.update("UPDATE sys_holiday_calendar SET status='ENABLED',deleted=1 WHERE tenant_id=100000 AND calendar_id=?", EMP);
                sessions.clearCache();
                require(calendarRows.selectEnabledById(100000L, EMP) == null && calendarRows.selectDefaultEnabled(100000L) == null,
                        "deleted calendar cannot satisfy explicit or default lookup");
                actor(100001L);
                sessions.clearCache();
                require(employees.selectAttendanceById(100000L, EMP + 1) == null
                        && employees.selectAttendanceCandidates(100000L, null, null).isEmpty(), "tenant interceptor prevents forged employee tenant arguments");
                require(monthly.selectEmployeeMonth(100000L, EMP, 2025, 9) == null, "tenant interceptor prevents forged month tenant arguments");
                require(records.selectEmployeeDates(100000L, EMP, FROM, TO).isEmpty(), "tenant interceptor prevents forged day tenant arguments");
                require(checkins.selectEmployeeDates(100000L, EMP, FROM, TO).isEmpty(), "tenant interceptor prevents forged punch tenant arguments");
                require(requests.selectApprovedOverlapping(100000L, EMP, from, to).isEmpty(), "tenant interceptor prevents forged request tenant arguments");
                require(calendarRows.selectEnabledById(100000L, EMP + 1) == null
                        && calendarRows.selectDefaultEnabled(100000L) == null, "tenant interceptor prevents forged calendar tenant arguments");
                require(dates.selectCalendarYear(100000L, EMP + 2, 2025).isEmpty(), "tenant interceptor prevents forged annual tenant arguments");
            } finally {
                actor(100000L);
                status.setRollbackOnly();
            }
            return null;
        });
        require(before.equals(fixedReadFacts()), "all fixed-query boundary fixtures roll back without modifying prior samples");
    }

    private LambdaQueryWrapper<HrEmployee> attendanceProjection() {
        return new LambdaQueryWrapper<HrEmployee>().eq(HrEmployee::getTenantId, 100000L).eq(HrEmployee::getDeleted, 0)
                .select(HrEmployee::getId, HrEmployee::getTenantId, HrEmployee::getDeleted, HrEmployee::getUserId,
                        HrEmployee::getDeptId, HrEmployee::getPositionId, HrEmployee::getEmployeeType, HrEmployee::getHireDate, HrEmployee::getResignDate);
    }

    private void sameApprovedRequests(LocalDateTime from, LocalDateTime to) {
        HrTimeRequestMapper requests = mapper(HrTimeRequestMapper.class);
        sameRows(requests.selectList(new LambdaQueryWrapper<HrTimeRequest>()
                        .eq(HrTimeRequest::getTenantId, 100000L).eq(HrTimeRequest::getEmployeeId, EMP)
                        .eq(HrTimeRequest::getDeleted, 0).eq(HrTimeRequest::getStatus, "APPROVED")
                        .lt(HrTimeRequest::getStartTime, to).gt(HrTimeRequest::getEndTime, from)),
                requests.selectApprovedOverlapping(100000L, EMP, from, to), "id", "fixed overlapping requests match all original fields");
    }

    private void sameRead(Object expected, Object observed, String label) {
        require(json.valueToTree(expected).equals(json.valueToTree(observed)), label);
    }

    private void sameRows(List<?> expected, List<?> observed, String identifier, String label) {
        Map<Object, Map<String, Object>> expectedRows = mappedRows(expected, identifier);
        Map<Object, Map<String, Object>> observedRows = mappedRows(observed, identifier);
        require(expectedRows.size() == expected.size() && observedRows.size() == observed.size()
                && expectedRows.equals(observedRows), label);
    }

    private Map<Object, Map<String, Object>> mappedRows(List<?> rows, String identifier) {
        Map<Object, Map<String, Object>> result = new HashMap<>();
        for (Object row : rows) {
            Map<String, Object> values = json.convertValue(row, new TypeReference<LinkedHashMap<String, Object>>() {});
            result.put(Objects.requireNonNull(values.get(identifier)), values);
        }
        return result;
    }

    private Map<String, Object> fixedReadFacts() {
        Map<String, Object> result = new HashMap<>(snapshot());
        result.put("hr_employee", jdbc.queryForList("SELECT * FROM hr_employee ORDER BY id"));
        result.put("hr_time_request", jdbc.queryForList("SELECT * FROM hr_time_request ORDER BY id"));
        result.put("sys_holiday_calendar", jdbc.queryForList("SELECT * FROM sys_holiday_calendar ORDER BY calendar_id"));
        result.put("sys_holiday_date", jdbc.queryForList("SELECT * FROM sys_holiday_date ORDER BY date_id"));
        return result;
    }

    private void partialRangeRetainsOtherLeave() {
        List<Map<String, Object>> otherDays = jdbc.queryForList("SELECT * FROM hr_attendance_record WHERE employee_id=? AND attendance_date>'2025-09-01' ORDER BY id", EMP);
        require(service.recalculate(EMP, FROM, FROM, false) == 1, "partial range recalculates only requested day");
        require(otherDays.equals(jdbc.queryForList("SELECT * FROM hr_attendance_record WHERE employee_id=? AND attendance_date>'2025-09-01' ORDER BY id", EMP)), "partial range leaves other daily records unchanged");
        require(new BigDecimal("1.5").compareTo(jdbc.queryForObject("SELECT leave_days FROM hr_attendance_monthly WHERE employee_id=?", BigDecimal.class, EMP)) == 0, "partial range summary includes approved leave outside requested range");
        HrAttendanceMonthly standalone = service.summarizeMonth(EMP, java.time.YearMonth.from(FROM), false);
        require(new BigDecimal("1.5").compareTo(standalone.getLeaveDays()) == 0, "standalone summary agrees with batched shift reuse");
    }

    private void protectionAndClearing() {
        List<Map<String, Object>> manual = jdbc.queryForList("SELECT * FROM hr_attendance_record WHERE employee_id=? AND attendance_date='2025-09-15'", EMP);
        require(service.recalculate(EMP, FROM.withDayOfMonth(15), FROM.withDayOfMonth(15), false) == 0, "single protected day skipped");
        require(manual.equals(jdbc.queryForList("SELECT * FROM hr_attendance_record WHERE employee_id=? AND attendance_date='2025-09-15'", EMP)), "entire manual row unchanged");
        require(service.recalculate(EMP, FROM.withDayOfMonth(15), FROM.withDayOfMonth(15), true) == 1, "explicit overwrite handles manual day");
        HrAttendanceRecord overwritten = record(EMP, FROM.withDayOfMonth(15));
        require(overwritten.getManualAdjustedFlag() == 0 && Objects.equals(overwritten.getAppealId(), 995899L), "overwrite clears manual flag and keeps appeal history");
        List<Map<String, Object>> original = facts();
        jdbc.update("INSERT INTO sys_holiday_date(tenant_id,calendar_id,holiday_date,date_type,holiday_name,year_no) VALUES(100000,995801,'2025-09-01','HOLIDAY','调整假日',2025),(100000,995801,'2025-09-02','HOLIDAY','调整假日',2025)");
        require(service.recalculate(EMP, FROM, FROM.plusDays(1), false) == 2, "changed calendar reuses batch update");
        HrAttendanceRecord first = record(EMP, FROM), second = record(EMP, FROM.plusDays(1));
        require(first.getFirstCheckinTime() == null && first.getLastCheckoutTime() == null && first.getCheckinCount() == 0, "obsolete nullable punch fields cleared");
        require(second.getRemark() == null, "obsolete position warning cleared");
        require(original.equals(facts()), "calendar change preserves punch facts");
        jdbc.update("UPDATE hr_attendance_monthly SET status='CONFIRMED' WHERE employee_id=?", EMP);
        Map<String, Object> closed = new HashMap<>(snapshot()); closed.remove("audit");
        require(service.recalculate(EMP, FROM, TO, true) == 0, "closed month skips even explicit overwrite");
        Map<String, Object> after = new HashMap<>(snapshot()); after.remove("audit");
        require(closed.equals(after), "closed month all business rows unchanged");
    }

    private void fallbackAndEmployment() {
        require(service.recalculate(EMP + 1, FROM, TO, false) == 30, "default tenant calendar fallback");
        require("WORKDAY".equals(record(EMP + 1, FROM).getDateType()), "department special holiday does not leak into default calendar");
        require(service.recalculate(EMP + 2, FROM, TO, false) == 30, "no assignment uses calendar and pending workday");
        require("PENDING".equals(record(EMP + 2, FROM).getStatus()), "no shift remains pending");
        require(service.recalculate(EMP + 3, FROM, TO, false) == 4, "hire and resignation dates inclusive");
        require(count("SELECT COUNT(*) FROM hr_attendance_record WHERE employee_id=? AND attendance_date NOT BETWEEN '2025-09-05' AND '2025-09-08'", EMP + 3) == 0, "no records outside employment");
        require(calendars.getEmployeeDateTypes(EMP, List.of()).isEmpty(), "empty date batch handled without malformed SQL");
    }

    private void rollback() {
        require(service.recalculate(EMP + 5, FROM, FROM.plusDays(1), false) == 2, "conflict fixture has existing rows and summary");
        punch(EMP + 5, "2025-09-04", "2025-09-04 09:00:00", "IN", true);
        for (int attempt = 0; attempt < 2; attempt++) {
            Map<String, Object> before = snapshot();
            if (attempt == 0) conflict.set(true); else monthlyConflict.set(true);
            try {
                service.recalculate(EMP + 5, FROM, TO, false);
                throw new AssertionError("stale version must fail");
            } catch (HrBusinessException expected) {
                require("ATTENDANCE_CONFLICT".equals(expected.getCode()), "real optimistic version conflict surfaced");
            }
            require(!conflict.get() && !monthlyConflict.get(), "injected stale version reached real mapper");
            require(before.equals(snapshot()), "entire month inserts updates links summary and audit rolled back " + attempt);
        }
        require(service.recalculate(EMP + 5, FROM, TO, false) == 30, "retry after rollback succeeds");
        require(count("SELECT COUNT(*) FROM hr_attendance_checkin WHERE employee_id=? AND attendance_record_id IS NOT NULL", EMP + 5) == 1, "retry links new record");
    }

    private void mixedUpdateFields() {
        // Vary the first row as well as later rows: derived-table type inference must
        // preserve nulls, timestamps, Unicode and every column's position.
        for (int attempt = 0; attempt < 3; attempt++) {
            List<HrAttendanceRecord> updates = new ArrayList<>();
            for (int index = 0; index < 3; index++) {
                HrAttendanceRecord row = record(EMP + 5, FROM.plusDays(index));
                boolean empty = attempt == 2 || index == attempt;
                row.setShiftId(empty ? null : 995800L);
                row.setWorkMinutes(100 + index); row.setExpectedMinutes(480);
                row.setLateMinutes(index); row.setEarlyExitMinutes(index + 3);
                row.setOvertimeMinutes(index + 20); row.setCheckinCount(empty ? 0 : 2);
                row.setHalfDayFlag(index % 2); row.setAbsentFlag(index == 2 ? 1 : 0);
                row.setDateType(empty ? "HOLIDAY" : "WORKDAY");
                row.setStatus(empty ? "HOLIDAY" : "LATE");
                row.setFirstCheckinTime(empty ? null : FROM.plusDays(index).atTime(9, index, 7));
                row.setLastCheckoutTime(empty ? null : FROM.plusDays(index).atTime(18, index, 9));
                row.setRecalcTime(FROM.plusDays(index).atTime(20, attempt, 11));
                row.setRemark(empty ? null : "完整保留中文及引号'、问号?" + index);
                row.setUpdateBy("d2-values-" + index);
                row.setUpdateTime(FROM.plusDays(index).atTime(20, attempt, 13));
                row.setManualAdjustedFlag(0);
                updates.add(row);
            }
            require(mapper(HrAttendanceRecordMapper.class).updateCalculatedBatch(100000L, EMP + 5, updates) == 3,
                    "mixed rows update all three versions " + attempt);
            for (HrAttendanceRecord expected : updates) {
                expected.setVersion(expected.getVersion() + 1);
                Map<String, Object> wanted = json.convertValue(expected, new TypeReference<LinkedHashMap<String, Object>>() {});
                Map<String, Object> actual = json.convertValue(record(EMP + 5, expected.getAttendanceDate()), new TypeReference<LinkedHashMap<String, Object>>() {});
                require(wanted.equals(actual), "all update and protected fields preserved " + attempt + " " + expected.getAttendanceDate());
            }
        }
        HrAttendanceRecord protectedRow = record(EMP + 5, FROM);
        Map<String, Object> original = snapshot();
        require(mapper(HrAttendanceRecordMapper.class).updateCalculatedBatch(100000L, EMP + 1, List.of(protectedRow)) == 0,
                "matching version cannot update another employee");
        require(original.equals(snapshot()), "employee mismatch preserves all fields");
        jdbc.update("UPDATE hr_attendance_record SET deleted=1, update_time=update_time WHERE id=?", protectedRow.getId());
        try {
            Map<String, Object> deleted = snapshot();
            require(mapper(HrAttendanceRecordMapper.class).updateCalculatedBatch(100000L, EMP + 5, List.of(protectedRow)) == 0,
                    "matching version cannot update deleted record");
            require(deleted.equals(snapshot()), "deleted row remains unchanged");
        } finally { jdbc.update("UPDATE hr_attendance_record SET deleted=0, update_time=update_time WHERE id=?", protectedRow.getId()); }
        require(original.equals(snapshot()), "owned deletion fixture restored");
    }

    private void isolation() {
        List<Map<String, Object>> own = jdbc.queryForList("SELECT * FROM hr_attendance_record WHERE tenant_id=100000 ORDER BY id");
        actor(100001L);
        require(service.recalculate(EMP + 4, FROM, TO, false) == 30, "other tenant calculates its employee");
        require("HOLIDAY".equals(record(EMP + 4, FROM).getStatus()), "other tenant calendar remains distinct");
        require(own.equals(jdbc.queryForList("SELECT * FROM hr_attendance_record WHERE tenant_id=100000 ORDER BY id")), "other tenant recalc leaves original tenant untouched");
        require(mapper(HrEmployeeMapper.class).selectById(EMP) == null, "production tenant filter conceals foreign employee");
        try { service.calculate(EMP, FROM); throw new AssertionError("foreign employee must fail"); }
        catch (HrBusinessException expected) { require("EMPLOYEE_NOT_FOUND".equals(expected.getCode()), "cross tenant service rejected"); }
        HrAttendanceRecord foreign = new HrAttendanceRecord();
        foreign.setId(((Number) own.get(0).get("id")).longValue()); foreign.setVersion(0);
        require(mapper(HrAttendanceRecordMapper.class).updateCalculatedBatch(100001L, EMP + 4, List.of(foreign)) == 0, "batch update cannot address other tenant row");
        foreign.setVersion(((Number) own.get(0).get("version")).intValue());
        require(mapper(HrAttendanceRecordMapper.class).updateCalculatedBatch(100000L,
                ((Number) own.get(0).get("employee_id")).longValue(), List.of(foreign)) == 0,
                "tenant interceptor rejects forged explicit tenant with actual version and employee");
        actor(100000L);
        require(own.equals(jdbc.queryForList("SELECT * FROM hr_attendance_record WHERE tenant_id=100000 ORDER BY id")), "foreign update leaves all source fields unchanged");
    }

    private void calendarAssignmentPriority() {
        long employee = 996900L;
        LocalDate date = FROM.plusDays(19);
        jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date) VALUES(?,100000,'D2-CALENDAR-PRIORITY','排班优先级样本','UNKNOWN',995800,'REGULAR','2025-01-01')", employee);
        assertCalendarPriority(employee, date, 995800L, "department interval fallback");
        jdbc.update("INSERT INTO hr_schedule_assignment(id,tenant_id,target_type,target_id,shift_id,schedule_date,status) VALUES(996900,100000,'DEPT',995800,995802,?,'PUBLISHED')", date);
        assertCalendarPriority(employee, date, 995802L, "department date precedes department interval");
        jdbc.update("INSERT INTO hr_schedule_assignment(id,tenant_id,target_type,target_id,shift_id,effective_start,status) VALUES(996901,100000,'EMPLOYEE',?,995801,?,'ACTIVE')", employee, date.minusDays(30));
        assertCalendarPriority(employee, date, 995801L, "employee interval precedes department date");
        jdbc.update("INSERT INTO hr_schedule_assignment(id,tenant_id,target_type,target_id,shift_id,effective_start,status) VALUES(996902,100000,'EMPLOYEE',?,995803,?,'PUBLISHED')", employee, date.minusDays(20));
        assertCalendarPriority(employee, date, 995803L, "later effective start wins within employee intervals");
        jdbc.update("INSERT INTO hr_schedule_assignment(id,tenant_id,target_type,target_id,shift_id,effective_start,status) VALUES(996903,100000,'EMPLOYEE',?,995800,?,'ACTIVE')", employee, date.minusDays(20));
        assertCalendarPriority(employee, date, 995800L, "higher id resolves equal effective starts");
        jdbc.update("INSERT INTO hr_schedule_assignment(id,tenant_id,target_type,target_id,shift_id,schedule_date,effective_start,status) VALUES(996904,100000,'EMPLOYEE',?,995801,?,?,'PUBLISHED')", employee, date, date.minusDays(40));
        assertCalendarPriority(employee, date, 995801L, "employee date precedes newer employee interval");
        jdbc.update("UPDATE hr_schedule_assignment SET status='DRAFT' WHERE id=996904");
        assertCalendarPriority(employee, date, 995800L, "draft employee date excluded");
        jdbc.update("UPDATE hr_schedule_assignment SET effective_start=? WHERE id=996903", date.plusDays(1));
        assertCalendarPriority(employee, date, 995803L, "future interval excluded");
        jdbc.update("UPDATE hr_schedule_assignment SET effective_end=? WHERE id=996902", date.minusDays(1));
        assertCalendarPriority(employee, date, 995801L, "expired interval excluded");
        jdbc.update("UPDATE hr_schedule_assignment SET effective_end=? WHERE id=996901", date.minusDays(1));
        assertCalendarPriority(employee, date, 995802L, "department fallback after all employee candidates excluded");
        jdbc.update("UPDATE hr_schedule_assignment SET effective_start=?,effective_end=? WHERE id=996901", date, date);
        assertCalendarPriority(employee, date, 995801L, "interval boundaries inclusive");
        jdbc.update("UPDATE hr_schedule_assignment SET status='ACTIVE',shift_id=NULL,rule_id=995800 WHERE id=996904");
        assertCalendarPriority(employee, date, 995800L, "selected employee assignment uses rule shift");
        jdbc.update("UPDATE hr_schedule_assignment SET rule_id=NULL WHERE id=996904");
        assertCalendarPriority(employee, date, null, "missing selected employee shift never falls through to department");
        jdbc.update("INSERT INTO hr_schedule_assignment(id,tenant_id,target_type,target_id,shift_id,schedule_date,status) VALUES(996905,100001,'EMPLOYEE',?,995804,?,'PUBLISHED')", employee, date);
        assertCalendarPriority(employee, date, null, "other tenant assignment cannot replace selected employee assignment");
        jdbc.update("UPDATE hr_employee SET deleted=1 WHERE id=?", employee);
        assertCalendarPriority(employee, date, null, "deleted employee has no selected assignment");
        jdbc.update("UPDATE hr_employee SET deleted=0,dept_id=NULL WHERE id=?", employee);
        jdbc.update("UPDATE hr_schedule_assignment SET status='DRAFT' WHERE tenant_id=100000 AND target_type='EMPLOYEE' AND target_id=?", employee);
        assertCalendarPriority(employee, date, null, "missing department and excluded employee assignments stay empty");
        try {
            actor(100001L);
            List<EmployeeCalendarDay> forged = mapper(HolidayResolverMapper.class).selectEmployeeCalendarDays(employee, List.of(date), 100000L);
            require(forged.stream().allMatch(day -> day.shiftId() == null && day.calendarId() == null), "production tenant interceptor rejects forged calendar tenant");
            List<EmployeeCalendarDay> foreign = mapper(HolidayResolverMapper.class).selectEmployeeCalendarDays(employee, List.of(date), 100001L);
            require(foreign.stream().allMatch(day -> day.shiftId() == null && day.calendarId() == null), "foreign employee cannot use same-id foreign assignment");
        } finally { actor(100000L); }
    }

    private void calendarRangeEquivalence() {
        HolidayResolverMapper resolver = mapper(HolidayResolverMapper.class);
        List<LocalDate> sparse = List.of(TO, FROM.plusDays(9), FROM, FROM.plusDays(10), FROM,
                LocalDate.of(2024, 12, 31), LocalDate.of(2026, 1, 1), FROM.plusDays(11), FROM.plusDays(12));
        List<LocalDate> expectedDates = new ArrayList<>(sparse);
        java.util.Collections.sort(expectedDates);
        for (long employee : List.of(EMP, EMP + 1, EMP + 4, 0L)) {
            assignmentReads.set(0);
            List<EmployeeCalendarDay> actual = resolver.selectEmployeeCalendarDays(employee, sparse, 100000L);
            require(assignmentReads.get() == 1, "sparse duplicate cross-year dates use one actual assignment query");
            require(actual.stream().map(EmployeeCalendarDay::attendanceDate).toList().equals(expectedDates),
                    "date ordering and duplicate multiplicity match the original database result");
            for (EmployeeCalendarDay day : actual) {
                Long shiftId = resolver.selectAssignedShiftId(employee, day.attendanceDate(), 100000L);
                Long calendarId = shiftId == null ? null : resolver.selectShiftCalendarId(shiftId, 100000L);
                require(Objects.equals(day.shiftId(), shiftId) && Objects.equals(day.calendarId(), calendarId),
                        "range selection agrees with unchanged single-day assignment and calendar lookups");
            }
        }
        require(sparse.equals(List.of(TO, FROM.plusDays(9), FROM, FROM.plusDays(10), FROM,
                LocalDate.of(2024, 12, 31), LocalDate.of(2026, 1, 1), FROM.plusDays(11), FROM.plusDays(12))),
                "range selection leaves caller date order and duplicates unchanged");
        assignmentReads.set(0);
        require(resolver.selectEmployeeCalendarDays(EMP, List.of(), 100000L).isEmpty()
                && assignmentReads.get() == 0, "empty date selection requires no database query");
    }

    private void assertCalendarPriority(long employee, LocalDate date, Long expectedShift, String label) {
        HolidayResolverMapper resolver = mapper(HolidayResolverMapper.class);
        List<EmployeeCalendarDay> actual = resolver.selectEmployeeCalendarDays(employee, List.of(date), 100000L);
        require(actual.size() == 1 && date.equals(actual.get(0).attendanceDate()), label + " preserves requested date");
        require(Objects.equals(actual.get(0).shiftId(), expectedShift), label + " selects expected shift");
        require(Objects.equals(actual.get(0).shiftId(), resolver.selectAssignedShiftId(employee, date, 100000L)), label + " agrees with unchanged daily resolver");
    }

    private <T> T mapper(Class<T> type) {
        Object observed = dependencies.get(type);
        return observed == null ? sessions.getMapper(type) : type.cast(observed);
    }
    private HrAttendanceRecord record(long employee, LocalDate date) {
        Long id = jdbc.queryForObject("SELECT id FROM hr_attendance_record WHERE employee_id=? AND attendance_date=?", Long.class, employee, date);
        return Objects.requireNonNull(mapper(HrAttendanceRecordMapper.class).selectById(id));
    }
    private Map<String, Object> fields(HrAttendanceRecord row) {
        Map<String, Object> result = json.convertValue(row, new TypeReference<LinkedHashMap<String, Object>>() {});
        for (String field : List.of("id", "version", "createTime", "updateTime", "recalcTime")) result.remove(field);
        return result;
    }
    private List<Map<String, Object>> facts() {
        List<Map<String, Object>> result = jdbc.queryForList("SELECT * FROM hr_attendance_checkin ORDER BY checkin_id");
        for (Map<String, Object> row : result) row.remove("attendance_record_id");
        return result;
    }
    private Map<String, Object> snapshot() {
        return Map.of("records", jdbc.queryForList("SELECT * FROM hr_attendance_record ORDER BY id"),
                "monthly", jdbc.queryForList("SELECT * FROM hr_attendance_monthly ORDER BY id"),
                "punches", jdbc.queryForList("SELECT * FROM hr_attendance_checkin ORDER BY checkin_id"),
                "audit", jdbc.queryForList("SELECT * FROM hr_audit_log ORDER BY id"));
    }
    private int count(String sql, Object... args) { return Objects.requireNonNull(jdbc.queryForObject(sql, Integer.class, args)); }
    private void punch(long employee, String date, String time, String kind, boolean valid) {
        jdbc.update("INSERT INTO hr_attendance_checkin(tenant_id,employee_id,attendance_date,check_time,log_type,check_method,location_valid_flag,offshift_flag,skip_auto_flag,device_id,latitude,longitude) VALUES(100000,?,?,?,?, 'APP',?,0,0,'d2-month-device',31.1234567,121.1234567)", employee, date, time, kind, valid ? 1 : 0);
    }
    private void request(String number, String kind, String start, String end, String status) {
        jdbc.update("INSERT INTO hr_time_request(tenant_id,employee_id,request_no,request_type,start_time,end_time,duration,unit,status) VALUES(100000,995800,?,?,?,?,1,'DAY',?)", number, kind, start, end, status);
    }
    private static void actor(long tenant) {
        TenantContext.setTenantId(tenant); UserContext.setTenantId(tenant); UserContext.setUserId(995800L); UserContext.setUserName("d2-month-check"); UserContext.setDsType(0);
    }
    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }
}
