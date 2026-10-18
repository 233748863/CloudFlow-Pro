package com.cloudflow.common.holiday.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.dto.HolidayCalendarDTO;
import com.cloudflow.auth.domain.dto.HolidayDateBatchDTO;
import com.cloudflow.auth.domain.dto.HolidayDateItemDTO;
import com.cloudflow.auth.importing.HolidayImport;
import com.cloudflow.auth.mapper.HolidayDateWriteMapper;
import com.cloudflow.auth.mapper.HolidayImportMapper;
import com.cloudflow.auth.mapper.SysDeptMapper;
import com.cloudflow.auth.service.HolidayManagementService;
import com.cloudflow.auth.service.SysDeptAdminService;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.excel.importing.ImportContext;
import com.cloudflow.common.excel.importing.ImportColumn;
import com.cloudflow.common.excel.importing.ImportRow;
import com.cloudflow.common.excel.importing.ImportSpreadsheets;
import com.cloudflow.common.excel.importing.ImportValidatorChain;
import com.cloudflow.common.excel.importing.PathMultipartFile;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.holiday.domain.HolidayDate;
import com.cloudflow.common.holiday.domain.HolidayCalendar;
import com.cloudflow.common.holiday.mapper.HolidayCalendarMapper;
import com.cloudflow.common.holiday.mapper.HolidayDateMapper;
import com.cloudflow.common.holiday.mapper.HolidayResolverMapper;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrScheduleAssignment;
import com.cloudflow.hr.domain.entity.HrShift;
import com.cloudflow.hr.mapper.HrAuditLogMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrScheduleAssignmentMapper;
import com.cloudflow.hr.mapper.HrShiftMapper;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import org.apache.poi.xssf.usermodel.XSSFRow;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.BeanUtils;
import org.springframework.context.support.StaticApplicationContext;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionTemplate;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class HolidayDatabaseChecks implements AutoCloseable {
    private static final long TENANT = 890001L;
    private static final long OTHER_TENANT = 890002L;
    private static final long DEFAULT_CALENDAR = 891001L;
    private static final long DEPARTMENT_CALENDAR = 891002L;
    private static final long SHIFT_CALENDAR = 891003L;
    private static final long DEPARTMENT = 892001L;
    private static final long OTHER_DEPARTMENT = 892002L;
    private static final long EMPLOYEE = 893001L;
    private static final long OTHER_EMPLOYEE = 893002L;
    private static final long SHIFT = 894001L;
    private static final long ASSIGNMENT = 895001L;
    private static final LocalDate CHANGED = LocalDate.of(2027, 1, 4);
    private static int assertions;

    private final HikariDataSource source;
    private final JdbcTemplate jdbc;
    private final SqlSessionTemplate sessions;
    private final PlatformTransactionManager manager;
    private final TransactionTemplate transaction;
    private final HolidayRedisFixture redis;
    private final HolidayRedisFixture.FaultCache writerCache;
    private final HolidayRedisFixture.FaultCache readerCache;
    private final HolidayCalendarServiceImpl writer;
    private final HolidayCalendarServiceImpl reader;
    private final HolidayManagementService management;
    private final AtomicInteger yearReads = new AtomicInteger();
    private final AtomicReference<Runnable> afterYearRead = new AtomicReference<>();

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2 || !arguments[0].startsWith("jdbc:mysql://127.0.0.1:")) throw new IllegalArgumentException("Owned loopback database and evidence directory required");
        context(TENANT);
        try (HolidayDatabaseChecks fixture = new HolidayDatabaseChecks(arguments[0])) {
            fixture.seed();
            fixture.calculations();
            fixture.concurrentRefill();
            fixture.redisFailures();
            fixture.rollbackDoesNotPublish();
            fixture.concurrentDefaults();
            fixture.concurrentFirstDefaults();
            fixture.calendarMetadata();
            fixture.resolutionAndMutations();
            fixture.departmentWriteBoundaries();
            fixture.importWorkbook(Path.of(arguments[1]));
            fixture.calendarRemoval();
            fixture.performance(Path.of(arguments[1]));
            System.out.println("HOLIDAY_DATABASE_CHECKS: assertions=" + assertions + "; failed=0; real_mysql=true; real_redis=true; real_service=true; transaction_proxy=true; connection_failures=injected; production_database_modified=false");
        } finally {
            clearContext();
        }
    }

    private HolidayDatabaseChecks(String url) throws Exception {
        source = new HikariDataSource();
        source.setJdbcUrl(url); source.setUsername("root"); source.setPassword("");
        source.setMaximumPoolSize(10); source.setMinimumIdle(2); source.setPoolName("holiday-owned-checks");
        jdbc = new JdbcTemplate(source);
        String directory = jdbc.queryForObject("SELECT @@datadir", String.class).replace('\\', '/');
        if (!directory.contains("/cloudflow-backend/target/holiday-db-")) throw new IllegalArgumentException("Database must be created by verify-holiday-db.ps1");
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig();
        global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
        global.setMetaObjectHandler(new MyMetaObjectHandler());
        GlobalConfigUtils.setGlobalConfig(configuration, global);
        configuration.addMappers("com.cloudflow.common.holiday.mapper");
        for (Class<?> mapper : List.of(HolidayDateWriteMapper.class, HolidayImportMapper.class, SysDeptMapper.class,
                HrEmployeeMapper.class, HrShiftMapper.class, HrScheduleAssignmentMapper.class, HrAuditLogMapper.class)) configuration.addMapper(mapper);
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(source); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
        factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        factory.setMapperLocations(new ClassPathResource("mapper/holiday/HolidayResolverMapper.xml"),
                new ClassPathResource("mapper/holiday/HolidayCalendarMapper.xml"), new ClassPathResource("mapper/holiday/HolidayDateMapper.xml"),
                new ClassPathResource("mapper/HolidayDateWriteMapper.xml"), new ClassPathResource("mapper/HolidayImportMapper.xml"),
                new ClassPathResource("mapper/HrAuditLogMapper.xml"));
        sessions = new SqlSessionTemplate(factory.getObject());
        equal(true, TableInfoHelper.getTableInfo(HolidayCalendar.class).isWithLogicDelete(), "fixture uses the application's global logical deletion configuration");
        equal(com.baomidou.mybatisplus.annotation.IdType.AUTO, TableInfoHelper.getTableInfo(SysDept.class).getIdType(),
                "department identifiers follow the approved database auto-increment definition");
        equal(org.apache.ibatis.mapping.SqlCommandType.UPDATE,
                configuration.getMappedStatement(HolidayCalendarMapper.class.getName() + ".delete").getSqlCommandType(),
                "real mapper deletion is an update of the logical deletion column");
        manager = new DataSourceTransactionManager(source);
        transaction = new TransactionTemplate(manager);
        redis = new HolidayRedisFixture();
        writerCache = redis.cache(); readerCache = redis.cache();
        writer = service(writerCache); reader = service(readerCache);
        management = transactional(new HolidayManagementService(mapper(HolidayCalendarMapper.class), mapper(HolidayDateMapper.class),
                writer, mapper(HolidayResolverMapper.class), mapper(HolidayDateWriteMapper.class)));
    }

    private HolidayCalendarServiceImpl service(HolidayRedisFixture.FaultCache cache) {
        HolidayDateMapper target = mapper(HolidayDateMapper.class);
        HolidayDateMapper observed = (HolidayDateMapper) Proxy.newProxyInstance(HolidayDateMapper.class.getClassLoader(), new Class<?>[]{HolidayDateMapper.class}, (instance, method, arguments) -> {
            try {
                Object result = method.invoke(target, arguments);
                if (method.getName().equals("selectCalendarYear")) {
                    yearReads.incrementAndGet();
                    Runnable hook = afterYearRead.getAndSet(null);
                    if (hook != null) hook.run();
                }
                return result;
            } catch (InvocationTargetException failure) {
                throw failure.getCause();
            }
        });
        return new HolidayCalendarServiceImpl(mapper(HolidayCalendarMapper.class), observed, mapper(HolidayResolverMapper.class), cache);
    }

    private void seed() {
        jdbc.update("INSERT INTO sys_tenant (tenant_id, tenant_code, tenant_name) VALUES (?, 'A4_CHECK', 'A4检查租户'), (?, 'A4_OTHER', 'A4隔离租户')", TENANT, OTHER_TENANT);
        jdbc.update("INSERT INTO sys_holiday_calendar (calendar_id, tenant_id, calendar_code, calendar_name, default_flag) VALUES (?, ?, 'A4_DEFAULT', 'A4默认日历', 1), (?, ?, 'A4_DEPT', 'A4部门日历', 0), (?, ?, 'A4_SHIFT', 'A4班次日历', 0)", DEFAULT_CALENDAR, TENANT, DEPARTMENT_CALENDAR, TENANT, SHIFT_CALENDAR, TENANT);
        jdbc.update("INSERT INTO sys_dept (dept_id, tenant_id, dept_name, holiday_calendar_id) VALUES (?, ?, 'A4部门', ?), (?, ?, 'A4另一部门', ?)", DEPARTMENT, TENANT, DEPARTMENT_CALENDAR, OTHER_DEPARTMENT, TENANT, SHIFT_CALENDAR);
        jdbc.update("INSERT INTO hr_employee (id, tenant_id, employee_no, name, gender, dept_id) VALUES (?, ?, 'A4_EMPLOYEE', 'A4检查员工', 'UNKNOWN', ?), (?, ?, 'A4_NO_CALENDAR', 'A4无日历员工', 'UNKNOWN', NULL)", EMPLOYEE, TENANT, DEPARTMENT, OTHER_EMPLOYEE, OTHER_TENANT);
        jdbc.update("INSERT INTO hr_shift (id, tenant_id, shift_code, shift_name, start_time, end_time, holiday_calendar_id) VALUES (?, ?, 'A4_SHIFT', 'A4检查班次', '09:00:00', '18:00:00', ?)", SHIFT, TENANT, SHIFT_CALENDAR);
        jdbc.update("INSERT INTO hr_schedule_assignment (id, tenant_id, target_type, target_id, shift_id, schedule_date, status) VALUES (?, ?, 'EMPLOYEE', ?, ?, ?, 'ACTIVE')", ASSIGNMENT, TENANT, EMPLOYEE, SHIFT, CHANGED);
        save("HOLIDAY");
    }

    private void calculations() {
        equal(true, reader.isWorkday(DEFAULT_CALENDAR, LocalDate.of(2027, 1, 11)), "ordinary workday through MySQL and Redis");
        equal(false, reader.isWorkday(DEFAULT_CALENDAR, LocalDate.of(2027, 1, 9)), "ordinary weekend through MySQL and Redis");
        equal(false, reader.isWorkday(DEFAULT_CALENDAR, CHANGED), "configured holiday through MySQL and Redis");
        equal(true, reader.isWorkday(DEFAULT_CALENDAR, LocalDate.of(2027, 1, 2)), "makeup Saturday through MySQL and Redis");
        equal(5, reader.countWorkdays(DEFAULT_CALENDAR, LocalDate.of(2027, 1, 1), LocalDate.of(2027, 1, 7)), "inclusive range from persisted fixture dates");
        equal(new BigDecimal("2.5"), reader.calcLeaveDays(DEFAULT_CALENDAR, LocalDateTime.parse("2027-01-01T09:00"), LocalDateTime.parse("2027-01-05T12:00"), false), "leave and half-day calculation from persisted fixture dates");
        equal(600L, reader.calcWorkMinutes(DEFAULT_CALENDAR, LocalDateTime.parse("2027-01-01T17:00"), LocalDateTime.parse("2027-01-05T10:00")), "work minutes exclude lunch nights and days off");
        equal(LocalDate.of(2027, 1, 6), reader.nextWorkday(DEFAULT_CALENDAR, LocalDate.of(2027, 1, 1), 3), "third workday through real cache");
        equal("检查|假日", reader.getDateType(DEFAULT_CALENDAR, CHANGED).getHolidayName(), "real JSON serialization preserves separator in name");
        equal(1, reader.getDateType(DEFAULT_CALENDAR, CHANGED).getTriplePayFlag(), "real JSON serialization preserves payroll flag");
        int reads = yearReads.get();
        writer.getDateType(DEFAULT_CALENDAR, CHANGED);
        equal(reads, yearReads.get(), "second service instance reads the real shared year cache");
        reader.getDateType(DEFAULT_CALENDAR, LocalDate.of(2028, 1, 4));
        reads = yearReads.get();
        writer.getDateType(DEFAULT_CALENDAR, LocalDate.of(2028, 1, 4));
        equal(reads, yearReads.get(), "real Redis caches an empty year");
    }

    private void concurrentRefill() throws Exception {
        writer.evictCalendar(DEFAULT_CALENDAR, 2027);
        CountDownLatch selected = new CountDownLatch(1);
        CountDownLatch resume = new CountDownLatch(1);
        afterYearRead.set(() -> { selected.countDown(); await(resume); });
        CompletableFuture<String> stale = CompletableFuture.supplyAsync(() -> {
            context(TENANT);
            try { return reader.getDateType(DEFAULT_CALENDAR, CHANGED).getDateType(); }
            finally { clearContext(); }
        });
        try {
            equal(true, selected.await(10, TimeUnit.SECONDS), "in-flight reader completed its actual SQL query");
            save("WORKDAY");
        } finally {
            resume.countDown();
        }
        equal("HOLIDAY", stale.get(10, TimeUnit.SECONDS), "in-flight SQL snapshot remains old");
        long started = System.nanoTime();
        equal("WORKDAY", writer.getDateType(DEFAULT_CALENDAR, CHANGED).getDateType(), "late old SQL snapshot cannot poison the current Redis generation");
        long millis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
        equal(true, millis <= 1000, "committed date becomes visible within one second");
        int reads = yearReads.get();
        reader.getDateType(DEFAULT_CALENDAR, LocalDate.of(2028, 1, 4));
        equal(reads, yearReads.get(), "changing 2027 preserves the real 2028 cache");
        System.out.println("HOLIDAY_CACHE_VISIBILITY: elapsed_ms=" + millis + "; limit_ms=1000; stale_refill_rejected=true; unrelated_year_preserved=true");
    }

    private void redisFailures() {
        save("HOLIDAY");
        reader.getDateType(DEFAULT_CALENDAR, CHANGED);
        writerCache.fault.failBegin = true;
        try {
            rejects(() -> save("REST"), "本次变更未提交", "unavailable pre-commit invalidation aborts the real transaction");
        } finally {
            writerCache.fault.failBegin = false;
        }
        equal("HOLIDAY", persistedType(), "pre-commit failure rolls back the actual database write");
        writerCache.fault.loseBeginReply = true;
        try {
            rejects(() -> save("REST"), "本次变更未提交", "lost Redis reply also aborts the real transaction");
        } finally {
            writerCache.fault.loseBeginReply = false;
        }
        equal("HOLIDAY", persistedType(), "ambiguous Redis result cannot commit a date change");
        writerCache.fault.failEnd = true;
        save("WORKDAY");
        equal("WORKDAY", persistedType(), "post-commit cleanup failure does not report a false database rollback");
        readerCache.fault.failRead = true;
        equal("WORKDAY", reader.getDateType(DEFAULT_CALENDAR, CHANGED).getDateType(), "failed Redis reads use committed SQL data");
        readerCache.fault.failRead = false;
        equal("WORKDAY", reader.getDateType(DEFAULT_CALENDAR, CHANGED).getDateType(), "recovered connection cannot resurrect pre-change data");
        equal(null, new HolidayCacheEpoch(readerCache).current("calendar:" + DEFAULT_CALENDAR, "year:" + DEFAULT_CALENDAR + ":2027"), "pending cleanup keeps other instances out of the cache");
        writerCache.fault.failEnd = false;
        equal("WORKDAY", writer.getDateType(DEFAULT_CALENDAR, CHANGED).getDateType(), "completed invalidation retries after recovery");
        int reads = yearReads.get();
        reader.getDateType(DEFAULT_CALENDAR, CHANGED);
        equal(reads, yearReads.get(), "recovery restores valid cache hits");
        System.out.println("HOLIDAY_REDIS_FAILURES: pre_commit_rollback=true; lost_reply_rollback=true; post_commit_fallback=true; recovery_stale_reads=0");
    }

    private void rollbackDoesNotPublish() {
        transaction.executeWithoutResult(status -> {
            save("REST");
            equal("REST", writer.getDateType(DEFAULT_CALENDAR, CHANGED).getDateType(), "transaction reads its uncommitted SQL changes");
            status.setRollbackOnly();
        });
        equal("WORKDAY", persistedType(), "database rollback restores prior type");
        equal("WORKDAY", reader.getDateType(DEFAULT_CALENDAR, CHANGED).getDateType(), "rolled-back data never reaches the shared cache");
    }

    private void concurrentDefaults() throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(6);
        CountDownLatch start = new CountDownLatch(1);
        List<java.util.concurrent.Future<?>> tasks = new ArrayList<>();
        try {
            for (long calendar : List.of(DEFAULT_CALENDAR, DEPARTMENT_CALENDAR, SHIFT_CALENDAR, DEFAULT_CALENDAR, DEPARTMENT_CALENDAR, SHIFT_CALENDAR)) {
                tasks.add(executor.submit(() -> {
                    context(TENANT);
                    try { await(start); makeDefault(calendar); }
                    finally { clearContext(); }
                }));
            }
            start.countDown();
            for (Future<?> task : tasks) task.get(30, TimeUnit.SECONDS);
            equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_holiday_calendar WHERE tenant_id=? AND default_flag=1 AND deleted=0", Integer.class, TENANT), "concurrent default switches retain exactly one default");
            System.out.println("HOLIDAY_DEFAULT_CONCURRENCY: writers=6; succeeded=6; defaults=1");
        } finally {
            start.countDown();
            executor.shutdownNow();
        }
        makeDefault(DEFAULT_CALENDAR);
    }

    private void resolutionAndMutations() {
        equal(SHIFT_CALENDAR, reader.resolveCalendarId(EMPLOYEE, CHANGED), "real assigned shift takes priority");
        equal(DEPARTMENT_CALENDAR, reader.resolveCalendarId(EMPLOYEE, CHANGED.plusDays(1)), "real department is second fallback");
        rejects(() -> management.remove(List.of(DEPARTMENT_CALENDAR)), "部门", "referenced calendar cannot be removed");
        SysDeptAdminService departments = transactional(new SysDeptAdminService(mapper(SysDeptMapper.class), null, null, writer));
        SysDept department = mapper(SysDeptMapper.class).selectById(DEPARTMENT);
        department.setHolidayCalendarId(DEFAULT_CALENDAR);
        equal(true, departments.updateDept(department), "department calendar update uses real transactional service");
        equal(DEFAULT_CALENDAR, reader.resolveCalendarId(EMPLOYEE, CHANGED.plusDays(1)), "department update invalidates another instance's assignment cache");
        try (StaticApplicationContext application = new StaticApplicationContext()) {
            application.getBeanFactory().registerSingleton("hrEmployeeMapper", mapper(HrEmployeeMapper.class));
            application.getBeanFactory().registerSingleton("hrShiftMapper", mapper(HrShiftMapper.class));
            application.getBeanFactory().registerSingleton("hrScheduleAssignmentMapper", mapper(HrScheduleAssignmentMapper.class));
            application.getBeanFactory().registerSingleton("holidayCalendarService", writer);
            com.cloudflow.common.redis.core.SysConfigHelper settings = new com.cloudflow.common.redis.core.SysConfigHelper() {
                @Override public int getConfigInt(String key, int fallback) { return fallback; }
            };
            HrTypedCrudService crud = transactional(new HrTypedCrudService(application, new ObjectMapper().findAndRegisterModules(), mapper(HrEmployeeMapper.class), null, null, mapper(HrAuditLogMapper.class), null, null, null, settings, null));
            crud.updateProperties(HrEmployee.class, EMPLOYEE, Map.of("deptId", OTHER_DEPARTMENT));
            equal(SHIFT_CALENDAR, reader.resolveCalendarId(EMPLOYEE, CHANGED.plusDays(1)), "employee transfer invalidates shared assignment cache");
            writerCache.fault.failBegin = true;
            try {
                rejects(() -> crud.updateProperties(HrEmployee.class, EMPLOYEE, Map.of("deptId", DEPARTMENT)), "本次变更未提交", "employee change rejects failed pre-commit cache barrier");
            } finally { writerCache.fault.failBegin = false; }
            equal(OTHER_DEPARTMENT, jdbc.queryForObject("SELECT dept_id FROM hr_employee WHERE id=?", Long.class, EMPLOYEE), "employee transfer rolls back when cache barrier fails");
            crud.updateProperties(HrShift.class, SHIFT, Map.of("holidayCalendarId", DEPARTMENT_CALENDAR));
            equal(DEPARTMENT_CALENDAR, reader.resolveCalendarId(EMPLOYEE, CHANGED), "shift calendar changes invalidate shared assignments");
            crud.updateProperties(HrScheduleAssignment.class, ASSIGNMENT, Map.of("status", "CANCELLED"));
            equal(SHIFT_CALENDAR, reader.resolveCalendarId(EMPLOYEE, CHANGED), "schedule cancellation falls back to employee department");
        }
        ObjectMapper json = new ObjectMapper();
        SysDept currentDepartment = mapper(SysDeptMapper.class).selectById(OTHER_DEPARTMENT);
        SysDept clearedDepartment = json.convertValue(json.createObjectNode().put("deptId", OTHER_DEPARTMENT)
                .put("version", currentDepartment.getVersion()).putNull("holidayCalendarId"), SysDept.class);
        equal(true, departments.updateDept(clearedDepartment), "explicit JSON null is accepted by the department service");
        equal(null, jdbc.queryForObject("SELECT holiday_calendar_id FROM sys_dept WHERE dept_id=?", Long.class, OTHER_DEPARTMENT), "explicit JSON null must clear the persisted department calendar");
        equal(DEFAULT_CALENDAR, reader.resolveCalendarId(EMPLOYEE, CHANGED.plusDays(1)), "unconfigured department uses the tenant default");
        context(OTHER_TENANT);
        try {
            rejects(() -> reader.resolveCalendarId(OTHER_EMPLOYEE, CHANGED), "未配置节假日日历", "all three missing levels return explicit failure");
            rejects(() -> reader.getDateType(DEFAULT_CALENDAR, CHANGED), "不存在", "cross-tenant calendar query is rejected");
        } finally { context(TENANT); }
        UserContext.clear();
        try {
            equal("WORKDAY", reader.getDateType(DEFAULT_CALENDAR, CHANGED).getDateType(), "background tenant context uses the same cache namespace");
        } finally { context(TENANT); }
    }

    private void concurrentFirstDefaults() throws Exception {
        long tenantId = 890003L;
        jdbc.update("INSERT INTO sys_tenant (tenant_id, tenant_code, tenant_name) VALUES (?, 'A4_EMPTY_DEFAULT', 'A4并发首个默认日历')", tenantId);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch snapshots = new CountDownLatch(2);
        List<java.util.concurrent.Future<?>> tasks = new ArrayList<>();
        try {
            for (String code : List.of("A4_FIRST", "A4_SECOND")) {
                tasks.add(executor.submit(() -> {
                    context(tenantId);
                    try {
                        TransactionTemplate repeatableRead = new TransactionTemplate(manager);
                        repeatableRead.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
                        repeatableRead.executeWithoutResult(status -> {
                            jdbc.queryForObject("SELECT COUNT(*) FROM sys_holiday_calendar WHERE tenant_id=?", Integer.class, tenantId);
                            snapshots.countDown(); await(snapshots);
                            HolidayCalendarDTO calendar = new HolidayCalendarDTO();
                            calendar.setCalendarCode(code); calendar.setCalendarName("并发首个默认日历");
                            calendar.setDefaultFlag(1); calendar.setStatus("ENABLED"); calendar.setWeeklyRestDays("6,7");
                            calendar.setWorkStartTime(java.time.LocalTime.of(9, 0)); calendar.setWorkEndTime(java.time.LocalTime.of(18, 0));
                            calendar.setLunchStartTime(java.time.LocalTime.NOON); calendar.setLunchEndTime(java.time.LocalTime.of(13, 0));
                            management.add(calendar);
                        });
                    } finally { clearContext(); }
                }));
            }
            for (Future<?> task : tasks) task.get(30, TimeUnit.SECONDS);
            int defaults = jdbc.queryForObject("SELECT COUNT(*) FROM sys_holiday_calendar WHERE tenant_id=? AND default_flag=1 AND deleted=0", Integer.class, tenantId);
            System.out.println("HOLIDAY_FIRST_DEFAULT_CONCURRENCY: writers=2; isolation=REPEATABLE_READ; prior_snapshots=2; defaults=" + defaults);
            equal(1, defaults, "concurrent creation must use current defaults even after an earlier repeatable-read snapshot");
        } finally {
            executor.shutdownNow();
        }
    }

    private void departmentWriteBoundaries() {
        ObjectMapper json = new ObjectMapper();
        SysDeptAdminService departments = transactional(new SysDeptAdminService(mapper(SysDeptMapper.class), null, null, writer));
        SysDept binding = departmentRequest(OTHER_DEPARTMENT, DEPARTMENT_CALENDAR);
        equal(true, binding.isHolidayCalendarIdSpecified(), "JSON calendar value is marked as explicitly supplied");
        equal(false, json.valueToTree(binding).has("holidayCalendarIdSpecified"), "internal presence marker is absent from JSON responses");
        equal(true, departments.updateDept(binding), "department can choose an enabled calendar");
        equal(DEPARTMENT_CALENDAR, reader.resolveCalendarId(EMPLOYEE, CHANGED.plusDays(1)), "department choice invalidates the shared employee resolution");
        SysDept staleClear = departmentRequest(OTHER_DEPARTMENT, null);
        SysDept omitted = json.convertValue(json.createObjectNode().put("deptId", OTHER_DEPARTMENT)
                .put("deptName", "A4只修改部门名称").put("tenantId", OTHER_TENANT)
                .put("holidayCalendarIdSpecified", true), SysDept.class);
        equal(false, omitted.isHolidayCalendarIdSpecified(), "client cannot forge the ignored internal presence marker");
        equal(true, departments.updateDept(omitted), "omitting the calendar still permits ordinary department edits");
        equal(DEPARTMENT_CALENDAR, jdbc.queryForObject("SELECT holiday_calendar_id FROM sys_dept WHERE dept_id=?", Long.class, OTHER_DEPARTMENT), "omitted calendar preserves the persisted binding");
        equal(TENANT, jdbc.queryForObject("SELECT tenant_id FROM sys_dept WHERE dept_id=?", Long.class, OTHER_DEPARTMENT), "department edit cannot move the row to a client-selected tenant");
        rejects(() -> departments.updateDept(staleClear), "其他操作修改", "stale department version is rejected instead of returning success");
        equal(DEPARTMENT_CALENDAR, jdbc.queryForObject("SELECT holiday_calendar_id FROM sys_dept WHERE dept_id=?", Long.class, OTHER_DEPARTMENT), "stale clear cannot overwrite the current calendar");
        writerCache.fault.failBegin = true;
        try {
            rejects(() -> departments.updateDept(departmentRequest(OTHER_DEPARTMENT, null)), "本次变更未提交", "department clear rolls back when its cache barrier fails");
        } finally {
            writerCache.fault.failBegin = false;
        }
        equal(DEPARTMENT_CALENDAR, jdbc.queryForObject("SELECT holiday_calendar_id FROM sys_dept WHERE dept_id=?", Long.class, OTHER_DEPARTMENT), "failed department clear retains its original database binding");
        equal(DEPARTMENT_CALENDAR, reader.resolveCalendarId(EMPLOYEE, CHANGED.plusDays(1)), "failed clear cannot publish a changed shared resolution");

        jdbc.update("INSERT INTO sys_holiday_calendar (tenant_id, calendar_code, calendar_name, default_flag) VALUES (?, 'A4_FOREIGN', '其他租户日历', 0)", OTHER_TENANT);
        long foreignCalendarId = jdbc.queryForObject("SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=? AND calendar_code='A4_FOREIGN'", Long.class, OTHER_TENANT);
        rejects(() -> departments.updateDept(departmentRequest(OTHER_DEPARTMENT, foreignCalendarId)), "不存在", "department cannot bind another tenant's actual calendar");
        SysDept foreignCreate = json.convertValue(json.createObjectNode().put("deptName", "A4跨租户日历新增")
                .put("holidayCalendarId", foreignCalendarId), SysDept.class);
        rejects(() -> departments.addDept(foreignCreate), "不存在", "department creation validates its calendar before insertion");
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_dept WHERE dept_name='A4跨租户日历新增'", Integer.class), "invalid calendar creates no department");

        SysDept created = json.convertValue(json.createObjectNode().put("deptName", "A4新增绑定日历部门")
                .put("status", "0").put("tenantId", OTHER_TENANT).put("holidayCalendarId", DEPARTMENT_CALENDAR), SysDept.class);
        equal(true, departments.addDept(created), "valid department creation uses the actual transactional service");
        equal(true, created.getDeptId() > OTHER_DEPARTMENT && created.getDeptId() < 9_007_199_254_740_992L,
                "new department receives the database sequence rather than a lossy browser identifier");
        equal(TENANT, jdbc.queryForObject("SELECT tenant_id FROM sys_dept WHERE dept_id=?", Long.class, created.getDeptId()), "new department belongs to the authenticated tenant");
        equal(DEPARTMENT_CALENDAR, jdbc.queryForObject("SELECT holiday_calendar_id FROM sys_dept WHERE dept_id=?", Long.class, created.getDeptId()), "new department persists its explicit calendar");
        SysDept inherited = json.convertValue(json.createObjectNode().put("deptName", "A4新增继承日历部门")
                .put("status", "0").putNull("holidayCalendarId"), SysDept.class);
        equal(true, departments.addDept(inherited), "new department can explicitly inherit the default calendar");
        equal(null, jdbc.queryForObject("SELECT holiday_calendar_id FROM sys_dept WHERE dept_id=?", Long.class, inherited.getDeptId()), "new inherited calendar is SQL null rather than a sentinel ID");
        SysDept failedCreate = json.convertValue(json.createObjectNode().put("deptName", "A4新增失效失败部门"), SysDept.class);
        writerCache.fault.failBegin = true;
        try {
            rejects(() -> departments.addDept(failedCreate), "本次变更未提交", "new department also requires a successful pre-commit barrier");
        } finally {
            writerCache.fault.failBegin = false;
        }
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_dept WHERE dept_name='A4新增失效失败部门'", Integer.class), "failed cache barrier rolls back department insertion");
        UserContext.clear();
        try {
            rejects(() -> departments.addDept(new SysDept()), "缺少租户上下文", "department creation cannot guess an absent tenant");
        } finally {
            context(TENANT);
        }

        equal(true, departments.updateDept(departmentRequest(OTHER_DEPARTMENT, SHIFT_CALENDAR)), "department selects a currently enabled calendar before it is disabled");
        HolidayCalendarDTO disabled = new HolidayCalendarDTO();
        BeanUtils.copyProperties(management.get(SHIFT_CALENDAR), disabled);
        disabled.setStatus("DISABLED");
        management.edit(disabled);
        try {
            rejects(() -> departments.updateDept(departmentRequest(DEPARTMENT, SHIFT_CALENDAR)), "已停用", "new department binding to a disabled calendar is rejected");
            SysDept disabledCreate = json.convertValue(json.createObjectNode().put("deptName", "A4停用日历新增")
                    .put("holidayCalendarId", SHIFT_CALENDAR), SysDept.class);
            rejects(() -> departments.addDept(disabledCreate), "已停用", "creation cannot bind a disabled calendar");
            equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_dept WHERE dept_name='A4停用日历新增'", Integer.class), "disabled calendar creates no department");
            SysDept rename = departmentRequest(OTHER_DEPARTMENT, SHIFT_CALENDAR);
            rename.setDeptName("A4保留停用日历修改名称");
            equal(true, departments.updateDept(rename), "unrelated edits can retain an already-bound disabled calendar");
            equal(SHIFT_CALENDAR, jdbc.queryForObject("SELECT holiday_calendar_id FROM sys_dept WHERE dept_id=?", Long.class, OTHER_DEPARTMENT), "unrelated edits do not silently clear a disabled binding");
            equal(true, departments.updateDept(departmentRequest(OTHER_DEPARTMENT, null)), "an existing disabled binding can be explicitly cleared");
            equal(DEFAULT_CALENDAR, reader.resolveCalendarId(EMPLOYEE, CHANGED.plusDays(1)), "clearing a disabled binding restores the tenant default in shared cache");
        } finally {
            disabled.setStatus("ENABLED");
            management.edit(disabled);
        }
        System.out.println("HOLIDAY_DEPARTMENT_WRITES: explicit_null_clears=true; omitted_preserves=true; stale_version_rejected=true; foreign_calendar_rejected=true; disabled_calendar_rejected=true; cache_failure_rollback=true; real_mysql=true; real_redis=true");
    }

    private SysDept departmentRequest(long departmentId, Long calendarId) {
        ObjectMapper json = new ObjectMapper();
        SysDept current = mapper(SysDeptMapper.class).selectById(departmentId);
        return json.convertValue(json.createObjectNode().put("deptId", departmentId).put("version", current.getVersion())
                .put("holidayCalendarId", calendarId), SysDept.class);
    }

    private void calendarMetadata() {
        LocalDate saturday = LocalDate.of(2027, 1, 9);
        equal(false, reader.isWorkday(DEFAULT_CALENDAR, saturday), "cached calendar metadata marks Saturday off");
        HolidayCalendarDTO input = new HolidayCalendarDTO();
        BeanUtils.copyProperties(management.get(DEFAULT_CALENDAR), input);
        input.setWeeklyRestDays("7");
        management.edit(input);
        equal(true, reader.isWorkday(DEFAULT_CALENDAR, saturday), "real calendar edit invalidates weekly rest metadata");
        input.setStatus("DISABLED");
        management.edit(input);
        rejects(() -> reader.getDateType(DEFAULT_CALENDAR, saturday), "已停用", "real disabling cannot reuse old cached metadata");
        input.setStatus("ENABLED"); input.setWeeklyRestDays("6,7");
        management.edit(input);
        equal(false, reader.isWorkday(DEFAULT_CALENDAR, saturday), "re-enabled calendar uses current database configuration");
    }

    private void importWorkbook(Path directory) throws Exception {
        Path sourceFile = directory.resolve("holiday-live-2027.xlsx");
        HolidayImport definition = new HolidayImport(mapper(HolidayCalendarMapper.class), mapper(HolidayImportMapper.class), management);
        ImportContext context = new ImportContext(TENANT, 21L, "HOLIDAY_DATABASE_CHECK");
        definition.prepare(context);
        ImportSpreadsheets sheets = new ImportSpreadsheets();
        ImportValidatorChain validator = new ImportValidatorChain(new ObjectMapper().findAndRegisterModules());
        List<Map<String, String>> sourceRows = new ArrayList<>();
        for (int day = 1; day <= 7; day++) {
            sourceRows.add(Map.of("calendarId", "A4_DEFAULT", "holidayDate", LocalDate.of(2027, 10, day).toString(),
                    "dateType", day <= 2 ? "HOLIDAY" : "REST", "holidayName", "国庆算法验收样本", "triplePayFlag", day == 1 ? "1" : "0",
                    "yearNo", "2027", "remark", "隔离测试数据，非法定节假日安排"));
        }
        sourceRows.add(Map.of("calendarId", "A4_DEFAULT", "holidayDate", "2027-10-09", "dateType", "WORKDAY", "triplePayFlag", "0", "yearNo", "2027"));
        sourceRows.add(Map.of("calendarId", "A4_DEFAULT", "holidayDate", "2027-02-30", "dateType", "HOLIDAY", "triplePayFlag", "1", "yearNo", "2027"));
        sourceRows.add(sourceRows.get(0));
        List<ImportColumn> columns = definition.columns();
        try (XSSFWorkbook workbook = new XSSFWorkbook(); OutputStream output = Files.newOutputStream(sourceFile)) {
            XSSFSheet sheet = workbook.createSheet("导入数据");
            XSSFRow header = sheet.createRow(0);
            for (int column = 0; column < columns.size(); column++) header.createCell(column).setCellValue(columns.get(column).header());
            for (int index = 0; index < sourceRows.size(); index++) {
                XSSFRow row = sheet.createRow(index + 1);
                for (int column = 0; column < columns.size(); column++) row.createCell(column).setCellValue(sourceRows.get(index).getOrDefault(columns.get(column).getField(), ""));
            }
            workbook.write(output);
        }
        List<ImportRow<HolidayImport.Row>> rows = new ArrayList<>();
        try (ImportSpreadsheets.PreparedUpload upload = sheets.prepare(new PathMultipartFile(sourceFile, "holiday-2027.xlsx"), definition)) {
            sheets.scan(upload.path(), definition, unused -> { }, row -> {
                rows.add(validator.convert(definition, row.rowNo(), row.ordinal(), row.values(), context));
                return true;
            });
        }
        validator.validateBatch(definition, definition, rows, context);
        for (ImportRow<HolidayImport.Row> row : rows) if (row.errors().isEmpty()) definition.importRow(row.value(), row.rowNo(), context);
        equal(List.of(1, 0, 0, 0, 0, 0, 0, 0), jdbc.queryForList("SELECT triple_pay_flag FROM sys_holiday_date WHERE tenant_id=? AND calendar_id=? AND holiday_date BETWEEN '2027-10-01' AND '2027-10-31' ORDER BY holiday_date", Integer.class, TENANT, DEFAULT_CALENDAR), "real XLSX import persists all explicit payroll flags");
        equal(List.of(10, 11), rows.stream().filter(row -> !row.errors().isEmpty()).map(ImportRow::rowNo).toList(), "real import rejects invalid and duplicate rows with original row numbers");
        equal(0, reader.getDateType(DEFAULT_CALENDAR, LocalDate.of(2027, 10, 2)).getTriplePayFlag(), "consumer sees imported non-triple holiday");
        equal(1, reader.getDateType(DEFAULT_CALENDAR, LocalDate.of(2027, 10, 1)).getTriplePayFlag(), "consumer sees imported triple holiday");
        equal(true, reader.isWorkday(DEFAULT_CALENDAR, LocalDate.of(2027, 10, 9)), "consumer sees imported Saturday makeup workday");
        equal(3, reader.countWorkdays(DEFAULT_CALENDAR, LocalDate.of(2027, 9, 30), LocalDate.of(2027, 10, 10)), "National Day fixture excludes holidays and includes makeup workday");
        System.out.println("HOLIDAY_IMPORT_DATABASE: spreadsheet=xlsx; year=2027; imported=8; rejected_rows=10,11; persisted_flags=1,0,0,0,0,0,0,0; national_week_fixture_workdays=3; legal_policy_confirmed=false; real_handler=true");
    }

    private void calendarRemoval() {
        HolidayCalendarDTO input = new HolidayCalendarDTO();
        BeanUtils.copyProperties(management.get(DEFAULT_CALENDAR), input);
        input.setCalendarId(null); input.setCalendarCode("A4_DELETE_PROBE"); input.setCalendarName("隔离删除检查"); input.setDefaultFlag(0);
        management.add(input);
        Long calendarId = jdbc.queryForObject("SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=? AND calendar_code='A4_DELETE_PROBE'", Long.class, TENANT);
        reader.getDateType(calendarId, CHANGED);
        writerCache.fault.failBegin = true;
        try {
            rejects(() -> management.remove(List.of(calendarId)), "本次变更未提交", "calendar deletion rolls back when invalidation cannot start");
        } finally { writerCache.fault.failBegin = false; }
        equal(0, jdbc.queryForObject("SELECT deleted FROM sys_holiday_calendar WHERE calendar_id=?", Integer.class, calendarId), "failed deletion preserves the real active row");
        management.remove(List.of(calendarId));
        equal(1, jdbc.queryForObject("SELECT deleted FROM sys_holiday_calendar WHERE calendar_id=?", Integer.class, calendarId), "successful deletion changes the real logical deletion column");
        rejects(() -> management.get(calendarId), "不存在", "deleted calendar is absent from management reads");
        rejects(() -> reader.getDateType(calendarId, CHANGED), "不存在", "another instance cannot reuse deleted calendar metadata");
        rejects(() -> management.remove(List.of(calendarId)), "不存在", "repeated deletion does not report another success");
        System.out.println("HOLIDAY_CALENDAR_REMOVAL: logical_deleted=true; cache_invalidated=true; failed_invalidation_rollback=true; repeated_delete_rejected=true; real_mysql=true; real_redis=true");
    }

    private void performance(Path evidence) throws java.io.IOException {
        reader.countWorkdays(DEFAULT_CALENDAR, LocalDate.of(2027, 1, 1), LocalDate.of(2027, 12, 31));
        for (int warmup = 0; warmup < 100; warmup++) reader.getDateType(DEFAULT_CALENDAR, CHANGED);
        long[] samples = new long[300];
        int readsBefore = yearReads.get();
        List<String> sampleRows = new ArrayList<>();
        sampleRows.add("sample,elapsed_ns,redis_epoch_ns,redis_value_ns");
        for (int index = 0; index < samples.length; index++) {
            long started = System.nanoTime();
            reader.getDateType(DEFAULT_CALENDAR, CHANGED);
            samples[index] = System.nanoTime() - started;
            sampleRows.add((index + 1) + "," + samples[index] + "," + readerCache.fault.lastReadNanos + "," + readerCache.lastGetNanos);
        }
        Files.write(evidence.resolve("performance-samples.csv"), sampleRows);
        equal(readsBefore, yearReads.get(), "all timed date lookups use the shared cache without database fallback");
        Arrays.sort(samples);
        long started = System.nanoTime();
        reader.countWorkdays(DEFAULT_CALENDAR, LocalDate.of(2027, 1, 1), LocalDate.of(2027, 12, 31));
        double yearMillis = (System.nanoTime() - started) / 1_000_000.0;
        double percentile = samples[296] / 1_000_000.0;
        System.out.printf(java.util.Locale.ROOT, "HOLIDAY_PERFORMANCE: samples=300; cached_p99_ms=%.3f; p99_limit_ms=5; year_ms=%.3f; year_limit_ms=20; passed=%s%n", percentile, yearMillis, percentile < 5 && yearMillis < 20);
        equal(true, percentile < 5, "cached P99 must be below five milliseconds");
        equal(true, yearMillis < 20, "one-year calculation must be below twenty milliseconds");
    }

    private void save(String type) {
        HolidayDateItemDTO holiday = new HolidayDateItemDTO(); holiday.setHolidayDate(CHANGED); holiday.setDateType(type);
        holiday.setHolidayName("检查|假日"); holiday.setTriplePayFlag(type.equals("HOLIDAY") ? 1 : 0);
        HolidayDateItemDTO makeup = new HolidayDateItemDTO(); makeup.setHolidayDate(LocalDate.of(2027, 1, 2)); makeup.setDateType("WORKDAY"); makeup.setTriplePayFlag(0);
        HolidayDateBatchDTO batch = new HolidayDateBatchDTO(); batch.setCalendarId(DEFAULT_CALENDAR); batch.setYearNo(2027); batch.setDates(List.of(holiday, makeup));
        management.batchSave(batch);
    }

    private void makeDefault(long calendarId) {
        HolidayCalendarDTO input = new HolidayCalendarDTO(); BeanUtils.copyProperties(management.get(calendarId), input); input.setDefaultFlag(1);
        management.edit(input);
    }

    private String persistedType() {
        return jdbc.queryForObject("SELECT date_type FROM sys_holiday_date WHERE tenant_id=? AND calendar_id=? AND holiday_date=? AND deleted=0", String.class, TENANT, DEFAULT_CALENDAR, CHANGED);
    }

    private <Type> Type mapper(Class<Type> type) { return sessions.getMapper(type); }

    @SuppressWarnings("unchecked")
    private <Type> Type transactional(Type target) {
        ProxyFactory proxy = new ProxyFactory(target);
        proxy.setProxyTargetClass(true);
        proxy.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));
        return (Type) proxy.getProxy();
    }

    private static void context(long tenantId) {
        UserContext.setTenantId(tenantId); UserContext.setUserId(21L); UserContext.setUserName("HOLIDAY_DATABASE_CHECK");
        UserContext.setRoles(Set.of("admin")); UserContext.setDsType(0); TenantContext.setTenantId(tenantId);
    }

    private static void clearContext() { UserContext.clear(); TenantContext.clear(); }

    private static void await(CountDownLatch latch) {
        try { if (!latch.await(10, TimeUnit.SECONDS)) throw new AssertionError("Concurrent database check timed out"); }
        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
    }

    private static void equal(Object expected, Object actual, String label) {
        assertions++;
        if (!Objects.equals(expected, actual)) throw new AssertionError(label + "; expected=" + expected + "; actual=" + actual);
    }

    private static void rejects(Runnable action, String message, String label) {
        try { action.run(); }
        catch (ServiceException expected) { equal(true, expected.getMessage().contains(message), label); return; }
        throw new AssertionError(label);
    }

    @Override
    public void close() {
        try { redis.close(); }
        finally { source.close(); }
    }
}
