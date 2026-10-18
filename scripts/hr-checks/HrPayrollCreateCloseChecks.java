package com.cloudflow.hr.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.HrPayrollBatchCreateRequest;
import com.cloudflow.hr.domain.entity.HrPayrollPeriod;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrAuditLogMapper;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.cloudflow.hr.mapper.HrEmployeeCompMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrHMapper;
import com.cloudflow.hr.mapper.HrPayrollBatchEmployeeMapper;
import com.cloudflow.hr.mapper.HrPayrollBatchMapper;
import com.cloudflow.hr.mapper.HrPayrollPeriodMapper;
import com.cloudflow.hr.mapper.HrSalarySlipMapper;
import com.cloudflow.hr.service.HrAdvancePayrollService;
import com.cloudflow.hr.service.HrPayrollBatchService;
import com.cloudflow.hr.service.HrPayrollCalculationService;
import com.cloudflow.hr.service.HrPayrollConfigurationService;
import com.cloudflow.hr.service.HrRuleSupport;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.lang.reflect.Constructor;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.mybatis.spring.SqlSessionTemplate;
import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.springframework.context.ApplicationContext;
import org.springframework.context.support.StaticApplicationContext;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

/** Actual creation, precheck, closing and cancellation; explicit timing only, no HTTP or salary calculation. */
public final class HrPayrollCreateCloseChecks {
    private static final long TENANT = 991919L;
    private static final AtomicInteger CHECKS = new AtomicInteger();
    private final JdbcTemplate jdbc;
    private final HrRuleSupport support;
    private final HrPayrollBatchService batches;
    private final HrPayrollConfigurationService configuration;
    private final ThreadLocal<Boolean> closer = ThreadLocal.withInitial(() -> false);
    private volatile CountDownLatch closingAttempt;
    private long sequence = 993300L;

    private HrPayrollCreateCloseChecks(HikariDataSource source, RedissonClient redis, StaticApplicationContext application) throws Exception {
        jdbc = new JdbcTemplate(source);
        ObjectMapper json = new ObjectMapper().findAndRegisterModules();
        MybatisConfiguration mapping = new MybatisConfiguration();
        mapping.setMapUnderscoreToCamelCase(true); mapping.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        for (Class<?> mapper : List.of(HrEmployeeMapper.class, HrEmployeeCompMapper.class, HrAuditLogMapper.class,
                HrEmployeeAdvanceMapper.class, HrHMapper.class, HrPayrollPeriodMapper.class, HrPayrollBatchMapper.class,
                HrPayrollBatchEmployeeMapper.class, HrSalarySlipMapper.class)) mapping.addMapper(mapper);
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(source); factory.setConfiguration(mapping);
        factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        factory.setMapperLocations(new FileSystemResource("D:/CloudFlowPro/cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrEmployeeAdvanceMapper.xml"),
                new FileSystemResource("D:/CloudFlowPro/cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrAuditLogMapper.xml"),
                new FileSystemResource("D:/CloudFlowPro/cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrHMapper.xml"));
        SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        Map<Class<?>, Object> dependencies = new LinkedHashMap<>();
        dependencies.put(ApplicationContext.class, application); dependencies.put(ObjectMapper.class, json);
        for (Class<?> mapper : List.of(HrEmployeeMapper.class, HrEmployeeCompMapper.class, HrAuditLogMapper.class,
                HrEmployeeAdvanceMapper.class, HrHMapper.class, HrPayrollPeriodMapper.class, HrPayrollBatchMapper.class,
                HrPayrollBatchEmployeeMapper.class, HrSalarySlipMapper.class)) dependencies.put(mapper, sessions.getMapper(mapper));
        application.getBeanFactory().registerSingleton("hrPayrollPeriodMapper", sessions.getMapper(HrPayrollPeriodMapper.class));
        support = new HrRuleSupport(new DataSourceTransactionManager(source), redis, sessions.getMapper(HrEmployeeMapper.class),
                sessions.getMapper(HrAuditLogMapper.class), json, null) {
            @Override public <T> T locked(String resource, Supplier<T> action) {
                if (Boolean.TRUE.equals(closer.get()) && resource.startsWith("payroll-period:") && closingAttempt != null) closingAttempt.countDown();
                return super.locked(resource, action);
            }
        };
        dependencies.put(HrRuleSupport.class, support);
        dependencies.put(HrTypedCrudService.class, construct(HrTypedCrudService.class, dependencies));
        configuration = construct(HrPayrollConfigurationService.class, dependencies);
        dependencies.put(HrPayrollConfigurationService.class, configuration);
        dependencies.put(HrAdvancePayrollService.class, construct(HrAdvancePayrollService.class, dependencies));
        dependencies.put(HrPayrollCalculationService.class, construct(HrPayrollCalculationService.class, dependencies));
        batches = construct(HrPayrollBatchService.class, dependencies);
    }

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2 || !arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_settlement_foundation_[a-f0-9]{32}\\?.*")) throw new IllegalArgumentException("Owned scratch database required");
        String port = System.getenv("HR_SETTLEMENT_TEST_REDIS_PORT"), password = System.getenv("HR_SETTLEMENT_TEST_REDIS_PASSWORD");
        if (port == null || !port.matches("[0-9]{4,5}") || password == null || password.isBlank()) throw new IllegalArgumentException("Owned Redis required");
        Config redisConfig = new Config(); redisConfig.setThreads(2); redisConfig.setNettyThreads(2);
        redisConfig.useSingleServer().setAddress("redis://127.0.0.1:" + port).setPassword(password).setConnectionMinimumIdleSize(1).setConnectionPoolSize(4).setSubscriptionConnectionMinimumIdleSize(1).setSubscriptionConnectionPoolSize(2);
        RedissonClient redis = Redisson.create(redisConfig);
        try (HikariDataSource source = new HikariDataSource(); StaticApplicationContext application = new StaticApplicationContext()) {
            source.setJdbcUrl(arguments[0]); source.setUsername("root"); source.setPassword(""); source.setMaximumPoolSize(6);
            JdbcTemplate ownership = new JdbcTemplate(source);
            require(Path.of(arguments[1]).toRealPath().equals(Path.of(Objects.requireNonNull(ownership.queryForObject("SELECT @@datadir", String.class))).toRealPath()), "owned database");
            actor(); HrPayrollCreateCloseChecks suite = new HrPayrollCreateCloseChecks(source, redis, application);
            suite.createWins(false); suite.createWins(true); suite.paidOptions();
            System.out.println("D3_PAYROLL_CREATE_CLOSE: checks=" + CHECKS.get() + "; actual_mysql=true; actual_redis=true; actual_batch_create=true; actual_close=true; actual_precheck=true; controlled_overlap=true; http=false; official_tax_policy=false");
        } finally { redis.shutdown(); UserContext.clear(); TenantContext.clear(); }
    }

    private long seed() {
        long identifier = sequence++;
        jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,employee_status,hire_date) VALUES(?,?,?,?,'UNKNOWN','REGULAR','2047-01-01')", identifier, TENANT, "CREATE-CLOSE-" + identifier, "建批次关闭并发样本");
        jdbc.update("INSERT INTO hr_payroll_period(period_id,tenant_id,period_name,start_date,end_date,status) VALUES(?,?,?,'2047-01-01','2047-01-31','OPEN')", identifier, TENANT, "CREATE-CLOSE-" + identifier);
        return identifier;
    }

    private void createWins(boolean interrupted) throws Exception {
        long identifier = seed();
        HrPayrollBatchCreateRequest request = new HrPayrollBatchCreateRequest();
        request.setPayrollPeriodId(identifier); request.setEmployeeIds(List.of(identifier));
        CountDownLatch created = new CountDownLatch(1), release = new CountDownLatch(1);
        closingAttempt = new CountDownLatch(1);
        ExecutorService workers = Executors.newFixedThreadPool(2);
        List<Map<String, Object>> originalPeriod = jdbc.queryForList("SELECT * FROM hr_payroll_period WHERE period_id=?", identifier);
        try {
            Future<Long> create = workers.submit(() -> {
                actor();
                try {
                    return support.locked("payroll-period:" + identifier, () -> {
                        Long batchId = batches.create(request);
                        require(batchId != null, "actual batch persisted inside open transaction");
                        created.countDown(); await(release, "release original creation");
                        if (interrupted) throw new HrBusinessException("OWNED_CREATE_INTERRUPTION", "受控创建中断");
                        return batchId;
                    });
                } finally { UserContext.clear(); TenantContext.clear(); }
            });
            await(created, "creation reaches precommit checkpoint");
            Future<String> close = workers.submit(() -> {
                actor(); closer.set(true);
                try { configuration.closePeriod(identifier); return "CLOSED"; }
                catch (HrBusinessException rejected) { return rejected.getCode(); }
                finally { closer.remove(); UserContext.clear(); TenantContext.clear(); }
            });
            await(closingAttempt, "close starts while creation has uncommitted batch");
            require(!create.isDone() && !close.isDone(), "creation and closing overlap before commit");
            require(jdbc.queryForObject("SELECT COUNT(*) FROM hr_payroll_batch WHERE tenant_id=? AND payroll_period_id=?", Integer.class, TENANT, identifier) == 0, "uncommitted new batch hidden from independent connection");
            release.countDown();
            if (interrupted) {
                String code = null;
                try { create.get(20, TimeUnit.SECONDS); }
                catch (java.util.concurrent.ExecutionException failure) {
                    if (failure.getCause() instanceof HrBusinessException business) code = business.getCode(); else throw failure;
                }
                require("OWNED_CREATE_INTERRUPTION".equals(code), "original creation interruption preserved");
                require("CLOSED".equals(close.get(20, TimeUnit.SECONDS)), "close succeeds after failed creation rolls back");
                require(jdbc.queryForObject("SELECT COUNT(*) FROM hr_payroll_batch WHERE tenant_id=? AND payroll_period_id=?", Integer.class, TENANT, identifier) == 0, "failed creation leaves no batch");
                require(jdbc.queryForObject("SELECT COUNT(*) FROM hr_payroll_batch_employee WHERE tenant_id=? AND employee_id=?", Integer.class, TENANT, identifier) == 0, "failed creation leaves no selected employee");
                require(jdbc.queryForObject("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=? AND business_domain='PAYROLL_BATCH' AND (JSON_UNQUOTE(JSON_EXTRACT(after_data,'$.payrollPeriodId'))=? OR JSON_UNQUOTE(JSON_EXTRACT(after_data,'$.periodId'))=?)", Integer.class, TENANT, Long.toString(identifier), Long.toString(identifier)) == 0, "failed creation leaves no success audit");
            } else {
                Long batchId = create.get(20, TimeUnit.SECONDS);
                require("PAYROLL_BATCH_PENDING".equals(close.get(20, TimeUnit.SECONDS)), "closing sees newly committed batch and refuses");
                require(originalPeriod.equals(jdbc.queryForList("SELECT * FROM hr_payroll_period WHERE period_id=?", identifier)), "rejected closing preserves entire period");
                require("DRAFT".equals(jdbc.queryForObject("SELECT status FROM hr_payroll_batch WHERE batch_id=?", String.class, batchId)), "created batch remains draft");
                require("SKIPPED".equals(jdbc.queryForObject("SELECT calc_status FROM hr_payroll_batch_employee WHERE batch_id=?", String.class, batchId)), "real missing-compensation precheck retained");
                require("未分配生效薪资结构".equals(jdbc.queryForObject("SELECT error_message FROM hr_payroll_batch_employee WHERE batch_id=?", String.class, batchId)), "unconfigured employee reason explicit");
                require(jdbc.queryForObject("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=? AND business_domain='PAYROLL_BATCH' AND business_id=? AND operation_type='CREATE'", Integer.class, TENANT, batchId.toString()) == 1, "exactly one creation audit");
                batches.cancel(batchId);
                configuration.closePeriod(identifier);
            }
            require("CLOSED".equals(jdbc.queryForObject("SELECT status FROM hr_payroll_period WHERE period_id=?", String.class, identifier)), "owned period closed after cleanup");
            require(jdbc.queryForObject("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=? AND business_domain='PAYROLL_PERIOD' AND business_id=? AND operation_type='CLOSE'", Integer.class, TENANT, Long.toString(identifier)) == 1, "one successful closing audit");
            List<Map<String, Object>> closed = jdbc.queryForList("SELECT * FROM hr_payroll_period WHERE period_id=?", identifier);
            configuration.closePeriod(identifier);
            require(closed.equals(jdbc.queryForList("SELECT * FROM hr_payroll_period WHERE period_id=?", identifier)), "repeat closing preserves row");
        } finally {
            release.countDown(); workers.shutdown();
            require(workers.awaitTermination(30, TimeUnit.SECONDS), "workers ended");
            closingAttempt = null;
        }
    }

    private void paidOptions() {
        long employee = seed(), other = seed(), batch = sequence++, foreignBatch = sequence++, foreignPeriod = sequence++;
        jdbc.update("UPDATE hr_employee SET user_id=993299,dept_id=88 WHERE id=?", employee);
        jdbc.update("INSERT INTO hr_payroll_period(period_id,tenant_id,period_name,start_date,end_date,status) VALUES(?,?,?,'2047-01-01','2047-01-31','OPEN')", foreignPeriod, TENANT + 1, "FOREIGN-OPTIONS");
        jdbc.update("INSERT INTO hr_payroll_batch(batch_id,tenant_id,batch_no,payroll_period_id,status) VALUES(?,?,?,?,?)", batch, TENANT, "OPTIONS-" + batch, employee, "SUBMITTED");
        jdbc.update("INSERT INTO hr_payroll_batch(batch_id,tenant_id,batch_no,payroll_period_id,status) VALUES(?,?,?,?,?)", foreignBatch, TENANT + 1, "OPTIONS-" + foreignBatch, employee, "PAID");
        String snapshot = "[{\"type\":\"TAX_SNAPSHOT\",\"payrollPeriodId\":\"" + employee + "\",\"amount\":\"987654321.12\"}]";
        long batchSlip = optionSlip(TENANT, employee, batch, "PAID", 0, "2047-01", "[]");
        long independent = optionSlip(TENANT, employee, null, "PAID", 0, "2047-01", snapshot);
        optionSlip(TENANT, other, null, "PAID", 0, "2047-01", snapshot);
        optionSlip(TENANT + 1, employee, null, "PAID", 0, "2047-01", snapshot);
        optionSlip(TENANT, employee, null, "PAID", 1, "2047-01", snapshot);
        optionSlip(TENANT, employee, null, "PAID", 0, "2047-02", snapshot);
        for (String status : List.of("DRAFT", "PENDING", "SUBMITTED", "CANCELLED")) optionSlip(TENANT, employee, null, status, 0, "2047-01", snapshot);
        optionSlip(TENANT, employee, null, "PAID", 0, "2047-01", snapshot.replace(Long.toString(employee), Long.toString(other)));
        optionSlip(TENANT, employee, null, "PAID", 0, "2047-01", "[]");
        optionSlip(TENANT, employee, null, "PAID", 0, "2047-01", snapshot.replace(Long.toString(employee), "invalid-period"));
        optionSlip(TENANT, employee, 88998899L, "PAID", 0, "2047-01", snapshot);
        optionSlip(TENANT, employee, foreignBatch, "PAID", 0, "2047-01", snapshot);
        List<Map<String, Object>> beforeSlips = jdbc.queryForList("SELECT * FROM hr_salary_slip ORDER BY id");
        List<Map<String, Object>> beforePeriods = jdbc.queryForList("SELECT * FROM hr_payroll_period ORDER BY period_id");
        List<Map<String, String>> options = batches.paidSalaryOptions(employee, employee);
        require(options.size() == 2, "only own exact-period paid batch and standalone salary selected");
        require(options.get(0).get("salarySlipId").equals(Long.toString(independent)) && options.get(1).get("salarySlipId").equals(Long.toString(batchSlip)), "paid options are unique and ordered with exact string identifiers");
        require(options.stream().allMatch(row -> row.keySet().equals(Set.of("salarySlipId", "periodMonth")) && "2047-01".equals(row.get("periodMonth"))), "paid options expose no salary amounts or other employee fields");
        require(batches.paidSalaryOptions(other, employee).size() == 1, "second employee has only their own paid original");
        require(batches.paidSalaryOptions(employee, other).size() == 1, "same-month separate period uses exact snapshot identity");
        UserContext.setDsType(4);
        require(batches.paidSalaryOptions(employee, employee).equals(options), "self data scope permits matching employee");
        deniedOption(other, employee, "FORBIDDEN");
        UserContext.setDsType(3); UserContext.setDeptId(89L);
        deniedOption(employee, employee, "FORBIDDEN");
        UserContext.setDeptId(88L);
        require(batches.paidSalaryOptions(employee, employee).equals(options), "department scope permits own department");
        UserContext.setDsType(0);
        deniedOption(employee, foreignPeriod, "PERIOD_NOT_FOUND");
        UserContext.setTenantId(TENANT + 1); TenantContext.setTenantId(TENANT + 1);
        deniedOption(employee, employee, "EMPLOYEE_NOT_FOUND");
        actor(); UserContext.setDsType(0);
        require(beforeSlips.equals(jdbc.queryForList("SELECT * FROM hr_salary_slip ORDER BY id")), "option reads preserve all salary columns including missing legacy digests");
        require(beforePeriods.equals(jdbc.queryForList("SELECT * FROM hr_payroll_period ORDER BY period_id")), "option reads preserve all original periods");
        require(jdbc.queryForObject("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=? AND business_domain='SALARY_SLIP' AND operation_type='READ_PAID_OPTIONS'", Integer.class, TENANT) == 5, "successful scoped option reads retain audit records");
        System.out.println("D3_PAID_SALARY_OPTIONS: actual_mysql=true; scoped=true; standalone=true; missing_snapshot_excluded=true; amounts_exposed=false; original_rows_kept=true");
    }

    private long optionSlip(long tenant, long employee, Long batch, String status, int deleted, String month, String components) {
        long id = sequence++;
        jdbc.update("INSERT INTO hr_salary_slip(id,tenant_id,employee_id,batch_id,period_month,status,deleted,components) VALUES(?,?,?,?,?,?,?,?)", id, tenant, employee, batch, month, status, deleted, components);
        return id;
    }

    private void deniedOption(long employee, long period, String code) {
        String actual = null;
        try { batches.paidSalaryOptions(employee, period); }
        catch (HrBusinessException rejected) { actual = rejected.getCode(); }
        require(code.equals(actual), "paid option access denied with expected scope or tenant error");
    }

    private static <T> T construct(Class<T> type, Map<Class<?>, Object> dependencies) throws Exception {
        Constructor<?> constructor = type.getConstructors()[0]; Class<?>[] types = constructor.getParameterTypes();
        Object[] arguments = new Object[types.length];
        for (int index = 0; index < types.length; index++) arguments[index] = dependencies.get(types[index]);
        return type.cast(constructor.newInstance(arguments));
    }
    private static void await(CountDownLatch latch, String label) {
        try { require(latch.await(10, TimeUnit.SECONDS), label); }
        catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new IllegalStateException(label, failure); }
    }
    private static void actor() { UserContext.setTenantId(TENANT); TenantContext.setTenantId(TENANT); UserContext.setUserId(993299L); UserContext.setUserName("create-close-check"); }
    private static void require(boolean condition, String label) { if (!condition) throw new AssertionError(label); CHECKS.incrementAndGet(); }
}
