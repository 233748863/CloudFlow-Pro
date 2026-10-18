package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.OptimisticLockerInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.holiday.mapper.*;
import com.cloudflow.common.holiday.service.HolidayCalendarServiceImpl;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.hr.client.BusinessRuleClient;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.client.dto.WorkflowInvalidateRequest;
import com.cloudflow.hr.domain.dto.HrLeaveTypePayload;
import com.cloudflow.hr.domain.dto.HrTimeRequestPayload;
import com.cloudflow.hr.domain.entity.*;
import com.cloudflow.hr.mapper.*;
import com.cloudflow.hr.service.impl.HrEssServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.stream.Stream;
import org.mybatis.spring.SqlSessionTemplate;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.context.support.StaticApplicationContext;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.PlatformTransactionManager;

import java.beans.Introspector;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

import static com.cloudflow.hr.service.HrRulePrecisionChecks.*;

public final class HrRuleDatabaseChecks {
    private static final long EMPLOYEE = 900000L;
    private final Map<Class<?>, Object> beans = new HashMap<>();
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final JdbcTemplate jdbc;
    private final SqlSessionTemplate sessions;
    private final Path storageRoot;
    private final Map<String, String> remoteInstances = new ConcurrentHashMap<>();
    private final java.util.concurrent.atomic.AtomicInteger remoteCalls = new java.util.concurrent.atomic.AtomicInteger();
    private final java.util.concurrent.atomic.AtomicInteger remoteCancellations = new java.util.concurrent.atomic.AtomicInteger();

    static void run(String url) throws Exception {
        HrRuleDatabaseChecks fixture = new HrRuleDatabaseChecks(url);
        try {
            fixture.leaveConcurrency();
            fixture.workflowRecovery();
            fixture.attendanceProtection();
            fixture.overnightLeaveBreaks();
            fixture.payrollAccumulation();
            fixture.grievancePrivacy();
        } finally {
            identity();
            try (Stream<Path> paths = Files.walk(fixture.storageRoot)) {
                for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) {
                    if (!path.toAbsolutePath().normalize().startsWith(fixture.storageRoot)) throw new IllegalStateException("Unsafe test cleanup path");
                    Files.deleteIfExists(path);
                }
            }
        }
        System.out.println("PASS: isolated HR service/database checks");
    }

    private HrRuleDatabaseChecks(String url) throws Exception {
        if (!url.startsWith("jdbc:mysql://127.0.0.1:")) throw new IllegalArgumentException("Only isolated loopback database is allowed");
        DriverManagerDataSource dataSource = new DriverManagerDataSource(url, "root", "");
        jdbc = new JdbcTemplate(dataSource);
        String directory = jdbc.queryForObject("SELECT @@datadir", String.class).replace('\\', '/');
        if (!directory.contains("/cloudflow-backend/target/batch-d-mysql-")) throw new IllegalArgumentException("Database must be created by verify-batch-d-db.ps1");
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        configuration.addMappers("com.cloudflow.hr.mapper");
        configuration.addMappers("com.cloudflow.common.holiday.mapper");
        configuration.addMappers("com.cloudflow.common.tenant.quota.mapper");
        configuration.addMappers("com.cloudflow.common.event.outbox");
        MybatisPlusInterceptor interceptors = new MybatisPlusInterceptor();
        interceptors.addInnerInterceptor(new OptimisticLockerInnerInterceptor());
        interceptors.addInnerInterceptor(new PaginationInnerInterceptor(com.baomidou.mybatisplus.annotation.DbType.MYSQL));
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(dataSource); factory.setConfiguration(configuration); factory.setPlugins(interceptors);
        factory.setMapperLocations(new PathMatchingResourcePatternResolver().getResources("classpath*:mapper/**/*.xml"));
        sessions = new SqlSessionTemplate(factory.getObject());
        StaticApplicationContext context = new StaticApplicationContext();
        for (Class<?> mapper : configuration.getMapperRegistry().getMappers()) {
            context.getBeanFactory().registerSingleton(Introspector.decapitalize(mapper.getSimpleName()), sessions.getMapper(mapper));
        }
        beans.put(org.springframework.context.ApplicationContext.class, context);
        beans.put(ObjectMapper.class, json);
        beans.put(PlatformTransactionManager.class, new DataSourceTransactionManager(dataSource));
        beans.put(RedissonClient.class, locks());
        SysConfigHelper settings = new SysConfigHelper() {
            @Override public String getConfigValue(String key, String fallback) { return fallback; }
            @Override public int getConfigInt(String key, int fallback) { return fallback; }
            @Override public boolean getConfigBoolean(String key, boolean fallback) { return fallback; }
        };
        beans.put(SysConfigHelper.class, settings);
        beans.put(RuntimeSysConfigService.class, new RuntimeSysConfigService(settings));
        beans.put(BusinessRuleClient.class, proxy(BusinessRuleClient.class, (method, values) -> R.ok()));
        beans.put(WorkflowServiceClient.class, proxy(WorkflowServiceClient.class, (method, values) -> {
            equal(false, org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive(), "workflow network call has no local database transaction");
            if (method.equals("startProcess")) {
                ProcessStartDTO request = (ProcessStartDTO) values[0];
                remoteCalls.incrementAndGet();
                return R.ok(remoteInstances.computeIfAbsent(request.getBusinessType() + ":" + request.getBusinessId(), key -> "workflow-" + request.getBusinessId()));
            }
            if (method.equals("cancelProcess")) { remoteCancellations.incrementAndGet(); return R.ok(); }
            throw new IllegalStateException("Unexpected workflow operation " + method);
        }));
        register(HrRuleSupport.class);
        register(HrTypedCrudService.class);
        register(OutboxPublisher.class);
        beans.put(HolidayCalendarService.class, new HolidayCalendarServiceImpl(mapper(HolidayCalendarMapper.class), mapper(HolidayDateMapper.class), mapper(HolidayResolverMapper.class), null));
        register(HrLeaveDayCalculator.class);
        register(com.cloudflow.common.tenant.quota.TenantQuotaService.class);
        HrFileStorage storage = register(HrFileStorage.class);
        storageRoot = Files.createTempDirectory(Path.of("cloudflow-backend/target").toAbsolutePath().normalize(), "batch-d-files-");
        Field baseDir = HrFileStorage.class.getDeclaredField("baseDir"); baseDir.setAccessible(true); baseDir.set(storage, storageRoot.toString());
        register(HrRuleProofService.class);
        register(HrRuleWorkflowService.class);
        register(HrLeaveBusinessService.class);
        register(HrLeaveConfigurationService.class);
        register(HrPayrollConfigurationService.class);
        register(HrAdvanceLedgerService.class);
        register(HrAdvancePayrollService.class);
        register(HrPayrollCalculationService.class);
        register(HrAttendanceBusinessService.class);
        beans.put(HrEssSupport.class, new HrEssSupport(null) {
            @Override public Long currentEmployeeId() {
                HrEmployee employee = mapper(HrEmployeeMapper.class).selectOne(new LambdaQueryWrapper<HrEmployee>()
                        .eq(HrEmployee::getTenantId, UserContext.getTenantId()).eq(HrEmployee::getUserId, UserContext.getUserId()).eq(HrEmployee::getDeleted, 0));
                if (employee == null) throw new IllegalStateException("No test employee for this user");
                return employee.getId();
            }
        });
        register(HrGrievanceAccessService.class);
        register(HrGrievanceService.class);
        register(HrEssServiceImpl.class);
        jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,employee_status,hire_date,user_id,dept_id) VALUES(900000,100000,'D-CHECK','规则验收员工','MALE','ACTIVE','2025-01-01',900000,103)");
        jdbc.update("INSERT INTO hr_leave_type(id,tenant_id,leave_code,leave_name,need_quota,is_paid,unit,max_days_per_year,status) VALUES(900000,100000,'D-CHECK','验收假期',1,1,'DAY',10,1),(900001,100000,'D-HOUR','无额度小时假',0,1,'HOUR',100,1)");
        jdbc.update("INSERT INTO hr_leave_policy(policy_id,tenant_id,policy_code,policy_name,status) VALUES(900000,100000,'D-CHECK','验收政策','ACTIVE')");
        jdbc.update("INSERT INTO hr_leave_policy_detail(tenant_id,policy_id,leave_type_id,annual_days) VALUES(100000,900000,900000,1),(100000,900000,900001,10)");
        jdbc.update("INSERT INTO hr_leave_policy_assignment(assignment_id,tenant_id,employee_id,policy_id,leave_period_id,assignment_basis,effective_from,effective_to,status,allocated_flag) VALUES(900000,100000,900000,900000,100,'PERIOD','2026-01-01','2026-12-31','ACTIVE',1)");
        jdbc.update("INSERT INTO hr_leave_ledger(tenant_id,employee_id,leave_type_id,leave_period_id,transaction_type,leave_days,quantity_unit,from_date,to_date) VALUES(100000,900000,900000,100,'ALLOCATION',1,'DAY','2026-01-01','2026-12-31')");
        jdbc.update("INSERT INTO hr_leave_quota(id,tenant_id,employee_id,leave_type_id,period_id,total_quota,used_quota,frozen_quota,available_quota) VALUES(900000,100000,900000,900000,100,1,0,0,1)");
        jdbc.update("INSERT INTO hr_schedule_assignment(tenant_id,target_type,target_id,shift_id,effective_start,status) VALUES(100000,'EMPLOYEE',900000,100,'2025-01-01','ACTIVE')");
        UserContext.setUserId(EMPLOYEE);
    }

    private void leaveConcurrency() throws Exception {
        HrLeaveBusinessService leave = bean(HrLeaveBusinessService.class);
        CyclicBarrier barrier = new CyclicBarrier(2);
        ExecutorService workers = Executors.newFixedThreadPool(2);
        List<Object> results = new ArrayList<>();
        try {
            List<java.util.concurrent.Future<Object>> futures = new ArrayList<>();
            for (int index = 0; index < 2; index++) futures.add(workers.submit(() -> {
                identity(); UserContext.setUserId(EMPLOYEE);
                try { barrier.await(5, TimeUnit.SECONDS); return leave.submit(request(900000L, "2026-01-05T09:00", "2026-01-05T18:00")); }
                catch (RuntimeException failure) { return failure; }
                finally { UserContext.clear(); }
            }));
            for (Future<Object> future : futures) results.add(future.get(20, TimeUnit.SECONDS));
        } finally { workers.shutdownNow(); }
        equal(1L, results.stream().filter(Long.class::isInstance).count(), "one of two concurrent leave submissions succeeds: " + results);
        equal(1L, results.stream().filter(com.cloudflow.hr.exception.HrBusinessException.class::isInstance).count(), "other concurrent request is a business rejection");
        long first = results.stream().filter(Long.class::isInstance).map(Long.class::cast).findFirst().orElseThrow();
        equal(1, count("SELECT COUNT(*) FROM hr_time_request WHERE employee_id=900000"), "failed request rolls back");
        equal(1, count("SELECT COUNT(*) FROM outbox_event WHERE event_type='HR_RULE_WORKFLOW_START' AND aggregate_id=?", first), "workflow intent committed with accepted request");
        decimal("1", quota().getFrozenQuota(), "single request reserves available quota");
        jdbc.update("UPDATE hr_leave_type SET status=0 WHERE id=900000");
        leave.onApproval(first, "REJECTED"); leave.onApproval(first, "REJECTED");
        decimal("0", quota().getFrozenQuota(), "disabled leave type can still release reservation");
        decimal("1", quota().getAvailableQuota(), "rejection callback is idempotent");
        jdbc.update("UPDATE hr_time_request SET status='CANCELLED' WHERE id=?", first);
        jdbc.update("UPDATE hr_leave_type SET status=1 WHERE id=900000");
        Long approved = leave.submit(request(900000L, "2026-01-05T09:00", "2026-01-05T18:00"));
        leave.onApproval(approved, "APPROVED"); leave.onApproval(approved, "APPROVED");
        jdbc.update("UPDATE hr_time_request SET status='APPROVED' WHERE id=?", approved);
        decimal("1", quota().getUsedQuota(), "approval deducts exactly once");
        decimal("0", quota().getFrozenQuota(), "approval releases freeze");
        Long hourly = leave.submit(request(900001L, "2026-01-06T09:00", "2026-01-06T11:00"));
        HrLeaveTypePayload changed = json.convertValue(mapper(HrLeaveTypeMapper.class).selectById(900001L), HrLeaveTypePayload.class);
        changed.setUnit("DAY");
        fails(() -> bean(HrLeaveConfigurationService.class).saveType(900001L, changed), "pending non-quota request protects original unit");
        leave.onApproval(hourly, "APPROVED"); leave.onApproval(hourly, "APPROVED");
        jdbc.update("UPDATE hr_time_request SET status='APPROVED' WHERE id=?", hourly);
        equal(1, count("SELECT COUNT(*) FROM hr_leave_ledger WHERE employee_id=900000 AND leave_type_id=900001 AND transaction_type='APPLICATION'"), "non-quota approved leave is recorded once");
        jdbc.update("UPDATE hr_leave_quota SET available_quota=99 WHERE id=900000");
        equal(true, leave.reconcileQuotas() > 0, "reconciliation detects mismatched read model");
        decimal("99", quota().getAvailableQuota(), "reconciliation warns without rewriting balances");
        leave.recalculate(EMPLOYEE, 900000L);
        decimal("0", quota().getAvailableQuota(), "explicit rebuild restores ledger projection");
        Long application = jdbc.queryForObject("SELECT ledger_id FROM hr_leave_ledger WHERE employee_id=900000 AND leave_type_id=900000 AND transaction_type='APPLICATION'", Long.class);
        leave.reverseLedger(application, "隔离验收冲正");
        decimal("1", quota().getAvailableQuota(), "application reversal restores availability");
    }

    private void workflowRecovery() throws Exception {
        HrLeaveBusinessService leave = bean(HrLeaveBusinessService.class);
        HrRuleWorkflowService workflow = bean(HrRuleWorkflowService.class);
        Long requestId = leave.submit(request(900001L, "2026-01-08T09:00", "2026-01-08T10:00"));
        ProcessStartDTO start = startup(requestId);
        workflow.start(start); workflow.start(start);
        equal(1, remoteCalls.get(), "replayed workflow startup does not call remote twice after binding");
        leave.revoke(requestId);
        equal(0, remoteCancellations.get(), "local withdrawal queues durable cancellation instead of networking inside transaction");
        equal(1, count("SELECT COUNT(*) FROM outbox_event WHERE event_type='HR_RULE_WORKFLOW_CANCEL' AND aggregate_id=?", requestId), "withdrawal commits a cancellation intent");
        WorkflowInvalidateRequest cancel = cancellation(requestId);
        workflow.processCancellation(cancel); workflow.processCancellation(cancel);
        equal(1, remoteCancellations.get(), "successful remote cancellation is replay safe");
        Long neverStarted = leave.submit(request(900001L, "2026-01-09T09:00", "2026-01-09T10:00"));
        leave.revoke(neverStarted);
        workflow.start(startup(neverStarted)); workflow.processCancellation(cancellation(neverStarted));
        equal(1, remoteCalls.get(), "withdrawal before first attempt does not create a workflow");
        HrTypedCrudService delegate = bean(HrTypedCrudService.class);
        java.util.concurrent.atomic.AtomicBoolean failBinding = new java.util.concurrent.atomic.AtomicBoolean(true);
        HrTypedCrudService flaky = new HrTypedCrudService(null, null, null, null, null, null, null, null, null, null, null) {
            @Override public <T> Map<String, Object> get(Class<T> type, Long id) { return delegate.get(type, id); }
            @Override public <T> void updateProperties(Class<T> type, Long id, Map<String, Object> fields) {
                if (fields.containsKey("processInstanceId") && failBinding.getAndSet(false)) throw new IllegalStateException("Simulated binding failure");
                delegate.updateProperties(type, id, fields);
            }
        };
        HrRuleWorkflowService recovering = new HrRuleWorkflowService(bean(OutboxPublisher.class), json,
                bean(RuntimeSysConfigService.class), bean(WorkflowServiceClient.class), flaky, bean(HrRuleSupport.class),
                bean(HrHSupport.class), bean(HrHMapper.class), bean(HrOvertimeRequestMapper.class),
                bean(HrShiftRequestMapper.class), bean(HrPayrollCorrectionMapper.class), bean(HrSalarySlipMapper.class), bean(HrEmployeeReferralMapper.class), bean(HrOfferMapper.class),
                bean(com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper.class), bean(com.cloudflow.hr.service.HrAdvanceApprovalSupport.class));
        Long recoveringId = leave.submit(request(900001L, "2026-01-12T09:00", "2026-01-12T10:00"));
        ProcessStartDTO recoveringStart = startup(recoveringId);
        fails(() -> recovering.start(recoveringStart), "successful remote creation with failed local binding remains retryable");
        leave.revoke(recoveringId);
        fails(() -> recovering.processCancellation(cancellation(recoveringId)), "cancellation waits for recovery when a remote start was attempted");
        recovering.start(recoveringStart);
        recovering.processCancellation(cancellation(recoveringId));
        equal(2, remoteInstances.size(), "binding retry reuses remote business identity");
        equal(2, remoteCancellations.get(), "withdrawal racing with binding recovery cancels recovered workflow");
        equal("CANCELLED", mapper(HrTimeRequestMapper.class).selectById(recoveringId).getStatus(), "binding recovery never reopens withdrawn business request");
    }

    private ProcessStartDTO startup(Long id) throws Exception {
        String envelope = jdbc.queryForObject("SELECT payload_json FROM outbox_event WHERE event_type='HR_RULE_WORKFLOW_START' AND aggregate_id=?", String.class, id);
        return json.readValue(json.readTree(envelope).path("payload").asText(), ProcessStartDTO.class);
    }

    private WorkflowInvalidateRequest cancellation(Long id) {
        WorkflowInvalidateRequest request = new WorkflowInvalidateRequest(); request.setTenantId(100000L);
        request.setBusinessType("HR_TIME_REQUEST"); request.setBusinessId(id); return request;
    }

    private void attendanceProtection() {
        HrAttendanceBusinessService attendance = bean(HrAttendanceBusinessService.class);
        LocalDate date = LocalDate.of(2026, 1, 7);
        jdbc.update("UPDATE hr_shift SET auto_attendance_flag=1 WHERE id=100");
        jdbc.update("INSERT INTO hr_attendance_record(id,tenant_id,employee_id,attendance_date,shift_id,work_minutes,expected_minutes,status,manual_adjusted_flag) VALUES(900000,100000,900000,'2026-01-07',100,477,480,'NORMAL',1)");
        equal(477, attendance.calculateAndSave(EMPLOYEE, date, false).getWorkMinutes(), "automatic recalculation preserves manual record");
        jdbc.update("INSERT INTO hr_attendance_monthly(tenant_id,employee_id,year,month,status) VALUES(100000,900000,2026,1,'CONFIRMED')");
        fails(() -> attendance.calculateAndSave(EMPLOYEE, date, true), "even confirmed overwrite cannot modify closed attendance month");
        jdbc.update("UPDATE hr_attendance_monthly SET status='DRAFT' WHERE employee_id=900000");
        equal("LEAVE", attendance.calculate(EMPLOYEE, LocalDate.of(2026, 1, 6)).getStatus(), "approved hourly leave suppresses absence per approved rule");
        HrPayrollPeriod period = period("2026-01-01", "2026-01-31");
        fails(() -> bean(HrPayrollCalculationService.class).assertAttendanceComplete(mapper(HrEmployeeMapper.class).selectById(EMPLOYEE), period), "unclosed month blocks validated payroll");
    }

    private void overnightLeaveBreaks() {
        jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,employee_status,hire_date,dept_id) VALUES(900020,100000,'D-NIGHT','夜班验收员工','MALE','ACTIVE','2025-01-01',103)");
        jdbc.update("INSERT INTO hr_shift(id,tenant_id,shift_code,shift_name,start_time,end_time,break_minutes,work_minutes) VALUES(900020,100000,'D-NIGHT','夜班验收','22:00','06:00',60,420)");
        jdbc.update("INSERT INTO hr_attendance_rule(id,tenant_id,rule_code,rule_name,shift_id,config_json) VALUES(900020,100000,'D-NIGHT','夜班休息验收',900020,JSON_OBJECT('breakStartTime','00:00','breakEndTime','01:00'))");
        jdbc.update("INSERT INTO hr_schedule_assignment(tenant_id,target_type,target_id,rule_id,schedule_date,status) VALUES(100000,'EMPLOYEE',900020,900020,'2026-01-05','ACTIVE')");
        HrLeaveDayCalculator calculator = bean(HrLeaveDayCalculator.class);
        HrLeaveType type = new HrLeaveType(); type.setUnit("HOUR"); type.setIncludeHolidayFlag(0);
        LocalDate date = LocalDate.of(2026, 1, 5);
        LocalDateTime start = LocalDateTime.parse("2026-01-05T23:30");
        LocalDateTime end = LocalDateTime.parse("2026-01-06T01:30");
        decimal("1", calculator.quantity(900020L, type, date, start, end), "assigned overnight rule excludes only intersecting break minutes");
        decimal("7", calculator.quantity(900020L, type, date, date.atTime(22, 0), date.plusDays(1).atTime(6, 0)), "complete overnight hourly leave uses configured working minutes");
        decimal("0", calculator.quantity(900020L, type, date, date.plusDays(1).atStartOfDay(), date.plusDays(1).atTime(1, 0)), "leave entirely during overnight break consumes no quota");
        type.setUnit("DAY");
        decimal("0.14285714", calculator.quantity(900020L, type, date, start, end), "overnight day fraction uses actual seven-hour denominator");
        HrTimeRequest request = new HrTimeRequest(); request.setUnit("HOUR"); request.setStartTime(start); request.setEndTime(end);
        decimal("0.14285714", calculator.fraction(900020L, request, date, false), "payroll hourly leave shares exact overnight break deduction");
        jdbc.update("UPDATE hr_attendance_rule SET config_json=JSON_OBJECT() WHERE id=900020");
        fails(() -> calculator.quantity(900020L, type, date, start, end), "partial overnight leave rejects missing persisted break location");
    }

    private void payrollAccumulation() throws Exception {
        String policy = "{\"payrollBasis\":{\"salaryBasis\":\"MONTHLY\",\"prorationBasis\":\"CALENDAR_DAYS\",\"benefitTiming\":\"FIRST_PAYROLL\"}}";
        jdbc.update("INSERT INTO hr_comp_structure(id,tenant_id,structure_code,structure_name,component_config,status) VALUES(900000,100000,'D-CHECK','隔离计薪结构',?,1)", policy);
        jdbc.update("INSERT INTO hr_employee_comp(id,tenant_id,employee_id,structure_id,total_salary,effective_date,status) VALUES(900000,100000,900000,900000,'3100.00','2025-01-01','ACTIVE')");
        jdbc.update("INSERT INTO hr_tax_slab(slab_id,tenant_id,slab_name,region,effective_from,effective_to,threshold_amount,status) VALUES(900000,100000,'隔离测试合成税率','TEST_ONLY','2026-01-01','2027-12-31',500,'ACTIVE')");
        for (int index = 0; index < 7; index++) {
            jdbc.update("INSERT INTO hr_tax_slab_detail(tenant_id,slab_id,level_no,from_amount,to_amount,tax_rate,quick_deduction) VALUES(100000,900000,?,?,?,?,0)",
                    index + 1, index * 10000, index == 6 ? null : (index + 1) * 10000, new BigDecimal("0.10"));
        }
        jdbc.update("INSERT INTO hr_tax_profile(tenant_id,employee_id,tax_slab_id,status) VALUES(100000,900000,900000,'ACTIVE')");
        jdbc.update("INSERT INTO hr_tax_deduction(tenant_id,employee_id,deduction_type,amount,start_date,end_date,status,declare_status) VALUES(100000,900000,'CHILD_EDUCATION',100,'2026-01-01','2027-12-31','ACTIVE','VERIFIED')");
        jdbc.update("INSERT INTO hr_benefit_payment(tenant_id,employee_id,scheme_id,period_month,personal_amount,status) VALUES(100000,900000,100,'2026-01',100,'PAID')");
        HrPayrollCalculationService calculation = bean(HrPayrollCalculationService.class);
        HrEmployeeComp comp = calculation.compensation(EMPLOYEE, LocalDate.of(2026, 1, 31));
        HrPayrollPeriod firstPeriod = period("2026-01-01", "2026-01-15");
        HrPayrollPeriod secondPeriod = period("2026-01-16", "2026-01-31");
        decimal("1500", calculation.baseCompensation(comp, firstPeriod).gross(), "first half uses configured monthly calendar basis");
        decimal("1600", calculation.baseCompensation(comp, secondPeriod).gross(), "second half retains remaining cents");
        Map<String, BigDecimal> firstBenefit = personalBenefits(comp, firstPeriod);
        decimal("100", firstBenefit.get("2026-01"), "first payroll charges monthly personal insurance");
        HrSalarySlip first = slip(calculation, comp, firstPeriod, firstBenefit);
        decimal("80", first.getCurrentTax(), "first split payroll applies threshold, verified deduction and insurance");
        persist(first);
        Map<String, BigDecimal> secondBenefit = personalBenefits(comp, secondPeriod);
        decimal("0", secondBenefit.get("2026-01"), "second payroll cannot charge insurance twice");
        HrSalarySlip second = slip(calculation, comp, secondPeriod, secondBenefit);
        decimal("160", second.getCurrentTax(), "second split payroll does not repeat monthly threshold or special deduction");
        decimal("0", HrPayrollCalculationService.decimal(HrPayrollCalculationService.snapshot(second).get("thresholdApplied")), "same-month threshold snapshot records zero additional allowance");
        persist(second);
        HrSalarySlip february = slip(calculation, comp, period("2026-02-01", "2026-02-28"), Map.of());
        decimal("250", february.getCurrentTax(), "next month accumulates taxable income and deductions");
        persist(february);
        HrSalarySlip nextYear = slip(calculation, comp, period("2027-01-01", "2027-01-31"), Map.of());
        decimal("250", nextYear.getCurrentTax(), "new tax year excludes prior-year wages and tax");
        HrSalarySlip correction = calculation.correction(EMPLOYEE, secondPeriod, new BigDecimal("-3000"), BigDecimal.ZERO);
        decimal("0", correction.getCurrentTax(), "negative correction never refunds withholding");
        jdbc.update("INSERT INTO hr_attendance_record(tenant_id,employee_id,attendance_date,expected_minutes,status,absent_flag) VALUES(100000,900000,'2026-01-30',480,'ABSENT',1),(100000,900000,'2026-02-02',480,'ABSENT',1)");
        decimal("210.71", calculation.payrollDeductions(EMPLOYEE, period("2026-01-16", "2026-02-15")).attendance(), "cross-month absence uses each month denominator");
        jdbc.update("UPDATE hr_employee SET hire_date='2026-01-16' WHERE id=900000");
        decimal("1600", calculation.baseCompensation(comp, period("2026-01-01", "2026-01-31")).gross(), "mid-month hire is prorated once");
        fails(() -> calculation.baseCompensation(comp, firstPeriod), "pre-hire payroll period rejected");
        jdbc.update("UPDATE hr_employee SET hire_date='2025-01-01' WHERE id=900000");
        jdbc.update("UPDATE hr_comp_structure SET component_config=JSON_OBJECT('payrollBasis',JSON_OBJECT('salaryBasis','INVALID','prorationBasis','CALENDAR_DAYS','benefitTiming','FIRST_PAYROLL')) WHERE id=900000");
        fails(() -> calculation.baseCompensation(comp, period("2026-01-01", "2026-01-31")), "invalid full-month policy is rejected");
        jdbc.update("UPDATE hr_comp_structure SET component_config=? WHERE id=900000", policy);
    }

    private HrSalarySlip slip(HrPayrollCalculationService calculation, HrEmployeeComp comp, HrPayrollPeriod period, Map<String, BigDecimal> benefits) {
        HrPayrollCalculationService.PayrollBase base = calculation.baseCompensation(comp, period);
        HrSalarySlip slip = new HrSalarySlip(); slip.setTenantId(100000L); slip.setEmployeeId(EMPLOYEE);
        slip.setPeriodMonth(java.time.YearMonth.from(period.getEndDate()).toString()); slip.setGrossTotal(base.gross());
        slip.setBenefitAmount(benefits.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add));
        slip.setComponents(new ArrayList<>(List.of(base.snapshot(), Map.of("name", "社保快照", "type", "BENEFIT_SNAPSHOT", "amount", BigDecimal.ZERO, "months", benefits))));
        calculation.apply(slip, period, false);
        return slip;
    }

    private void persist(HrSalarySlip slip) {
        slip.setStatus("SUBMITTED"); slip.setDeleted(0); slip.setVersion(0); slip.setEmployeeConfirmed(false);
        slip.setCreateTime(LocalDateTime.now()); slip.setUpdateTime(LocalDateTime.now());
        mapper(HrSalarySlipMapper.class).insert(slip);
    }

    @SuppressWarnings("unchecked")
    private Map<String, BigDecimal> personalBenefits(HrEmployeeComp comp, HrPayrollPeriod period) throws Exception {
        Method method = HrEssServiceImpl.class.getDeclaredMethod("personalBenefits", Long.class, HrEmployeeComp.class, HrPayrollPeriod.class);
        method.setAccessible(true);
        return (Map<String, BigDecimal>) method.invoke(bean(HrEssServiceImpl.class), 100000L, comp, period);
    }

    private void grievancePrivacy() {
        HrFileStorage storage = bean(HrFileStorage.class);
        byte[] bytes = "private-evidence-check".getBytes(StandardCharsets.UTF_8);
        org.springframework.transaction.support.TransactionTemplate fileTransaction = new org.springframework.transaction.support.TransactionTemplate(bean(PlatformTransactionManager.class));
        Long publicFile = fileTransaction.execute(status -> storage.save(bytes, "员工证据.pdf", "HR_GRIEVANCE"));
        Long internalFile = fileTransaction.execute(status -> storage.save(bytes, "内部调查.pdf", "HR_GRIEVANCE"));
        fails(() -> storage.load(internalFile), "generic HR file entry cannot load private evidence");
        fails(() -> storage.loadPrivate(internalFile, "HR_LEAVE_PROOF"), "file purpose substitution rejected");
        jdbc.update("INSERT INTO hr_grievance(grievance_id,tenant_id,grievance_no,employee_id,employee_name,grievance_type,subject,description,against_type,status,handler_id,attachment_url,escalated_dispute_id) VALUES(900000,100000,'D-CASE',900000,'验收员工','OTHER','隐私验收','隔离用例','NONE','INVESTIGATING',900002,?,23500)", "[" + publicFile + "]");
        jdbc.update("INSERT INTO hr_grievance_record(tenant_id,grievance_id,record_type,operator_role,content,visible_to_employee_flag,attachment_url) VALUES(100000,900000,'COMMENT','HR','公开进度',1,NULL),(100000,900000,'COMMENT','HR','内部调查',0,?)", "[" + internalFile + "]");
        HrGrievanceService service = bean(HrGrievanceService.class);
        UserContext.setRoles(Set.of("employee")); UserContext.setUserId(EMPLOYEE);
        equal(1, ((List<?>) service.detail(900000L, true).get("records")).size(), "employee sees only public grievance records");
        equal(bytes.length, service.download(900000L, publicFile, true).getBody().length, "employee can download linked public evidence");
        fails(() -> service.download(900000L, internalFile, true), "employee cannot download internal evidence by known file id");
        fails(() -> service.detail(900000L, false), "applicant cannot bypass internal visibility using management entry");
        UserContext.setUserId(900002L);
        equal(2, ((List<?>) service.detail(900000L, false).get("records")).size(), "assigned handler sees investigation records");
        equal(bytes.length, service.downloadDisputeFile(23500L, internalFile).getBody().length, "linked dispute download preserves assigned-handler access");
        jdbc.update("UPDATE hr_grievance SET against_type='USER',against_id=900002 WHERE grievance_id=900000");
        UserContext.setRoles(Set.of("hr"));
        fails(() -> service.detail(900000L, false), "targeted handler remains excluded even with HR role");
        fails(() -> service.downloadDisputeFile(23500L, internalFile), "dispute link cannot bypass targeted-person exclusion");
        UserContext.setUserId(900003L); UserContext.setRoles(Set.of("admin"));
        fails(() -> service.detail(900000L, false), "admin role alone is not HR grievance access");
        UserContext.setRoles(Set.of("hr"));
        equal(2, ((List<?>) service.detail(900000L, false).get("records")).size(), "unconflicted HR can investigate");
        UserContext.setTenantId(200000L);
        fails(() -> service.detail(900000L, false), "cross-tenant grievance id rejected");
        fails(() -> storage.loadPrivate(publicFile, "HR_GRIEVANCE"), "cross-tenant private file id rejected");
        identity(); UserContext.setUserId(EMPLOYEE);
    }

    private HrLeaveQuota quota() { return mapper(HrLeaveQuotaMapper.class).selectById(900000L); }

    private int count(String statement, Object... parameters) { return jdbc.queryForObject(statement, Integer.class, parameters); }

    private HrTimeRequestPayload request(Long type, String start, String end) {
        HrTimeRequestPayload request = new HrTimeRequestPayload(); request.setEmployeeId(EMPLOYEE); request.setLeaveTypeId(type);
        request.setRequestType("LEAVE"); request.setStartTime(LocalDateTime.parse(start)); request.setEndTime(LocalDateTime.parse(end));
        request.setReason("隔离验收请假"); return request;
    }

    private HrPayrollPeriod period(String start, String end) {
        HrPayrollPeriod period = new HrPayrollPeriod(); period.setTenantId(100000L); period.setStartDate(LocalDate.parse(start));
        period.setEndDate(LocalDate.parse(end)); period.setStatus("OPEN"); period.setFrequency("MONTHLY"); return period;
    }

    private <T> T mapper(Class<T> type) { return sessions.getMapper(type); }

    private <T> T bean(Class<T> type) { return type.cast(beans.get(type)); }

    private <T> T register(Class<T> type) throws Exception {
        Constructor<?> constructor = type.getConstructors()[0];
        Class<?>[] types = constructor.getParameterTypes();
        Object[] arguments = new Object[types.length];
        for (int index = 0; index < types.length; index++) {
            arguments[index] = types[index].isInterface() && types[index].getSimpleName().endsWith("Mapper")
                    ? mapper(types[index]) : beans.get(types[index]);
        }
        T instance = type.cast(constructor.newInstance(arguments)); beans.put(type, instance); return instance;
    }

    private RedissonClient locks() {
        Map<String, ReentrantLock> locks = new ConcurrentHashMap<>();
        return proxy(RedissonClient.class, (method, values) -> {
            if (!method.equals("getLock")) throw new IllegalStateException("Unexpected Redis call " + method);
            ReentrantLock lock = locks.computeIfAbsent((String) values[0], ignored -> new ReentrantLock());
            return proxy(RLock.class, (operation, parameters) -> {
                try {
                    return switch (operation) {
                        case "tryLock" -> lock.tryLock(((Number) parameters[0]).longValue(), (TimeUnit) parameters[parameters.length - 1]);
                        case "isHeldByCurrentThread" -> lock.isHeldByCurrentThread();
                        case "unlock" -> { lock.unlock(); yield null; }
                        default -> throw new IllegalStateException("Unexpected lock call " + operation);
                    };
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted);
                }
            });
        });
    }
}
