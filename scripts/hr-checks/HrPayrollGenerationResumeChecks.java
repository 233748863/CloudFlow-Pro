package com.cloudflow.hr.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.entity.HrPayrollPeriod;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrAdvanceRepaymentMapper;
import com.cloudflow.hr.mapper.HrAuditLogMapper;
import com.cloudflow.hr.mapper.HrCompChangeMapper;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrHMapper;
import com.cloudflow.hr.mapper.HrPayrollBatchMapper;
import com.cloudflow.hr.mapper.HrPayrollCorrectionMapper;
import com.cloudflow.hr.mapper.HrPayrollPeriodMapper;
import com.cloudflow.hr.mapper.HrSalarySlipMapper;
import com.cloudflow.hr.service.HrAdvancePayrollService;
import com.cloudflow.hr.service.HrCommissionService;
import com.cloudflow.hr.service.HrHException;
import com.cloudflow.hr.service.HrPayrollCalculationService;
import com.cloudflow.hr.service.HrPayrollConfigurationService;
import com.cloudflow.hr.service.HrRuleSupport;
import com.cloudflow.hr.service.impl.HrEssServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.lang.reflect.Constructor;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.mybatis.spring.SqlSessionTemplate;
import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

/** Real generation, persistence, transaction and locks; only preview amounts and overlap timing are controlled. */
public final class HrPayrollGenerationResumeChecks {
    private static final long TENANT = 991918L;
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static final AtomicInteger CHECKS = new AtomicInteger();
    private final JdbcTemplate jdbc;
    private final HrPayrollPeriodMapper periods;
    private final HrRuleSupport transactions;
    private final PreviewFixture service;
    private long sequence = 993100L;
    private final ThreadLocal<Boolean> secondWorker = ThreadLocal.withInitial(() -> false);
    private volatile CountDownLatch secondLockAttempt;
    private record Sample(long employee, long batch, HrPayrollPeriod period) {}

    private HrPayrollGenerationResumeChecks(HikariDataSource source, RedissonClient redis) throws Exception {
        jdbc = new JdbcTemplate(source);
        MybatisConfiguration mapping = new MybatisConfiguration();
        mapping.setMapUnderscoreToCamelCase(true);
        mapping.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        for (Class<?> mapper : List.of(HrEmployeeMapper.class, HrAuditLogMapper.class, HrEmployeeAdvanceMapper.class, HrCompChangeMapper.class,
                HrAdvanceRepaymentMapper.class, HrSalarySlipMapper.class, HrPayrollBatchMapper.class,
                HrPayrollPeriodMapper.class, HrPayrollCorrectionMapper.class, HrHMapper.class)) mapping.addMapper(mapper);
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(source); factory.setConfiguration(mapping);
        factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        factory.setMapperLocations(new FileSystemResource("D:/CloudFlowPro/cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrEmployeeAdvanceMapper.xml"),
                new FileSystemResource("D:/CloudFlowPro/cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrAuditLogMapper.xml"),
                new FileSystemResource("D:/CloudFlowPro/cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrHMapper.xml"));
        SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        HrSalarySlipMapper salaries = sessions.getMapper(HrSalarySlipMapper.class);
        HrPayrollBatchMapper batches = sessions.getMapper(HrPayrollBatchMapper.class);
        periods = sessions.getMapper(HrPayrollPeriodMapper.class);
        HrRuleSupport support = new HrRuleSupport(new DataSourceTransactionManager(source), redis,
                sessions.getMapper(HrEmployeeMapper.class), sessions.getMapper(HrAuditLogMapper.class), JSON, null) {
            @Override public <T> T locked(String resource, Supplier<T> action) {
                if (Boolean.TRUE.equals(secondWorker.get()) && "attendance-config".equals(resource) && secondLockAttempt != null) secondLockAttempt.countDown();
                return super.locked(resource, action);
            }
        };
        HrPayrollConfigurationService configuration = new HrPayrollConfigurationService(null, support, periods, batches,
                null, null, null, null, salaries, null, null, sessions.getMapper(HrHMapper.class));
        transactions = support;
        HrCommissionService commissions = new HrCommissionService(null, sessions.getMapper(HrCompChangeMapper.class), null,
                sessions.getMapper(HrEmployeeAdvanceMapper.class), salaries, null, null, support, JSON);
        HrAdvancePayrollService advances = new HrAdvancePayrollService(sessions.getMapper(HrEmployeeAdvanceMapper.class),
                sessions.getMapper(HrAdvanceRepaymentMapper.class), salaries, null, support, null, commissions);
        Map<Class<?>, Object> dependencies = Map.of(HrRuleSupport.class, support, HrPayrollConfigurationService.class, configuration,
                HrSalarySlipMapper.class, salaries, HrPayrollBatchMapper.class, batches, HrPayrollCorrectionMapper.class,
                sessions.getMapper(HrPayrollCorrectionMapper.class), HrHMapper.class, sessions.getMapper(HrHMapper.class),
                HrAdvancePayrollService.class, advances, HrCommissionService.class, commissions);
        Constructor<?> constructor = HrPayrollCalculationService.class.getConstructors()[0];
        Class<?>[] types = constructor.getParameterTypes();
        Object[] arguments = new Object[types.length];
        for (int index = 0; index < types.length; index++) arguments[index] = dependencies.get(types[index]);
        HrPayrollCalculationService calculation = (HrPayrollCalculationService) constructor.newInstance(arguments);
        service = new PreviewFixture(salaries, support, calculation, configuration, periods, advances);
    }

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2 || !arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_settlement_foundation_[a-f0-9]{32}\\?.*")) throw new IllegalArgumentException("Owned scratch database required");
        String port = System.getenv("HR_SETTLEMENT_TEST_REDIS_PORT");
        String password = System.getenv("HR_SETTLEMENT_TEST_REDIS_PASSWORD");
        if (port == null || !port.matches("[0-9]{4,5}") || password == null || password.isBlank()) throw new IllegalArgumentException("Owned Redis required");
        Config configuration = new Config(); configuration.setThreads(2); configuration.setNettyThreads(2);
        configuration.useSingleServer().setAddress("redis://127.0.0.1:" + port).setPassword(password)
                .setConnectionMinimumIdleSize(1).setConnectionPoolSize(4).setSubscriptionConnectionMinimumIdleSize(1).setSubscriptionConnectionPoolSize(2);
        RedissonClient redis = Redisson.create(configuration);
        try (HikariDataSource source = new HikariDataSource()) {
            source.setJdbcUrl(arguments[0]); source.setUsername("root"); source.setPassword(""); source.setMaximumPoolSize(6);
            JdbcTemplate ownership = new JdbcTemplate(source);
            require(Path.of(arguments[1]).toRealPath().equals(Path.of(Objects.requireNonNull(ownership.queryForObject("SELECT @@datadir", String.class))).toRealPath()), "owned database");
            actor();
            HrPayrollGenerationResumeChecks suite = new HrPayrollGenerationResumeChecks(source, redis);
            suite.resumeCommittedDraft();
            suite.failedWriteRollback(false);
            suite.failedWriteRollback(true);
            suite.interruptedOuterTransaction(false);
            suite.interruptedOuterTransaction(true);
            suite.finalSalaryProtection();
            suite.closedPeriodProtection();
            suite.competingBatch();
            suite.foreignTenant();
            suite.concurrentGeneration();
            System.out.println("D3_PAYROLL_GENERATION_RESUME: checks=" + CHECKS.get() + "; actual_mysql=true; actual_redis=true; actual_generation=true; actual_reservation=true; controlled_preview=true; controlled_overlap=true; http=false; official_tax_policy=false");
        } finally { redis.shutdown(); UserContext.clear(); TenantContext.clear(); }
    }

    private Sample seed() {
        long identifier = sequence++;
        jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,employee_status,hire_date) VALUES(?,?,?,?,'UNKNOWN','REGULAR','2046-01-01')", identifier, TENANT, "RESUME-" + identifier, "工资接续样本");
        jdbc.update("INSERT INTO hr_payroll_period(period_id,tenant_id,period_name,start_date,end_date,status) VALUES(?,?,?,'2046-01-01','2046-01-31','OPEN')", identifier, TENANT, "RESUME-" + identifier);
        jdbc.update("INSERT INTO hr_payroll_batch(batch_id,tenant_id,batch_no,payroll_period_id,status,employee_count,version) VALUES(?,?,?,?,'CALCULATING',1,1)", identifier, TENANT, "RESUME-" + identifier, identifier);
        jdbc.update("INSERT INTO hr_payroll_batch_employee(batch_employee_id,tenant_id,batch_id,employee_id,calc_status) VALUES(?,?,?,?,'PENDING')", identifier, TENANT, identifier, identifier);
        return new Sample(identifier, identifier, periods.selectById(identifier));
    }

    private Long generate(Sample sample) { return service.generateSalarySlipForBatch(sample.employee(), sample.period(), sample.batch(), false); }

    private List<Map<String, Object>> salaries(Sample sample) {
        return jdbc.queryForList("SELECT * FROM hr_salary_slip WHERE tenant_id=? AND employee_id=? ORDER BY id", TENANT, sample.employee());
    }

    private List<List<Map<String, Object>>> snapshot(Sample sample) {
        return List.of(salaries(sample),
                jdbc.queryForList("SELECT * FROM hr_payroll_batch WHERE tenant_id=? AND batch_id=? ORDER BY batch_id", TENANT, sample.batch()),
                jdbc.queryForList("SELECT * FROM hr_payroll_batch_employee WHERE tenant_id=? AND batch_id=? ORDER BY batch_employee_id", TENANT, sample.batch()),
                jdbc.queryForList("SELECT * FROM hr_payroll_period WHERE tenant_id=? AND period_id=?", TENANT, sample.period().getPeriodId()),
                jdbc.queryForList("SELECT * FROM hr_advance_repayment WHERE tenant_id=? ORDER BY repayment_id", TENANT),
                jdbc.queryForList("SELECT * FROM hr_audit_log WHERE tenant_id=? ORDER BY id", TENANT));
    }

    private void assertSalary(Sample sample, Long identifier, String gross) {
        List<Map<String, Object>> rows = salaries(sample);
        require(rows.size() == 1, "exactly one employee salary including deleted rows");
        Map<String, Object> row = rows.get(0);
        require(identifier.equals(((Number) row.get("id")).longValue()), "original salary identifier preserved");
        require(new BigDecimal(gross).compareTo((BigDecimal) row.get("gross_total")) == 0, "exact gross retained");
        require(new BigDecimal(gross).subtract(new BigDecimal("10.01")).compareTo((BigDecimal) row.get("net_total")) == 0, "exact net retained");
        require(new BigDecimal("10.01").compareTo((BigDecimal) row.get("deduction_total")) == 0, "deduction not duplicated");
        require("DRAFT".equals(row.get("status")), "resumed salary remains draft");
        require(jdbc.queryForObject("SELECT COUNT(*) FROM hr_advance_repayment WHERE tenant_id=?", Integer.class, TENANT) == 0, "no fictitious loan reservations");
        require(jdbc.queryForObject("SELECT JSON_LENGTH(components) FROM hr_salary_slip WHERE id=?", Integer.class, identifier) == 1, "component not appended on repeat");
    }

    private void resumeCommittedDraft() {
        Sample sample = seed();
        Long identifier = generate(sample);
        assertSalary(sample, identifier, "100.03");
        require(jdbc.queryForObject("SELECT salary_slip_id FROM hr_payroll_batch_employee WHERE batch_id=?", Long.class, sample.batch()) == null, "committed generation before employee checkpoint");
        int version = jdbc.queryForObject("SELECT version FROM hr_salary_slip WHERE id=?", Integer.class, identifier);
        service.gross = "110.07";
        require(identifier.equals(generate(sample)), "interrupted checkpoint resumes original salary");
        assertSalary(sample, identifier, "110.07");
        require(jdbc.queryForObject("SELECT version FROM hr_salary_slip WHERE id=?", Integer.class, identifier) > version, "recalculation persisted with version change");
        require(identifier.equals(generate(sample)), "second repeat retains identifier");
        assertSalary(sample, identifier, "110.07");
        service.gross = "100.03";
    }

    private void failedWriteRollback(boolean existing) {
        Sample sample = seed();
        Long identifier = existing ? generate(sample) : null;
        List<List<Map<String, Object>>> before = snapshot(sample);
        service.invalidTotal = true;
        expect("ADVANCE_PAYROLL_TOTAL_MISMATCH", () -> generate(sample));
        service.invalidTotal = false;
        require(before.equals(snapshot(sample)), "post-write rejection rolls back salary and related rows: existing=" + existing);
        Long resumed = generate(sample);
        if (existing) require(identifier.equals(resumed), "failed recalculation retry retains identifier");
        assertSalary(sample, resumed, "100.03");
    }

    private void interruptedOuterTransaction(boolean existing) {
        Sample sample = seed();
        Long identifier = existing ? generate(sample) : null;
        List<List<Map<String, Object>>> before = snapshot(sample);
        service.gross = "110.07";
        String observed = null;
        try {
            transactions.transaction(() -> {
                Long generated = generate(sample);
                require(generated != null, "generation finished before outer checkpoint interruption");
                assertSalary(sample, generated, "110.07");
                throw new HrBusinessException("OWNED_CHECKPOINT_INTERRUPTION", "受控员工检查点中断");
            });
        } catch (HrBusinessException failure) { observed = failure.getCode(); }
        finally { service.gross = "100.03"; }
        require("OWNED_CHECKPOINT_INTERRUPTION".equals(observed), "controlled interruption propagates from outer transaction");
        require(before.equals(snapshot(sample)), "outer interruption rolls back all employee generation writes: existing=" + existing);
        Long resumed = generate(sample);
        if (existing) require(identifier.equals(resumed), "outer interruption retry retains preexisting identifier");
        assertSalary(sample, resumed, "100.03");
    }

    private void finalSalaryProtection() {
        for (String state : List.of("SUBMITTED", "PAID", "CONFIRMED", "CANCELLED", "DRAFT")) {
            Sample sample = seed();
            Long identifier = generate(sample);
            jdbc.update("UPDATE hr_salary_slip SET status=?,employee_confirmed=?,digest_sha256='immutable-checkpoint' WHERE id=?", state, "DRAFT".equals(state), identifier);
            List<List<Map<String, Object>>> before = snapshot(sample);
            expect("SALARY_SLIP_FINAL", () -> generate(sample));
            require(before.equals(snapshot(sample)), "final salary all fields preserved: " + state);
        }
    }

    private void closedPeriodProtection() {
        Sample sample = seed();
        Long identifier = generate(sample);
        jdbc.update("UPDATE hr_payroll_period SET status='CLOSED',version=version+1 WHERE period_id=?", sample.period().getPeriodId());
        require("OPEN".equals(sample.period().getStatus()), "caller holds stale open period");
        List<List<Map<String, Object>>> before = snapshot(sample);
        expect("PAYROLL_PERIOD_CLOSED", () -> generate(sample));
        require(before.equals(snapshot(sample)), "closed database period overrides stale caller object");
        require(identifier.equals(((Number) salaries(sample).get(0).get("id")).longValue()), "closed period retains original identifier");
    }

    private void competingBatch() {
        Sample sample = seed();
        generate(sample);
        long other = sequence++;
        jdbc.update("INSERT INTO hr_payroll_batch(batch_id,tenant_id,batch_no,payroll_period_id,status,employee_count,version) VALUES(?,?,?,?,'CALCULATING',1,1)", other, TENANT, "RESUME-" + other, sample.period().getPeriodId());
        List<List<Map<String, Object>>> before = snapshot(sample);
        List<Map<String, Object>> otherBefore = jdbc.queryForList("SELECT * FROM hr_payroll_batch WHERE batch_id=?", other);
        expect("PAYROLL_ALREADY_CALCULATED", () -> service.generateSalarySlipForBatch(sample.employee(), sample.period(), other, false));
        require(before.equals(snapshot(sample)), "competing batch cannot take over existing salary");
        require(otherBefore.equals(jdbc.queryForList("SELECT * FROM hr_payroll_batch WHERE batch_id=?", other)), "rejected competitor unchanged");
    }

    private void foreignTenant() {
        Sample sample = seed();
        generate(sample);
        List<List<Map<String, Object>>> before = snapshot(sample);
        UserContext.setTenantId(TENANT + 1); TenantContext.setTenantId(TENANT + 1);
        try { expect("ADVANCE_EMPLOYEE_MISSING", () -> generate(sample)); }
        finally { actor(); }
        require(before.equals(snapshot(sample)), "foreign tenant cannot regenerate original employee");
        require(jdbc.queryForObject("SELECT COUNT(*) FROM hr_salary_slip WHERE tenant_id=?", Integer.class, TENANT + 1) == 0, "foreign request creates no salary");
    }

    private void concurrentGeneration() throws Exception {
        Sample sample = seed();
        ExecutorService workers = Executors.newFixedThreadPool(2);
        CountDownLatch firstInside = new CountDownLatch(1), release = new CountDownLatch(1);
        secondLockAttempt = new CountDownLatch(1);
        AtomicBoolean first = new AtomicBoolean(true);
        service.previewHook = () -> {
            if (first.compareAndSet(true, false)) {
                firstInside.countDown();
                await(release, "release first generation");
            }
        };
        try {
            Future<Long> earlier = workers.submit(() -> {
                actor();
                try { return generate(sample); }
                finally { UserContext.clear(); TenantContext.clear(); }
            });
            await(firstInside, "first generation holds real locks");
            Future<Long> later = workers.submit(() -> {
                actor(); secondWorker.set(true);
                try { return generate(sample); }
                finally { secondWorker.remove(); UserContext.clear(); TenantContext.clear(); }
            });
            await(secondLockAttempt, "second generation enters actual lock method while first held");
            require(!earlier.isDone() && !later.isDone(), "both generation calls overlap before first commit");
            release.countDown();
            Long firstId = earlier.get(20, TimeUnit.SECONDS), secondId = later.get(20, TimeUnit.SECONDS);
            require(firstId.equals(secondId), "overlapping generation reuses committed identifier");
            assertSalary(sample, firstId, "100.03");
        } finally {
            release.countDown(); workers.shutdown();
            require(workers.awaitTermination(30, TimeUnit.SECONDS), "generation workers ended");
            service.previewHook = null; secondLockAttempt = null;
        }
    }

    private static final class PreviewFixture extends HrEssServiceImpl {
        private volatile String gross = "100.03";
        private volatile boolean invalidTotal;
        private volatile Runnable previewHook;

        PreviewFixture(HrSalarySlipMapper salaries, HrRuleSupport support, HrPayrollCalculationService calculation,
                HrPayrollConfigurationService configuration, HrPayrollPeriodMapper periods, HrAdvancePayrollService advances) {
            super(null, null, null, salaries, null, null, null, null, null, null, null, null,
                    null, null, null, null, null, null, JSON, support, calculation, configuration, periods, advances);
        }

        @Override public HrSalarySlip previewSalarySlip(Long employee, HrPayrollPeriod period, boolean deductUnverified) {
            if (previewHook != null) previewHook.run();
            HrSalarySlip salary = new HrSalarySlip();
            salary.setTenantId(TENANT); salary.setEmployeeId(employee); salary.setPeriodMonth(YearMonth.from(period.getEndDate()).toString());
            salary.setGrossTotal(new BigDecimal(gross)); salary.setDeductionTotal(new BigDecimal("10.01"));
            salary.setNetTotal(invalidTotal ? new BigDecimal("999.99") : new BigDecimal(gross).subtract(new BigDecimal("10.01")));
            salary.setTaxAmount(new BigDecimal("10.01")); salary.setCurrentTax(new BigDecimal("10.01")); salary.setBenefitAmount(BigDecimal.ZERO);
            salary.setComponents(List.of(Map.of("name", "受控工资计算结果", "type", "EARNING", "amount", gross)));
            salary.setStatus("DRAFT"); salary.setEmployeeConfirmed(false); salary.setDeleted(0); salary.setVersion(0);
            salary.setPayDate(LocalDate.of(2046, 1, 31)); salary.setCreateTime(LocalDateTime.of(2046, 1, 31, 12, 0));
            salary.setUpdateTime(LocalDateTime.of(2046, 1, 31, 12, 0));
            return salary;
        }
    }

    private static void expect(String code, Runnable action) {
        String observed = null;
        try { action.run(); }
        catch (HrBusinessException failure) { observed = failure.getCode(); }
        catch (HrHException failure) { observed = failure.getCode(); }
        require(code.equals(observed), "expected rejection " + code + "; actual=" + observed);
    }
    private static void await(CountDownLatch latch, String label) {
        try { require(latch.await(10, TimeUnit.SECONDS), label); }
        catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new IllegalStateException(label, failure); }
    }
    private static void actor() { UserContext.setTenantId(TENANT); TenantContext.setTenantId(TENANT); UserContext.setUserId(993099L); UserContext.setUserName("generation-resume-check"); }
    private static void require(boolean condition, String label) { if (!condition) throw new AssertionError(label); CHECKS.incrementAndGet(); }
}
