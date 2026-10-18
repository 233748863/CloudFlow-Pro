package com.cloudflow.hr.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.job.HrRulePrecisionJobs;
import com.cloudflow.hr.mapper.HrAuditLogMapper;
import com.cloudflow.hr.mapper.HrCompChangeMapper;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrPayrollBatchEmployeeMapper;
import com.cloudflow.hr.mapper.HrPayrollBatchMapper;
import com.cloudflow.hr.mapper.HrPayrollPeriodMapper;
import com.cloudflow.hr.mapper.HrSalarySlipMapper;
import com.cloudflow.hr.service.HrAdvancePayrollService;
import com.cloudflow.hr.service.HrCommissionService;
import com.cloudflow.hr.service.HrPayrollBatchService;
import com.cloudflow.hr.service.HrPayrollConfigurationService;
import com.cloudflow.hr.service.HrRuleSupport;
import com.cloudflow.hr.service.HrRuleAsyncExecutor;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.mybatis.spring.SqlSessionTemplate;
import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

/** Production batch service, mappers, MySQL transactions, and Redis locks; completed employee checkpoint fixtures. */
public final class HrPayrollReplayChecks {
    private static final long TENANT = 991917L;
    private static int checks;
    private long sequence = 992800L;
    private final JdbcTemplate jdbc;
    private final HrPayrollBatchService service;
    private final HrRulePrecisionJobs jobs;
    private static final ObjectMapper JSON = new ObjectMapper();
    private Map<String, Object> submittedParameters;
    private Runnable admissionHook;
    private record Sample(long batchId, long periodId, long employeeId, long slipId) {}

    private HrPayrollReplayChecks(HikariDataSource source, RedissonClient redis) throws Exception {
        jdbc = new JdbcTemplate(source);
        MybatisConfiguration mapping = new MybatisConfiguration();
        mapping.setMapUnderscoreToCamelCase(true);
        mapping.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        for (Class<?> mapper : List.of(HrAuditLogMapper.class, HrEmployeeMapper.class, HrEmployeeAdvanceMapper.class, HrCompChangeMapper.class,
                HrPayrollBatchMapper.class, HrPayrollBatchEmployeeMapper.class, HrPayrollPeriodMapper.class, HrSalarySlipMapper.class)) {
            mapping.addMapper(mapper);
        }
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(source); factory.setConfiguration(mapping);
        factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        factory.setMapperLocations(new FileSystemResource("D:/CloudFlowPro/cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrEmployeeAdvanceMapper.xml"),
                new FileSystemResource("D:/CloudFlowPro/cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrAuditLogMapper.xml"));
        SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        HrPayrollBatchMapper batches = sessions.getMapper(HrPayrollBatchMapper.class);
        HrPayrollPeriodMapper periods = sessions.getMapper(HrPayrollPeriodMapper.class);
        HrSalarySlipMapper slips = sessions.getMapper(HrSalarySlipMapper.class);
        HrRuleSupport support = new HrRuleSupport(new DataSourceTransactionManager(source), redis,
                sessions.getMapper(HrEmployeeMapper.class), sessions.getMapper(HrAuditLogMapper.class),
                new ObjectMapper().findAndRegisterModules(), null);
        HrPayrollConfigurationService configuration = new HrPayrollConfigurationService(null, support, periods, batches,
                null, null, null, null, slips, null, null, null);
        HrAdvancePayrollService advance = new HrAdvancePayrollService(sessions.getMapper(HrEmployeeAdvanceMapper.class),
                null, slips, null, support, null, new HrCommissionService(null, sessions.getMapper(HrCompChangeMapper.class),
                    null, sessions.getMapper(HrEmployeeAdvanceMapper.class), slips, null, null, support, new ObjectMapper().findAndRegisterModules()));
        HrRuleAsyncExecutor queue = new HrRuleAsyncExecutor(null, null, null, support, JSON) {
            @Override public String submit(String handler, Object parameters) {
                require("hrPayrollBatchCalculate".equals(handler), "actual batch start submits correct handler");
                submittedParameters = JSON.convertValue(parameters, new TypeReference<Map<String, Object>>() {});
                if (admissionHook != null) admissionHook.run();
                return "owned-admission-fixture";
            }
        };
        service = new HrPayrollBatchService(batches, sessions.getMapper(HrPayrollBatchEmployeeMapper.class), slips,
                periods, configuration, null, support, queue, null, advance);
        jobs = new HrRulePrecisionJobs(null, null, null, service, null, support, JSON);
    }

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2 || !arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_settlement_foundation_[a-f0-9]{32}\\?.*")) {
            throw new IllegalArgumentException("Owned scratch database required");
        }
        String port = System.getenv("HR_SETTLEMENT_TEST_REDIS_PORT");
        String password = System.getenv("HR_SETTLEMENT_TEST_REDIS_PASSWORD");
        if (port == null || !port.matches("[0-9]{4,5}") || password == null || password.isBlank()) throw new IllegalArgumentException("Owned Redis required");
        Config configuration = new Config(); configuration.setThreads(2); configuration.setNettyThreads(2);
        configuration.useSingleServer().setAddress("redis://127.0.0.1:" + port).setPassword(password)
                .setConnectionMinimumIdleSize(1).setConnectionPoolSize(4)
                .setSubscriptionConnectionMinimumIdleSize(1).setSubscriptionConnectionPoolSize(2);
        RedissonClient redis = Redisson.create(configuration);
        try (HikariDataSource source = new HikariDataSource()) {
            source.setJdbcUrl(arguments[0]); source.setUsername("root"); source.setPassword(""); source.setMaximumPoolSize(6);
            JdbcTemplate ownership = new JdbcTemplate(source);
            require(Path.of(arguments[1]).toRealPath().equals(Path.of(Objects.requireNonNull(ownership.queryForObject("SELECT @@datadir", String.class))).toRealPath()), "owned database");
            actor();
            HrPayrollReplayChecks suite = new HrPayrollReplayChecks(source, redis);
            suite.completedReplay();
            suite.unstartedReplay();
            suite.completedEmployeeCheckpoint();
            suite.concurrentCheckpoint();
            suite.foreignTenant();
            suite.delayedPreviousRound();
            suite.invalidExecutionParameters();
            suite.submissionVersion();
            suite.registrationFailureBoundaries();
            System.out.println("D3_PAYROLL_REPLAY: checks=" + checks + "; actual_mysql=true; actual_redis=true; actual_batch_service=true; production_tenant_interceptor=true; checkpoint_fixture=true; fresh_calculation=false; http=false; official_tax_policy=false");
        } finally { redis.shutdown(); UserContext.clear(); TenantContext.clear(); }
    }

    private Sample seed(String status, boolean closed) {
        long identifier = sequence++;
        jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,employee_status,hire_date) VALUES(?,?,?,?,'UNKNOWN','REGULAR','2045-01-01')",
                identifier, TENANT, "REPLAY-" + identifier, "重复执行样本");
        jdbc.update("INSERT INTO hr_payroll_period(period_id,tenant_id,period_name,start_date,end_date,status) VALUES(?,?,?,'2045-01-01','2045-01-31',?)",
                identifier, TENANT, "REPLAY-" + identifier, closed ? "CLOSED" : "OPEN");
        jdbc.update("INSERT INTO hr_payroll_batch(batch_id,tenant_id,batch_no,payroll_period_id,status,version,employee_count,total_gross,total_tax,total_net) VALUES(?,?,?,?,?,1,1,100.01,10.01,90.00)",
                identifier, TENANT, "REPLAY-" + identifier, identifier, status);
        if (!"CANCELLED".equals(status)) {
            jdbc.update("INSERT INTO hr_payroll_batch_employee(batch_employee_id,tenant_id,batch_id,employee_id,salary_slip_id,calc_status,gross_total,net_total) VALUES(?,?,?,?,?,?,100.01,90.00)",
                    identifier, TENANT, identifier, identifier, List.of("FAILED", "DRAFT").contains(status) ? null : identifier,
                    "FAILED".equals(status) ? "FAILED" : "DRAFT".equals(status) ? "PENDING" : "SUCCESS");
        }
        if (!List.of("FAILED", "DRAFT").contains(status)) {
            jdbc.update("INSERT INTO hr_salary_slip(id,tenant_id,employee_id,batch_id,period_month,gross_total,deduction_total,tax_amount,net_total,status,deleted) VALUES(?,?,?,?,'2045-01',100.01,10.01,10.01,90.00,?,?)",
                    identifier, TENANT, identifier, identifier, List.of("PAID", "SUBMITTED").contains(status) ? status : "DRAFT", "CANCELLED".equals(status) ? 1 : 0);
        }
        return new Sample(identifier, identifier, identifier, identifier);
    }

    private List<List<Map<String, Object>>> snapshot(Sample sample) {
        return List.of(jdbc.queryForList("SELECT * FROM hr_payroll_batch WHERE batch_id=?", sample.batchId()),
                jdbc.queryForList("SELECT * FROM hr_payroll_period WHERE period_id=?", sample.periodId()),
                jdbc.queryForList("SELECT * FROM hr_payroll_batch_employee WHERE batch_id=? ORDER BY batch_employee_id", sample.batchId()),
                jdbc.queryForList("SELECT * FROM hr_salary_slip WHERE batch_id=? ORDER BY id", sample.batchId()),
                jdbc.queryForList("SELECT * FROM hr_audit_log WHERE tenant_id=? AND business_domain='PAYROLL_BATCH' AND business_id=? ORDER BY id", TENANT, String.valueOf(sample.batchId())));
    }

    private void completedReplay() {
        for (String state : List.of("CALCULATED", "SUBMITTED", "PAID", "CANCELLED", "FAILED")) {
            for (boolean closed : List.of(false, true)) {
                Sample sample = seed(state, closed);
                List<List<Map<String, Object>>> before = snapshot(sample);
                for (boolean retry : List.of(false, true)) {
                    String rejection = null; Integer affected = null;
                    try { affected = execute(sample, retry, 1); }
                    catch (HrBusinessException rejected) { rejection = rejected.getCode(); }
                    String actual = jdbc.queryForObject("SELECT status FROM hr_payroll_batch WHERE batch_id=?", String.class, sample.batchId());
                    require(before.equals(snapshot(sample)), "terminal replay preserves " + state + "; actual=" + actual);
                    require(rejection == null && Objects.equals(affected, 0), "completed replay returns zero");
                }
            }
        }
    }

    private void unstartedReplay() {
        Sample sample = seed("DRAFT", false);
        List<List<Map<String, Object>>> before = snapshot(sample);
        String code = null;
        try { execute(sample, false, 1); } catch (HrBusinessException rejected) { code = rejected.getCode(); }
        require("INVALID_PAYROLL_STATE".equals(code), "unstarted batch cannot enter execution");
        require(before.equals(snapshot(sample)), "rejected unstarted execution preserves all rows");
    }

    private void completedEmployeeCheckpoint() {
        Sample sample = seed("CALCULATING", false);
        List<Map<String, Object>> salary = jdbc.queryForList("SELECT * FROM hr_salary_slip WHERE id=?", sample.slipId());
        require(execute(sample, false, 1) == 0, "completed employee is not regenerated");
        assertCheckpoint(sample, salary);
        List<List<Map<String, Object>>> complete = snapshot(sample);
        require(execute(sample, false, 1) == 0, "checkpoint completion replay returns zero");
        require(complete.equals(snapshot(sample)), "checkpoint replay preserves all rows and audit");
    }

    private void concurrentCheckpoint() throws Exception {
        Sample sample = seed("CALCULATING", false);
        List<Map<String, Object>> salary = jdbc.queryForList("SELECT * FROM hr_salary_slip WHERE id=?", sample.slipId());
        ExecutorService workers = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2), start = new CountDownLatch(1);
        List<Future<Integer>> futures = new ArrayList<>();
        try {
            for (int index = 0; index < 2; index++) {
                futures.add(workers.submit(() -> {
                    actor(); ready.countDown();
                    try { if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("Start gate timed out"); return execute(sample, false, 1); }
                    finally { UserContext.clear(); TenantContext.clear(); }
                }));
            }
            require(ready.await(10, TimeUnit.SECONDS), "both execution requests ready");
            start.countDown();
            for (Future<Integer> result : futures) require(result.get(20, TimeUnit.SECONDS) == 0, "concurrent completed employee not regenerated");
            assertCheckpoint(sample, salary);
        } finally { start.countDown(); workers.shutdownNow(); require(workers.awaitTermination(10, TimeUnit.SECONDS), "owned worker threads stopped"); }
    }

    private void assertCheckpoint(Sample sample, List<Map<String, Object>> salary) {
        require("CALCULATED".equals(jdbc.queryForObject("SELECT status FROM hr_payroll_batch WHERE batch_id=?", String.class, sample.batchId())), "checkpoint finalized");
        require(salary.equals(jdbc.queryForList("SELECT * FROM hr_salary_slip WHERE id=?", sample.slipId())), "same salary id and all fields");
        require(new BigDecimal("100.01").compareTo(jdbc.queryForObject("SELECT total_gross FROM hr_payroll_batch WHERE batch_id=?", BigDecimal.class, sample.batchId())) == 0, "exact gross aggregate");
        require(new BigDecimal("90.00").compareTo(jdbc.queryForObject("SELECT total_net FROM hr_payroll_batch WHERE batch_id=?", BigDecimal.class, sample.batchId())) == 0, "exact net aggregate");
        require(Long.valueOf(1).equals(jdbc.queryForObject("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=? AND business_domain='PAYROLL_BATCH' AND business_id=? AND operation_type='CALCULATED'", Long.class, TENANT, String.valueOf(sample.batchId()))), "exactly one completion audit");
    }

    private void foreignTenant() {
        Sample sample = seed("CALCULATED", false);
        List<List<Map<String, Object>>> before = snapshot(sample); String code = null;
        try {
            UserContext.setTenantId(TENANT + 1); TenantContext.setTenantId(TENANT + 1);
            try { execute(sample, false, 1); } catch (HrBusinessException rejected) { code = rejected.getCode(); }
        } finally { actor(); }
        require("BATCH_NOT_FOUND".equals(code), "foreign tenant cannot replay batch");
        require(before.equals(snapshot(sample)), "foreign replay preserves all rows");
    }

    private int execute(Sample sample, boolean retry, int version) {
        try {
            return jobs.payrollBatchCalculate(JSON.writeValueAsString(Map.of("batchId", sample.batchId(), "retry", retry, "batchVersion", version)));
        } catch (java.io.IOException failure) { throw new AssertionError("Fixture JSON failed", failure); }
    }

    private void delayedPreviousRound() {
        Sample sample = seed("FAILED", false);
        jdbc.update("UPDATE hr_payroll_batch SET status='CALCULATING',version=2,total_gross=0,total_tax=0,total_net=0 WHERE batch_id=?", sample.batchId());
        jdbc.update("UPDATE hr_payroll_period SET status='CALCULATING' WHERE period_id=?", sample.periodId());
        List<List<Map<String, Object>>> before = snapshot(sample);
        require(execute(sample, false, 1) == 0, "previous normal execution is ignored during retry");
        String actual = jdbc.queryForObject("SELECT status FROM hr_payroll_batch WHERE batch_id=?", String.class, sample.batchId());
        require(before.equals(snapshot(sample)), "delayed previous round preserves active retry; actual=" + actual);
        require(execute(sample, true, 1) == 0, "previous retry execution is ignored during a later retry");
        require(before.equals(snapshot(sample)), "previous retry preserves current execution and audit");
        Sample checkpoint = seed("CALCULATING", false);
        jdbc.update("UPDATE hr_payroll_batch SET version=2 WHERE batch_id=?", checkpoint.batchId());
        List<Map<String, Object>> salary = jdbc.queryForList("SELECT * FROM hr_salary_slip WHERE id=?", checkpoint.slipId());
        require(execute(checkpoint, true, 2) == 0, "current round can finish its completed checkpoint");
        assertCheckpoint(checkpoint, salary);
    }

    private void invalidExecutionParameters() {
        Sample sample = seed("CALCULATING", false);
        List<List<Map<String, Object>>> before = snapshot(sample);
        for (Object version : List.of(-1, "1", new BigDecimal("1.5"), new BigDecimal("2147483648"), new BigDecimal("18446744073709551617"))) {
            rejectPayload(Map.of("batchId", sample.batchId(), "retry", false, "batchVersion", version));
            require(before.equals(snapshot(sample)), "invalid version cannot change any payroll row");
        }
        rejectPayload(Map.of("batchId", sample.batchId(), "retry", false));
        rejectPayload(Map.of("batchId", sample.batchId(), "batchVersion", 1));
        rejectPayload(Map.of("batchId", new BigDecimal("18446744073709551617"), "retry", false, "batchVersion", 1));
        require(before.equals(snapshot(sample)), "missing or oversized execution identity preserves all rows");
    }

    private void rejectPayload(Map<String, Object> payload) {
        String code = null;
        try { jobs.payrollBatchCalculate(JSON.writeValueAsString(payload)); }
        catch (HrBusinessException rejected) { code = rejected.getCode(); }
        catch (java.io.IOException failure) { throw new AssertionError("Fixture JSON failed", failure); }
        require("INVALID_JOB_PARAMETER".equals(code), "invalid execution identity rejected");
    }

    private void submissionVersion() {
        for (boolean retry : List.of(false, true)) {
            Sample sample = seed(retry ? "FAILED" : "DRAFT", false);
            require("owned-admission-fixture".equals(service.start(sample.batchId(), retry)), "actual start uses owned admission fixture");
            Integer stored = jdbc.queryForObject("SELECT version FROM hr_payroll_batch WHERE batch_id=?", Integer.class, sample.batchId());
            require(Objects.equals(stored, 2) && Objects.equals(submittedParameters.get("batchVersion"), stored), "submitted version equals committed optimistic version");
            require(submittedParameters.get("batchId") instanceof Number identifier && identifier.longValue() == sample.batchId()
                    && Objects.equals(submittedParameters.get("retry"), retry), "submitted batch and retry identities exact");
            require("CALCULATING".equals(jdbc.queryForObject("SELECT status FROM hr_payroll_batch WHERE batch_id=?", String.class, sample.batchId())), "admitted round remains calculating");
            List<List<Map<String, Object>>> before = snapshot(sample);
            require(execute(sample, !retry, 1) == 0, "previous task cannot enter newly admitted round");
            require(before.equals(snapshot(sample)), "previous task preserves actual newly admitted round");
        }
    }

    private void registrationFailureBoundaries() {
        Sample rejected = seed("DRAFT", false);
        admissionHook = () -> { throw new HrBusinessException("JOB_REGISTRATION_FAILED", "owned rejected admission"); };
        try { service.start(rejected.batchId(), false); throw new AssertionError("Admission should reject"); }
        catch (HrBusinessException failure) { require("JOB_REGISTRATION_FAILED".equals(failure.getCode()), "registration rejection reported"); }
        finally { admissionHook = null; }
        require("DRAFT".equals(jdbc.queryForObject("SELECT status FROM hr_payroll_batch WHERE batch_id=?", String.class, rejected.batchId())), "same rejected round restores original state");
        require("OPEN".equals(jdbc.queryForObject("SELECT status FROM hr_payroll_period WHERE period_id=?", String.class, rejected.periodId())), "same rejected round restores open period");
        Sample later = seed("FAILED", false);
        admissionHook = () -> {
            jdbc.update("UPDATE hr_payroll_batch SET version=version+1,status='CALCULATING' WHERE batch_id=?", later.batchId());
            throw new HrBusinessException("JOB_REGISTRATION_FAILED", "owned delayed rejection");
        };
        try { service.start(later.batchId(), true); throw new AssertionError("Delayed admission should reject"); }
        catch (HrBusinessException failure) { require("JOB_REGISTRATION_FAILED".equals(failure.getCode()), "delayed registration rejection reported"); }
        finally { admissionHook = null; }
        require("CALCULATING".equals(jdbc.queryForObject("SELECT status FROM hr_payroll_batch WHERE batch_id=?", String.class, later.batchId())), "old registration failure cannot roll back later execution");
        require(Integer.valueOf(3).equals(jdbc.queryForObject("SELECT version FROM hr_payroll_batch WHERE batch_id=?", Integer.class, later.batchId())), "later execution version unchanged");
    }

    private static void actor() { UserContext.setTenantId(TENANT); TenantContext.setTenantId(TENANT); UserContext.setUserId(992799L); UserContext.setUserName("payroll-replay-check"); }
    private static void require(boolean value, String label) { if (!value) throw new AssertionError(label); checks++; }
}
