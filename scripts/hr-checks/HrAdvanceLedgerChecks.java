package com.cloudflow.hr.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.HrAdvanceRequests;
import com.cloudflow.hr.domain.entity.HrAdvanceRepayment;
import com.cloudflow.hr.domain.entity.HrEmployeeAdvance;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.mapper.HrAdvanceRepaymentMapper;
import com.cloudflow.hr.mapper.HrAuditLogMapper;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.cloudflow.hr.mapper.HrSalarySlipMapper;
import com.cloudflow.hr.service.HrAdvanceLedgerService;
import com.cloudflow.hr.service.HrAdvancePayrollPolicy;
import com.cloudflow.hr.service.HrAdvancePayrollService;
import com.cloudflow.hr.service.HrCommissionService;
import com.cloudflow.hr.service.HrHException;
import com.cloudflow.hr.service.HrRuleSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.apache.ibatis.session.LocalCacheScope;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

public final class HrAdvanceLedgerChecks {
    private static int checks;
    private static int raceGroups;
    private static final Long TENANT = 100000L;
    private static final Long EMPLOYEE = 9100701L;
    private static final Long OTHER_EMPLOYEE = 9100702L;
    private static final LocalDate PAID_DATE = LocalDate.of(2026, 9, 25);
    private final JdbcTemplate jdbc;
    private final HrEmployeeAdvanceMapper advances;
    private final HrAdvanceRepaymentMapper repayments;
    private final HrAdvanceLedgerService ledger;
    private final HrAdvancePayrollService payroll;
    private final HrSalarySlipMapper salaries;
    private final HrRuleSupport support;
    private final ObjectMapper json = new ObjectMapper().registerModule(new JavaTimeModule());
    private long nextSalaryId = 9200700L;
    private long nextEmployeeId = 9100710L;

    private HrAdvanceLedgerChecks(String[] arguments) throws Exception {
        check(arguments.length == 3 && arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]{4,5}/cloud_flow_db\\?.*"), "仅接受自有回环数据库");
        Path expected = Path.of(arguments[1]).toRealPath();
        check(expected.toString().matches("(?i)D:.*hr-advance-ledger[/\\\\][a-f0-9]{32}[/\\\\]data"), "数据库必须位于D盘本次独立目录");
        DriverManagerDataSource dataSource = new DriverManagerDataSource(arguments[0], "root", "");
        jdbc = new JdbcTemplate(dataSource);
        check(expected.equals(Path.of(Objects.requireNonNull(jdbc.queryForObject("SELECT @@datadir", String.class))).toRealPath()), "核对真实数据目录");
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setCacheEnabled(false);
        configuration.setLocalCacheScope(LocalCacheScope.SESSION);
        configuration.setDefaultStatementTimeout(15);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig();
        global.setBanner(false);
        global.setDbConfig(new GlobalConfig.DbConfig());
        global.getDbConfig().setLogicDeleteField("deleted");
        global.setMetaObjectHandler(new MyMetaObjectHandler());
        GlobalConfigUtils.setGlobalConfig(configuration, global);
        configuration.addMapper(HrEmployeeAdvanceMapper.class);
        configuration.addMapper(HrAdvanceRepaymentMapper.class);
        configuration.addMapper(HrAuditLogMapper.class);
        configuration.addMapper(HrSalarySlipMapper.class);
        configuration.addMapper(com.cloudflow.hr.mapper.HrCompChangeMapper.class);
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setConfiguration(configuration);
        factory.setGlobalConfig(global);
        factory.setDataSource(dataSource);
        factory.setMapperLocations(new Resource[] {
                new FileSystemResource(Path.of(arguments[2], "src/main/resources/mapper/HrEmployeeAdvanceMapper.xml")),
                new FileSystemResource(Path.of(arguments[2], "src/main/resources/mapper/HrAuditLogMapper.xml"))
        });
        factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        SqlSessionTemplate session = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        advances = session.getMapper(HrEmployeeAdvanceMapper.class);
        repayments = session.getMapper(HrAdvanceRepaymentMapper.class);
        salaries = session.getMapper(HrSalarySlipMapper.class);
        support = new HrRuleSupport(new DataSourceTransactionManager(dataSource), null, null,
                session.getMapper(HrAuditLogMapper.class), new ObjectMapper().registerModule(new JavaTimeModule()), null);
        ledger = new HrAdvanceLedgerService(advances, repayments, support);
        com.cloudflow.hr.service.HrReferralBonusService bonuses = new com.cloudflow.hr.service.HrReferralBonusService(null,
                session.getMapper(com.cloudflow.hr.mapper.HrCompChangeMapper.class), null, null, null, null, support, null, null);
        HrCommissionService commissions = new HrCommissionService(null,
                session.getMapper(com.cloudflow.hr.mapper.HrCompChangeMapper.class), null, advances, salaries, null, null, support, json);
        payroll = new HrAdvancePayrollService(advances, repayments, salaries, ledger, support, bonuses, commissions);
    }

    public static void main(String[] arguments) throws Exception {
        actor(TENANT);
        try {
            HrAdvanceLedgerChecks suite = new HrAdvanceLedgerChecks(arguments);
            suite.fixture();
            suite.cachedReadBoundaries();
            suite.lifecycle();
            suite.boundaries();
            suite.rollback();
            suite.races();
            System.out.println("H2_ADVANCE_LEDGER_DATABASE: checks=" + checks + "; failed=0; race_groups=" + raceGroups
                    + "; mysql=true; actual_mappers=true; actual_service=true; schema_tables=6; funding_fixture=true; salary_state_fixture=true;"
                    + " payment_flow_integrated=false; payroll_flow_integrated=false; local_cache=SESSION; cached_read_interleavings=2; http=false; production_modified=false");
            int beforePayroll = checks;
            int beforeRaces = raceGroups;
            suite.payrollPolicy();
            suite.payrollLifecycle();
            suite.payrollCorrections();
            suite.payrollRollback();
            suite.payrollRaces();
            System.out.println("H2_ADVANCE_PAYROLL_DATABASE: checks=" + (checks - beforePayroll) + "; failed=0; race_groups=" + (raceGroups - beforeRaces)
                    + "; mysql=true; actual_payroll_service=true; formal_schema=true; funding_fixture=true; approval_fixture=true; digest_callback_fixture=true;"
                    + " payment_flow_integrated=false; batch_entry_tested=false; generation_entry_tested=false; http=false; production_modified=false");
            int beforeSettlement = checks;
            int beforeSettlementRaces = raceGroups;
            suite.settlementReservations();
            System.out.println("H2_SETTLEMENT_SALARY_GUARDS_DATABASE: checks=" + (checks - beforeSettlement)
                    + "; failed=0; race_groups=" + (raceGroups - beforeSettlementRaces)
                    + "; mysql=true; actual_payroll_ledger_services=true; reservation_fixture=true; settlement_service_tested=false; http=false");
            int beforeManual = checks;
            int beforeManualRaces = raceGroups;
            suite.manualRepayments();
            suite.manualBoundaries();
            suite.writeoffs();
            suite.manualRollback();
            suite.manualRaces();
            System.out.println("H2_ADVANCE_MANUAL_DATABASE: checks=" + (checks - beforeManual) + "; failed=0; race_groups=" + (raceGroups - beforeManualRaces)
                    + "; mysql=true; actual_ledger_service=true; formal_schema=true; funding_fixture=true; proof_metadata_fixture=true;"
                    + " permissions_tested=false; file_access_tested=false; http=false; production_modified=false");
        } finally {
            UserContext.clear();
            TenantContext.clear();
        }
    }

    private void fixture() {
        equal(6L, scalar("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE'"), "只建立六张完整正式表");
        jdbc.update("INSERT INTO hr_employee (id,tenant_id,employee_no,name,gender,employee_status,hire_date) VALUES (?,?,?,?,?,'ACTIVE','2026-01-01')",
                EMPLOYEE, TENANT, "advance-check-1", "借款台账核验员工", "UNKNOWN");
        jdbc.update("INSERT INTO hr_employee (id,tenant_id,employee_no,name,gender,employee_status,hire_date) VALUES (?,?,?,?,?,'ACTIVE','2026-01-01')",
                OTHER_EMPLOYEE, TENANT, "advance-check-2", "借款台账其他员工", "UNKNOWN");
    }

    private void manualRepayments() {
        Long loan = advance("100", "80");
        Long salaryId = salary(EMPLOYEE, "2026-09");
        ledger.reserveSalary(loan, salaryId, money("60"));
        HrAdvanceRequests.Repayment input = manual(loan, "40");
        HrAdvanceRepayment entry = ledger.repayManual(loan, input);
        equal("MANUAL", entry.getRepayType(), "人工还款来源独立");
        equal("POSTED", entry.getStatus(), "真实收款确认后记账");
        equal(PAID_DATE, entry.getRepayDate(), "人工还款日期保留");
        equal(input.getProofFileId(), entry.getProofFileId(), "人工凭据关联保留");
        check(entry.getSalarySlipId() == null && entry.getSettlementId() == null, "人工还款不伪造工资或结算来源");
        assertBalance(loan, "40", "60", "60", "REPAYING");
        int version = advances.selectById(loan).getVersion();
        equal(entry.getRepaymentId(), ledger.repayManual(loan, input).getRepaymentId(), "同一来源网络重试返回原款");
        equal(version, advances.selectById(loan).getVersion(), "重试不增加借款版本");
        equal(1L, auditCount(loan, "MANUAL_POST"), "重试不新增还款审计");
        rejectAmount(() -> ledger.repayManual(loan, manual(loan, "0.01")));
        setSalaryState(salaryId, "PAID");
        ledger.postSalary(loan, salaryId, PAID_DATE);
        assertBalance(loan, "100", "0", "0", "CLEARED");
        equal(entry.getRepaymentId(), ledger.repayManual(loan, input).getRepaymentId(), "结清后重放原款仍不重复入账");
        Long lumpSum = advance("123.45", "30");
        jdbc.update("UPDATE hr_employee_advance SET repay_mode='LUMP_SUM',repay_start_month=NULL,repay_months=NULL,monthly_deduct_amount=NULL WHERE advance_id=?", lumpSum);
        ledger.repayManual(lumpSum, manual(lumpSum, "123.45"));
        assertBalance(lumpSum, "123.45", "0", "0", "CLEARED");
    }

    private void manualBoundaries() {
        Long loan = advance("100", "30");
        HrAdvanceRequests.Repayment input = manual(loan, "20");
        ledger.repayManual(loan, input);
        input.setAmount(money("21"));
        rejectBusiness(() -> ledger.repayManual(loan, input), "ADVANCE_SOURCE_CONFLICT");
        input.setAmount(money("20")); input.setProofFileId(90002L);
        rejectBusiness(() -> ledger.repayManual(loan, input), "ADVANCE_SOURCE_CONFLICT");
        input.setProofFileId(90001L); input.setRemark("改变已入账用途");
        rejectBusiness(() -> ledger.repayManual(loan, input), "ADVANCE_SOURCE_CONFLICT");
        HrAdvanceRequests.Repayment stale = manual(loan, "1"); stale.setVersion(0);
        rejectBusiness(() -> ledger.repayManual(loan, stale), "VERSION_CONFLICT");
        HrAdvanceRequests.Repayment invalid = manual(loan, "1"); invalid.setRepayDate(LocalDate.of(2026, 8, 31));
        rejectBusiness(() -> ledger.repayManual(loan, invalid), "INVALID_PARAMETER");
        invalid.setRepayDate(LocalDate.now().plusDays(1));
        rejectBusiness(() -> ledger.repayManual(loan, invalid), "INVALID_PARAMETER");
        invalid.setRepayDate(PAID_DATE); invalid.setProofFileId(null);
        rejectBusiness(() -> ledger.repayManual(loan, invalid), "INVALID_PARAMETER");
        invalid.setProofFileId(90001L); invalid.setSourceEventKey("SALARY:1:ADVANCE:1");
        rejectBusiness(() -> ledger.repayManual(loan, invalid), "INVALID_PARAMETER");
        rejectAmount(() -> ledger.repayManual(loan, manual(loan, "80.01")));
        rejectAmount(() -> ledger.repayManual(loan, manual(loan, "0.001")));
        rejectAmount(() -> ledger.repayManual(loan, manual(loan, "-1")));
        HrAdvanceRequests.Repayment foreign = manual(loan, "1");
        actor(100001L);
        try { rejectBusiness(() -> ledger.repayManual(loan, foreign), "ADVANCE_NOT_FOUND"); }
        finally { actor(TENANT); }
        assertBalance(loan, "20", "80", "0", "REPAYING");
        Long other = advance("100", "30");
        HrAdvanceRequests.Repayment collision = manual(other, "20"); collision.setSourceEventKey(input.getSourceEventKey());
        rejectBusiness(() -> ledger.repayManual(other, collision), "ADVANCE_SOURCE_CONFLICT");
        assertBalance(other, "0", "100", "0", "PAID");
        Long unfunded = advance("100", "30");
        jdbc.update("UPDATE hr_employee_advance SET status='APPROVED',paid_time=NULL,outstanding_amount=0 WHERE advance_id=?", unfunded);
        rejectBusiness(() -> ledger.repayManual(unfunded, manual(unfunded, "1")), "ADVANCE_NOT_FUNDED");
    }

    private void writeoffs() {
        Long loan = advance("100", "100");
        Long salaryId = salary(EMPLOYEE, "2026-09");
        ledger.reserveSalary(loan, salaryId, money("60"));
        rejectAmount(() -> ledger.writeoff(loan, writeoff(loan, "40")));
        ledger.releaseSalary(loan, salaryId);
        HrAdvanceRequests.Writeoff first = writeoff(loan, "40");
        ledger.writeoff(loan, first);
        assertBalance(loan, "0", "60", "0", "PAID");
        equal("40", advances.selectById(loan).getWrittenOffAmount(), "部分核销与已还金额分别记录");
        int version = advances.selectById(loan).getVersion();
        ledger.writeoff(loan, first);
        equal(version, advances.selectById(loan).getVersion(), "相同核销标识重试不再增加核销额");
        equal(1L, auditCount(loan, "WO:" + first.getSourceEventKey()), "一次核销只有一个不可变事实");
        first.setAmount(money("41"));
        rejectBusiness(() -> ledger.writeoff(loan, first), "ADVANCE_SOURCE_CONFLICT");
        first.setAmount(money("40")); first.setReason("换一个原因");
        rejectBusiness(() -> ledger.writeoff(loan, first), "ADVANCE_SOURCE_CONFLICT");
        HrAdvanceRequests.Writeoff unconfirmed = writeoff(loan, "1"); unconfirmed.setConfirmed(false);
        rejectBusiness(() -> ledger.writeoff(loan, unconfirmed), "INVALID_PARAMETER");
        HrAdvanceRequests.Writeoff stale = writeoff(loan, "1"); stale.setVersion(0);
        rejectBusiness(() -> ledger.writeoff(loan, stale), "VERSION_CONFLICT");
        rejectAmount(() -> ledger.writeoff(loan, writeoff(loan, "60.01")));
        ledger.writeoff(loan, writeoff(loan, "60"));
        assertBalance(loan, "0", "0", "0", "WRITTEN_OFF");
        equal("100", advances.selectById(loan).getWrittenOffAmount(), "全部核销不假装实际还款");
        equal(1L, scalar("SELECT COUNT(*) FROM hr_advance_repayment WHERE advance_id=?", loan), "核销保留此前已释放工资预约，不伪造还款流水");
        Long employee = payrollEmployee();
        Long pendingLoan = fundedLoan(employee, "100", "30", policy("0", "1"));
        Long originalId = payrollSalary(employee, "2026-09", "100");
        payroll.reserveCalculated(originalId); setSalaryState(originalId, "SUBMITTED"); payroll.pay(originalId, slip -> { });
        Long correctionId = payrollSalary(employee, "2026-10", "0");
        HrSalarySlip correction = salaries.selectById(correctionId); correction.setStatus("PENDING");
        payroll.applyReversals(correction, salaries.selectById(originalId), List.of(salaryEntry(originalId, pendingLoan).getRepaymentId()));
        salaries.updateById(correction);
        jdbc.update("INSERT INTO hr_payroll_correction (tenant_id,original_slip_id,correction_slip_id,reason,status) VALUES (?,?,?,'待支付补正保护','PENDING')",
                TENANT, originalId, correctionId);
        rejectBusiness(() -> ledger.writeoff(pendingLoan, writeoff(pendingLoan, "10")), "ADVANCE_CORRECTION_PENDING");
        assertBalance(pendingLoan, "30", "70", "0", "REPAYING");
    }

    private void manualRollback() {
        Long loan = advance("100", "30");
        HrAdvanceRequests.Repayment input = manual(loan, "40");
        jdbc.execute("CREATE TRIGGER h2_manual_audit_failure BEFORE INSERT ON hr_audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H2_MANUAL_AUDIT_FAILURE'");
        try {
            boolean failed = false;
            try { ledger.repayManual(loan, input); } catch (RuntimeException expected) { failed = true; }
            check(failed, "人工还款真实审计插入故障阻止全部提交");
            assertBalance(loan, "0", "100", "0", "PAID");
            equal(0L, scalar("SELECT COUNT(*) FROM hr_advance_repayment WHERE advance_id=?", loan), "故障回滚人工还款流水");
            failed = false;
            try { ledger.writeoff(loan, writeoff(loan, "40")); } catch (RuntimeException expected) { failed = true; }
            check(failed, "核销审计失败回滚余额");
            equal("0", advances.selectById(loan).getWrittenOffAmount(), "失败核销未改变事实金额");
        } finally { jdbc.execute("DROP TRIGGER h2_manual_audit_failure"); }
        ledger.repayManual(loan, input);
        assertBalance(loan, "40", "60", "0", "REPAYING");
    }

    private void cachedReadBoundaries() {
        Long manualLoan = advance("100", "100");
        HrAdvanceRequests.Repayment receipt = manual(manualLoan, "30");
        HrAdvanceRequests.Writeoff staleWriteoff = writeoff(manualLoan, "70");
        rejectBusiness(() -> support.transaction(() -> {
            HrEmployeeAdvance cached = advances.selectOne(new LambdaQueryWrapper<HrEmployeeAdvance>()
                    .eq(HrEmployeeAdvance::getTenantId, TENANT).eq(HrEmployeeAdvance::getAdvanceId, manualLoan));
            equal("0", cached.getRepaidAmount(), "先读取并缓存未还款的旧余额");
            committedElsewhere(() -> ledger.repayManual(manualLoan, receipt).getRepaymentId());
            ledger.writeoff(manualLoan, staleWriteoff);
            return null;
        }), "VERSION_CONFLICT");
        assertBalance(manualLoan, "30", "70", "0", "REPAYING");
        Long salaryLoan = advance("100", "100");
        Long firstSalary = salary(EMPLOYEE, "2026-09");
        Long secondSalary = salary(EMPLOYEE, "2026-09");
        support.transaction(() -> {
            HrEmployeeAdvance cached = advances.selectOne(new LambdaQueryWrapper<HrEmployeeAdvance>()
                    .eq(HrEmployeeAdvance::getTenantId, TENANT).eq(HrEmployeeAdvance::getAdvanceId, salaryLoan));
            equal("0", cached.getReservedAmount(), "先读取并缓存尚无预约的旧余额");
            committedElsewhere(() -> ledger.reserveSalary(salaryLoan, firstSalary, money("30")).orElseThrow().getRepaymentId());
            ledger.reserveSalary(salaryLoan, secondSalary, money("20"));
            return null;
        });
        assertBalance(salaryLoan, "0", "100", "50", "PAID");
    }

    private Long committedElsewhere(Callable<Long> operation) {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            return executor.submit(() -> {
                actor(TENANT);
                try { return operation.call(); }
                finally { UserContext.clear(); TenantContext.clear(); }
            }).get(15, TimeUnit.SECONDS);
        } catch (Exception failure) {
            throw new AssertionError("独立事务必须在缓存读取后、锁定读取前完成提交", failure);
        } finally {
            executor.shutdownNow();
            try {
                if (!executor.awaitTermination(15, TimeUnit.SECONDS)) throw new AssertionError("缓存竞争验证线程未退出");
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new AssertionError("缓存竞争验证被中断", interrupted);
            }
        }
    }

    private void manualRaces() throws Exception {
        Long sameLoan = advance("100", "100");
        HrAdvanceRequests.Repayment sameInput = manual(sameLoan, "80");
        List<Outcome> same = race(List.of(() -> ledger.repayManual(sameLoan, sameInput).getRepaymentId(),
                () -> ledger.repayManual(sameLoan, sameInput).getRepaymentId()));
        check(same.stream().allMatch(Outcome::success), "同一人工还款竞争均返回同一结果");
        equal(same.get(0).identifier(), same.get(1).identifier(), "同源人工还款只创建一行");
        assertBalance(sameLoan, "80", "20", "0", "REPAYING");
        Long competingLoan = advance("100", "100");
        HrAdvanceRequests.Repayment first = manual(competingLoan, "80");
        HrAdvanceRequests.Repayment second = manual(competingLoan, "80");
        List<Outcome> competing = race(List.of(() -> ledger.repayManual(competingLoan, first).getRepaymentId(),
                () -> ledger.repayManual(competingLoan, second).getRepaymentId()));
        equal(1L, competing.stream().filter(Outcome::success).count(), "两笔人工还款竞争不能超还本金");
        assertBalance(competingLoan, "80", "20", "0", "REPAYING");
        Long salaryLoan = advance("100", "100");
        Long salaryId = salary(EMPLOYEE, "2026-09");
        HrAdvanceRequests.Repayment manual = manual(salaryLoan, "80");
        List<Outcome> withSalary = race(List.of(() -> ledger.reserveSalary(salaryLoan, salaryId, money("80")).orElseThrow().getRepaymentId(),
                () -> ledger.repayManual(salaryLoan, manual).getRepaymentId()));
        equal(1L, withSalary.stream().filter(Outcome::success).count(), "工资预约与人工还款共享员工及借款锁");
        HrEmployeeAdvance remaining = advances.selectById(salaryLoan);
        equal("80", remaining.getReservedAmount().add(remaining.getRepaidAmount()), "两条业务路径竞争后仅使用80元本金");
        Long writeoffLoan = advance("100", "100");
        HrAdvanceRequests.Repayment receipt = manual(writeoffLoan, "80");
        HrAdvanceRequests.Writeoff writeoff = writeoff(writeoffLoan, "80");
        List<Outcome> withWriteoff = race(List.of(() -> ledger.repayManual(writeoffLoan, receipt).getRepaymentId(),
                () -> { ledger.writeoff(writeoffLoan, writeoff); return writeoffLoan; }));
        equal(1L, withWriteoff.stream().filter(Outcome::success).count(), "还款与核销竞争只保存一个确定结果");
        equal("20", advances.selectById(writeoffLoan).getOutstandingAmount(), "竞争不造成负数余额");
        Long repeatedWriteoff = advance("100", "100");
        HrAdvanceRequests.Writeoff repeated = writeoff(repeatedWriteoff, "100");
        List<Outcome> writeoffs = race(List.of(() -> { ledger.writeoff(repeatedWriteoff, repeated); return repeatedWriteoff; },
                () -> { ledger.writeoff(repeatedWriteoff, repeated); return repeatedWriteoff; }));
        check(writeoffs.stream().allMatch(Outcome::success), "并发重放同一核销均核对原结果");
        equal(1L, auditCount(repeatedWriteoff, "WO:" + repeated.getSourceEventKey()), "并发核销唯一审计事实");
        assertBalance(repeatedWriteoff, "0", "0", "0", "WRITTEN_OFF");
    }

    private HrAdvanceRequests.Repayment manual(Long advanceId, String amount) {
        HrAdvanceRequests.Repayment input = new HrAdvanceRequests.Repayment();
        input.setVersion(advances.selectById(advanceId).getVersion()); input.setAmount(money(amount));
        input.setSourceEventKey(UUID.randomUUID().toString().replace("-", "")); input.setProofFileId(90001L);
        input.setRepayDate(PAID_DATE); input.setRemark("台账层核验，凭据存在性由业务入口另行验证");
        return input;
    }

    private HrAdvanceRequests.Writeoff writeoff(Long advanceId, String amount) {
        HrAdvanceRequests.Writeoff input = new HrAdvanceRequests.Writeoff();
        input.setVersion(advances.selectById(advanceId).getVersion()); input.setAmount(money(amount));
        input.setSourceEventKey(UUID.randomUUID().toString().replace("-", "")); input.setConfirmed(true); input.setReason("已核定无法收回的部分本金");
        return input;
    }

    private void lifecycle() {
        Long advanceId = advance("100", "100");
        Long firstSalary = salary(EMPLOYEE, "2026-09");
        HrAdvanceRepayment reservation = ledger.reserveSalary(advanceId, firstSalary, money("30")).orElseThrow();
        check("RESERVED".equals(reservation.getStatus()), "算薪只生成预约");
        assertBalance(advanceId, "0", "100", "30", "PAID");
        int version = advances.selectById(advanceId).getVersion();
        HrAdvanceRepayment repeated = ledger.reserveSalary(advanceId, firstSalary, money("30")).orElseThrow();
        equal(reservation.getRepaymentId(), repeated.getRepaymentId(), "同业务来源只保存一条预约");
        equal(version, advances.selectById(advanceId).getVersion(), "重复同金额不增加余额版本");
        equal(1L, auditCount(advanceId, "SALARY_RESERVE"), "重复同金额不产生假变更审计");
        HrAdvanceRepayment recalculated = ledger.reserveSalary(advanceId, firstSalary, money("50")).orElseThrow();
        equal(reservation.getRepaymentId(), recalculated.getRepaymentId(), "重算更新同一个预约");
        assertBalance(advanceId, "0", "100", "50", "PAID");
        HrAdvanceRepayment released = ledger.reserveSalary(advanceId, firstSalary, BigDecimal.ZERO).orElseThrow();
        check("RELEASED".equals(released.getStatus()), "重算零扣款释放预约但保留来源");
        equal("50", released.getRepayAmount(), "释放记录保留原预约金额");
        assertBalance(advanceId, "0", "100", "0", "PAID");
        ledger.releaseSalary(advanceId, firstSalary);
        equal(1L, auditCount(advanceId, "SALARY_RELEASE"), "重复释放不叠加");
        Long emptySalary = salary(EMPLOYEE, "2026-09");
        check(ledger.reserveSalary(advanceId, emptySalary, BigDecimal.ZERO).isEmpty(), "零金额不新增非法流水");
        HrAdvanceRepayment reactivated = ledger.reserveSalary(advanceId, firstSalary, money("40")).orElseThrow();
        equal(reservation.getRepaymentId(), reactivated.getRepaymentId(), "草稿再次重算复用原业务来源");
        setSalaryState(firstSalary, "SUBMITTED");
        rejectBusiness(() -> ledger.reserveSalary(advanceId, firstSalary, money("20")), "ADVANCE_SALARY_STATE");
        rejectBusiness(() -> ledger.releaseSalary(advanceId, firstSalary), "ADVANCE_SALARY_STATE");
        rejectBusiness(() -> ledger.postSalary(advanceId, firstSalary, PAID_DATE), "ADVANCE_SALARY_STATE");
        assertBalance(advanceId, "0", "100", "40", "PAID");
        setSalaryState(firstSalary, "PAID");
        HrAdvanceRepayment paid = ledger.postSalary(advanceId, firstSalary, PAID_DATE);
        check("POSTED".equals(paid.getStatus()) && PAID_DATE.equals(paid.getRepayDate()) && paid.getPostedTime() != null, "实际发薪状态才入账并保存日期");
        assertBalance(advanceId, "40", "60", "0", "REPAYING");
        equal(paid.getRepaymentId(), ledger.postSalary(advanceId, firstSalary, PAID_DATE).getRepaymentId(), "发薪重放返回同一条入账");
        equal(1L, auditCount(advanceId, "SALARY_POST"), "重放发薪不重复还款审计");
        assertBalance(advanceId, "40", "60", "0", "REPAYING");
        rejectBusiness(() -> ledger.reserveSalary(advanceId, firstSalary, money("20")), "ADVANCE_SALARY_STATE");
        rejectBusiness(() -> ledger.releaseSalary(advanceId, firstSalary), "ADVANCE_SALARY_STATE");
        Long secondSalary = salary(EMPLOYEE, "2026-09");
        ledger.reserveSalary(advanceId, secondSalary, money("50"));
        setSalaryState(secondSalary, "PAID");
        ledger.postSalary(advanceId, secondSalary, PAID_DATE);
        assertBalance(advanceId, "90", "10", "0", "REPAYING");
        Long lastSalary = salary(EMPLOYEE, "2026-09");
        ledger.reserveSalary(advanceId, lastSalary, money("10"));
        setSalaryState(lastSalary, "PAID");
        ledger.postSalary(advanceId, lastSalary, PAID_DATE);
        assertBalance(advanceId, "100", "0", "0", "CLEARED");
        equal(3L, scalar("SELECT COUNT(*) FROM hr_advance_repayment WHERE advance_id=? AND status='POSTED'", advanceId), "三次实际扣还均保留历史");
        Long afterClearSalary = salary(EMPLOYEE, "2026-10");
        rejectAmount(() -> ledger.reserveSalary(advanceId, afterClearSalary, money("0.01")));
        equal("100", jdbc.queryForObject("SELECT SUM(repay_amount) FROM hr_advance_repayment WHERE advance_id=? AND status='POSTED'", BigDecimal.class, advanceId), "余额与逐笔入账精确对账");
    }

    private void boundaries() {
        Long advanceId = advance("100", "30");
        Long firstSalary = salary(EMPLOYEE, "2026-09");
        Long secondSalary = salary(EMPLOYEE, "2026-09");
        Long otherSalary = salary(OTHER_EMPLOYEE, "2026-09");
        rejectBusiness(() -> ledger.reserveSalary(advanceId, otherSalary, money("1")), "ADVANCE_SALARY_MISMATCH");
        actor(100001L);
        try { rejectBusiness(() -> ledger.reserveSalary(advanceId, firstSalary, money("1")), "ADVANCE_NOT_FOUND"); }
        finally { actor(TENANT); }
        ledger.reserveSalary(advanceId, firstSalary, money("30"));
        rejectBusiness(() -> ledger.reserveSalary(advanceId, secondSalary, money("0.01")), "ADVANCE_MONTHLY_LIMIT");
        ledger.releaseSalary(advanceId, firstSalary);
        ledger.reserveSalary(advanceId, secondSalary, money("20"));
        ledger.reserveSalary(advanceId, firstSalary, money("10"));
        assertBalance(advanceId, "0", "100", "30", "PAID");
        setSalaryState(secondSalary, "PAID");
        ledger.postSalary(advanceId, secondSalary, PAID_DATE);
        rejectBusiness(() -> ledger.reserveSalary(advanceId, firstSalary, money("10.01")), "ADVANCE_MONTHLY_LIMIT");
        jdbc.update("UPDATE hr_salary_slip SET period_month='2026-10' WHERE id=?", firstSalary);
        rejectBusiness(() -> ledger.releaseSalary(advanceId, firstSalary), "ADVANCE_SALARY_CHAIN_INVALID");
        assertBalance(advanceId, "20", "80", "10", "REPAYING");
        jdbc.update("UPDATE hr_salary_slip SET period_month='2026-09' WHERE id=?", firstSalary);
        setSalaryState(firstSalary, "CANCELLED");
        ledger.releaseSalary(advanceId, firstSalary);
        assertBalance(advanceId, "20", "80", "0", "REPAYING");
        Long unfunded = advance("100", "30");
        Long source = salary(EMPLOYEE, "2026-09");
        jdbc.update("UPDATE hr_employee_advance SET status='APPROVED',paid_time=NULL,outstanding_amount=0 WHERE advance_id=?", unfunded);
        rejectBusiness(() -> ledger.reserveSalary(unfunded, source, money("1")), "ADVANCE_NOT_FUNDED");
        Long future = advance("100", "30");
        jdbc.update("UPDATE hr_employee_advance SET repay_start_month='2026-10' WHERE advance_id=?", future);
        rejectBusiness(() -> ledger.reserveSalary(future, source, money("1")), "ADVANCE_REPAYMENT_NOT_DUE");
        jdbc.update("UPDATE hr_employee_advance SET repay_start_month='0000-01' WHERE advance_id=?", future);
        rejectBusiness(() -> ledger.reserveSalary(future, source, money("1")), "ADVANCE_SALARY_PLAN_INVALID");
        jdbc.update("UPDATE hr_employee_advance SET repay_start_month='2026-09',repay_mode='LUMP_SUM' WHERE advance_id=?", future);
        rejectBusiness(() -> ledger.reserveSalary(future, source, money("1")), "ADVANCE_SALARY_PLAN_INVALID");
        Long inconsistent = advance("100", "30");
        jdbc.update("UPDATE hr_employee_advance SET reserved_amount=1 WHERE advance_id=?", inconsistent);
        rejectBusiness(() -> ledger.reserveSalary(inconsistent, source, money("1")), "ADVANCE_LEDGER_MISMATCH");
        equal(0L, scalar("SELECT COUNT(*) FROM hr_advance_repayment WHERE advance_id=?", inconsistent), "对账失败不掩盖缺失流水");
        Long noReservation = advance("100", "30");
        Long paidSource = salary(EMPLOYEE, "2026-09");
        setSalaryState(paidSource, "PAID");
        rejectBusiness(() -> ledger.postSalary(noReservation, paidSource, PAID_DATE), "ADVANCE_RESERVATION_MISSING");
        rejectBusiness(() -> ledger.postSalary(noReservation, paidSource, LocalDate.now().plusDays(1)), "INVALID_PARAMETER");
        rejectAmount(() -> ledger.reserveSalary(noReservation, source, money("0.001")));
        rejectAmount(() -> ledger.reserveSalary(noReservation, source, money("-1")));
        assertBalance(noReservation, "0", "100", "0", "PAID");
        Long deletedSalary = salary(EMPLOYEE, "2026-09");
        jdbc.update("UPDATE hr_salary_slip SET deleted=1 WHERE id=?", deletedSalary);
        rejectBusiness(() -> ledger.reserveSalary(noReservation, deletedSalary, money("1")), "ADVANCE_SALARY_MISMATCH");
    }

    private void rollback() {
        Long advanceId = advance("100", "30");
        Long source = salary(EMPLOYEE, "2026-09");
        int beforeVersion = advances.selectById(advanceId).getVersion();
        jdbc.execute("RENAME TABLE hr_audit_log TO hr_audit_log_unavailable");
        boolean failed = false;
        try {
            ledger.reserveSalary(advanceId, source, money("20"));
        } catch (RuntimeException expected) {
            failed = true;
        } finally {
            jdbc.execute("RENAME TABLE hr_audit_log_unavailable TO hr_audit_log");
        }
        check(failed, "真实审计表不可用导致本次写入失败");
        assertBalance(advanceId, "0", "100", "0", "PAID");
        equal(beforeVersion, advances.selectById(advanceId).getVersion(), "事务失败恢复原版本");
        equal(0L, scalar("SELECT COUNT(*) FROM hr_advance_repayment WHERE advance_id=?", advanceId), "事务失败没有遗留预约流水");
        ledger.reserveSalary(advanceId, source, money("20"));
        assertBalance(advanceId, "0", "100", "20", "PAID");
    }

    private void races() throws Exception {
        Long sameAdvance = advance("100", "100");
        Long sameSalary = salary(EMPLOYEE, "2026-09");
        List<Outcome> same = race(List.of(
                () -> ledger.reserveSalary(sameAdvance, sameSalary, money("80")).orElseThrow().getRepaymentId(),
                () -> ledger.reserveSalary(sameAdvance, sameSalary, money("80")).orElseThrow().getRepaymentId()));
        check(same.stream().allMatch(Outcome::success), "同源同时请求均核对同一预约");
        equal(same.get(0).identifier(), same.get(1).identifier(), "同源同时请求不重复新增");
        assertBalance(sameAdvance, "0", "100", "80", "PAID");
        equal(1L, scalar("SELECT COUNT(*) FROM hr_advance_repayment WHERE advance_id=?", sameAdvance), "同源同时请求只落一行");
        Long competingAdvance = advance("100", "100");
        Long firstSalary = salary(EMPLOYEE, "2026-09");
        Long secondSalary = salary(EMPLOYEE, "2026-10");
        List<Outcome> competing = race(List.of(
                () -> ledger.reserveSalary(competingAdvance, firstSalary, money("80")).orElseThrow().getRepaymentId(),
                () -> ledger.reserveSalary(competingAdvance, secondSalary, money("80")).orElseThrow().getRepaymentId()));
        equal(1L, competing.stream().filter(Outcome::success).count(), "不同源竞争同一本金仅一笔可预约80");
        assertBalance(competingAdvance, "0", "100", "80", "PAID");
        equal(1L, scalar("SELECT COUNT(*) FROM hr_advance_repayment WHERE advance_id=?", competingAdvance), "失败竞争未留下第二笔流水");
        setSalaryState(sameSalary, "PAID");
        List<Outcome> posting = race(List.of(
                () -> ledger.postSalary(sameAdvance, sameSalary, PAID_DATE).getRepaymentId(),
                () -> ledger.postSalary(sameAdvance, sameSalary, PAID_DATE).getRepaymentId()));
        check(posting.stream().allMatch(Outcome::success), "同时发薪通知核对同一实际入账");
        assertBalance(sameAdvance, "80", "20", "0", "REPAYING");
        equal(1L, auditCount(sameAdvance, "SALARY_POST"), "同时发薪只有一次实际入账审计");
    }

    private void payrollPolicy() {
        ObjectNode policy = policy("30", "0.75");
        equal("70", HrAdvancePayrollPolicy.budget(money("100"), policy), "最低实发额约束扣还预算");
        equal("75", HrAdvancePayrollPolicy.budget(money("100"), policy("0", "0.75")), "比例上限约束扣还预算");
        equal("0.03", HrAdvancePayrollPolicy.budget(money("0.11"), policy("0", "0.33333")), "比例计算向下取分，不能多扣");
        equal("0", HrAdvancePayrollPolicy.budget(money("10"), policy), "低于最低实发额时不再扣还");
        equal("0", HrAdvancePayrollPolicy.budget(money("100"), policy("0", "0")), "明确核定零比例时不扣还");
        equal("9999999999999999.99", HrAdvancePayrollPolicy.budget(money("9999999999999999.99"), policy("0", "1")), "可扣工资沿用现有工资字段容量");
        rejectBusiness(() -> HrAdvancePayrollPolicy.budget(money("100"), null), "ADVANCE_PAYROLL_POLICY_REQUIRED");
        rejectBusiness(() -> HrAdvancePayrollPolicy.budget(money("100"), json.createObjectNode()), "ADVANCE_PAYROLL_POLICY_REQUIRED");
        rejectBusiness(() -> HrAdvancePayrollPolicy.budget(money("-1"), policy), "ADVANCE_PAYROLL_AMOUNT_INVALID");
        rejectBusiness(() -> HrAdvancePayrollPolicy.budget(money("0.001"), policy), "ADVANCE_PAYROLL_AMOUNT_INVALID");
        rejectBusiness(() -> HrAdvancePayrollPolicy.budget(money("100"), policy("0", "1.01")), "ADVANCE_PAYROLL_POLICY_INVALID");
        rejectBusiness(() -> HrAdvancePayrollPolicy.budget(money("100"), policy("0", "-0.01")), "ADVANCE_PAYROLL_POLICY_INVALID");
        rejectBusiness(() -> HrAdvancePayrollPolicy.budget(money("100"), policy("-1", "1")), "ADVANCE_PAYROLL_AMOUNT_INVALID");
        rejectBusiness(() -> HrAdvancePayrollPolicy.budget(money("100"), policy("0.001", "1")), "ADVANCE_PAYROLL_AMOUNT_INVALID");
        ObjectNode unconfirmed = policy.deepCopy();
        ((ObjectNode) unconfirmed.get("payrollDeduction")).put("confirmationStatus", "DRAFT");
        rejectBusiness(() -> HrAdvancePayrollPolicy.budget(money("100"), unconfirmed), "ADVANCE_PAYROLL_POLICY_REQUIRED");
        ObjectNode invalidVersion = policy.deepCopy().put("ruleVersion", -1);
        rejectBusiness(() -> HrAdvancePayrollPolicy.budget(money("100"), invalidVersion), "ADVANCE_PAYROLL_POLICY_REQUIRED");
        ObjectNode fractionalId = policy.deepCopy().put("ruleId", 1.5);
        rejectBusiness(() -> HrAdvancePayrollPolicy.budget(money("100"), fractionalId), "ADVANCE_PAYROLL_POLICY_REQUIRED");
    }

    private void payrollLifecycle() {
        Long employee = payrollEmployee();
        Long firstLoan = fundedLoan(employee, "40", "40", policy("30", "0.75"));
        Long secondLoan = fundedLoan(employee, "100", "50", policy("0", "1"));
        Long salaryId = payrollSalary(employee, "2026-09", "100");
        HrSalarySlip preview = salaries.selectById(salaryId);
        payroll.preview(preview);
        equal("30", preview.getNetTotal(), "多笔借款按最严格核定上限保留实发额");
        equal("70", preview.getDeductionTotal(), "两笔扣还共用一个工资预算");
        equal("100", decimalTax(preview), "借款扣还为税后扣款，不减少应税收入");
        assertBalance(firstLoan, "0", "40", "0", "PAID");
        assertBalance(secondLoan, "0", "100", "0", "PAID");
        equal(0L, scalar("SELECT COUNT(*) FROM hr_advance_repayment WHERE salary_slip_id=?", salaryId), "纯预览不写预约或还款");
        HrSalarySlip reserved = payroll.reserveCalculated(salaryId);
        equal("30", reserved.getNetTotal(), "真实工资单保存税后扣还结果");
        equal("40", salaryEntry(salaryId, firstLoan).getRepayAmount(), "同放款时间按借款编号优先扣还第一笔");
        equal("30", salaryEntry(salaryId, secondLoan).getRepayAmount(), "后一笔只分配剩余预算");
        Long secondEntryId = salaryEntry(salaryId, secondLoan).getRepaymentId();
        assertBalance(firstLoan, "0", "40", "40", "PAID");
        assertBalance(secondLoan, "0", "100", "30", "PAID");
        payroll.reserveCalculated(salaryId);
        equal(secondEntryId, salaryEntry(salaryId, secondLoan).getRepaymentId(), "重算不重复创建来源");
        resetPayrollSalary(salaryId, "70");
        payroll.reserveCalculated(salaryId);
        assertBalance(firstLoan, "0", "40", "40", "PAID");
        assertBalance(secondLoan, "0", "100", "0", "PAID");
        equal("RELEASED", salaryEntry(salaryId, secondLoan).getStatus(), "收入减少时释放后一笔预约");
        equal("30", salaryEntry(salaryId, secondLoan).getRepayAmount(), "释放记录保留原金额");
        resetPayrollSalary(salaryId, "100");
        payroll.reserveCalculated(salaryId);
        equal(secondEntryId, salaryEntry(salaryId, secondLoan).getRepaymentId(), "重新计算复用已释放来源");
        payroll.assertReserved(salaries.selectById(salaryId));
        setSalaryState(salaryId, "SUBMITTED");
        rejectBusiness(() -> payroll.reserveCalculated(salaryId), "ADVANCE_SALARY_STATE");
        rejectBusiness(() -> payroll.releaseSalary(salaryId), "ADVANCE_SALARY_STATE");
        List<String> verified = new ArrayList<>();
        payroll.pay(salaryId, slip -> verified.add(slip.getStatus()));
        equal("PAID", salaries.selectById(salaryId).getStatus(), "真实发薪服务写入工资PAID");
        equal(List.of("SUBMITTED"), verified, "发薪前调用工资真实性核验");
        assertBalance(firstLoan, "40", "0", "0", "CLEARED");
        assertBalance(secondLoan, "30", "70", "0", "REPAYING");
        payroll.pay(salaryId, slip -> verified.add(slip.getStatus()));
        equal(1L, auditCount(secondLoan, "SALARY_POST"), "重复发薪只入账一次");
        equal(List.of("SUBMITTED", "PAID"), verified, "重复发薪仍核验真实工资单");
        Long later = payrollSalary(employee, "2026-09", "100");
        payroll.reserveCalculated(later);
        equal("20", salaryEntry(later, secondLoan).getRepayAmount(), "同月第二期不能再次使用完整月额度");
        payroll.releaseSalary(later);
        assertBalance(secondLoan, "30", "70", "0", "REPAYING");
        equal("RELEASED", salaryEntry(later, secondLoan).getStatus(), "取消工资后恢复本金但不伪造还款");
        actor(100001L);
        try { rejectBusiness(() -> payroll.pay(salaryId, ignored -> { }), "ADVANCE_SALARY_MISSING"); }
        finally { actor(TENANT); }
        Long unconfiguredEmployee = payrollEmployee();
        Long unconfiguredLoan = fundedLoan(unconfiguredEmployee, "100", "20", json.createObjectNode());
        Long unconfiguredSalary = payrollSalary(unconfiguredEmployee, "2026-09", "100");
        rejectBusiness(() -> payroll.reserveCalculated(unconfiguredSalary), "ADVANCE_PAYROLL_POLICY_REQUIRED");
        assertBalance(unconfiguredLoan, "0", "100", "0", "PAID");
        equal("100", salaries.selectById(unconfiguredSalary).getNetTotal(), "缺核定政策时不改写工资");
    }

    private void payrollCorrections() {
        Long employee = payrollEmployee();
        Long loan = fundedLoan(employee, "100", "100", policy("0", "1"));
        Long originalId = payrollSalary(employee, "2026-09", "100");
        payroll.reserveCalculated(originalId); setSalaryState(originalId, "SUBMITTED");
        payroll.pay(originalId, ignored -> { });
        HrAdvanceRepayment originalEntry = salaryEntry(originalId, loan);
        Long correctionId = payrollSalary(employee, "2026-10", "0");
        setSalaryState(correctionId, "PENDING");
        HrSalarySlip correction = salaries.selectById(correctionId);
        payroll.withEmployeeLocks(List.of(employee), () -> {
            payroll.applyReversals(correction, salaries.selectById(originalId), List.of(originalEntry.getRepaymentId()));
            salaries.updateById(correction);
            jdbc.update("INSERT INTO hr_payroll_correction (tenant_id,original_slip_id,correction_slip_id,reason,status) VALUES (?,?,?,'真实扣还补正验证','PENDING')",
                    TENANT, originalId, correctionId);
            return null;
        });
        equal("100", correction.getNetTotal(), "补正退回原扣还且不重复修改应发");
        equal("-100", correction.getDeductionTotal(), "补正为负扣款");
        equal("0", decimalTax(correction), "退回借款扣款不增加应税收入");
        assertBalance(loan, "100", "0", "0", "CLEARED");
        rejectBusiness(() -> payroll.pay(correctionId, ignored -> { }), "ADVANCE_SALARY_STATE");
        HrSalarySlip duplicate = salaries.selectById(payrollSalary(employee, "2026-10", "0"));
        duplicate.setStatus("PENDING");
        rejectBusiness(() -> payroll.applyReversals(duplicate, salaries.selectById(originalId), List.of(originalEntry.getRepaymentId())), "ADVANCE_REVERSAL_PENDING");
        setSalaryState(correctionId, "SUBMITTED");
        payroll.pay(correctionId, ignored -> { });
        assertBalance(loan, "0", "100", "0", "PAID");
        equal("REVERSED", repayments.selectById(originalEntry.getRepaymentId()).getStatus(), "原款保留并标记已冲正");
        equal("100", repayments.selectById(originalEntry.getRepaymentId()).getRepayAmount(), "原款金额永不覆盖");
        HrAdvanceRepayment reversed = salaryEntry(correctionId, loan);
        equal("-100", reversed.getRepayAmount(), "真实补正发薪写入负数反向流水");
        equal(originalEntry.getRepaymentId(), reversed.getReversalOfId(), "反向流水关联原款");
        equal("2026-09", reversed.getRepayMonth(), "跨月补正归回原扣还月份，不扩大新月份额度");
        payroll.pay(correctionId, ignored -> { }); payroll.pay(originalId, ignored -> { });
        equal(1L, auditCount(loan, "SALARY_REVERSE"), "补正与原款发薪重放均不重复冲正");
        Long nextSalary = payrollSalary(employee, "2026-10", "200");
        payroll.reserveCalculated(nextSalary);
        equal("100", salaryEntry(nextSalary, loan).getRepayAmount(), "跨月冲正后新月仍只分配约定月扣额");
    }

    private void payrollRollback() {
        Long employee = payrollEmployee();
        Long loan = fundedLoan(employee, "100", "100", policy("0", "1"));
        Long salaryId = payrollSalary(employee, "2026-09", "100");
        payroll.reserveCalculated(salaryId); setSalaryState(salaryId, "SUBMITTED");
        boolean invalidDigestFailed = false;
        try { payroll.pay(salaryId, ignored -> { throw new IllegalStateException("工资摘要不符"); }); }
        catch (IllegalStateException expected) { invalidDigestFailed = true; }
        check(invalidDigestFailed, "工资真实性核验失败阻止发薪");
        equal("SUBMITTED", salaries.selectById(salaryId).getStatus(), "核验失败工资仍待支付");
        assertBalance(loan, "0", "100", "100", "PAID");
        jdbc.execute("RENAME TABLE hr_audit_log TO hr_audit_log_unavailable");
        boolean failed = false;
        try { payroll.pay(salaryId, ignored -> { }); }
        catch (RuntimeException expected) { failed = true; }
        finally { jdbc.execute("RENAME TABLE hr_audit_log_unavailable TO hr_audit_log"); }
        check(failed, "真实审计表故障使整个发薪事务失败");
        equal("SUBMITTED", salaries.selectById(salaryId).getStatus(), "还款审计失败回滚工资PAID");
        equal("RESERVED", salaryEntry(salaryId, loan).getStatus(), "还款审计失败回滚流水POSTED");
        assertBalance(loan, "0", "100", "100", "PAID");
        HrSalarySlip forged = salaries.selectById(salaryId);
        forged.setComponents(List.of(Map.of("name", "缺借款明细", "type", "EARNING", "amount", money("100"))));
        salaries.updateById(forged);
        rejectBusiness(() -> payroll.pay(salaryId, ignored -> { }), "ADVANCE_PAYROLL_LEDGER_MISMATCH");
        equal("SUBMITTED", salaries.selectById(salaryId).getStatus(), "实际预约与工资明细不符时不支付");
    }

    private void payrollRaces() throws Exception {
        Long employee = payrollEmployee();
        Long loan = fundedLoan(employee, "100", "100", policy("0", "1"));
        Long salaryId = payrollSalary(employee, "2026-09", "80");
        List<Outcome> reserved = race(List.of(() -> payroll.reserveCalculated(salaryId).getId(), () -> payroll.reserveCalculated(salaryId).getId()));
        check(reserved.stream().allMatch(Outcome::success), "同时工资重算复用同一预约");
        assertBalance(loan, "0", "100", "80", "PAID");
        setSalaryState(salaryId, "SUBMITTED");
        List<Outcome> paid = race(List.of(() -> { payroll.pay(salaryId, ignored -> { }); return salaryId; },
                () -> { payroll.pay(salaryId, ignored -> { }); return salaryId; }));
        check(paid.stream().allMatch(Outcome::success), "真实发薪服务并发请求均核对一次还款");
        assertBalance(loan, "80", "20", "0", "REPAYING");
        equal(1L, auditCount(loan, "SALARY_POST"), "真实发薪服务并发仍只记一次还款");
        Long competingEmployee = payrollEmployee();
        Long competingLoan = fundedLoan(competingEmployee, "100", "100", policy("0", "1"));
        Long first = payrollSalary(competingEmployee, "2026-09", "80");
        Long second = payrollSalary(competingEmployee, "2026-10", "80");
        List<Outcome> competing = race(List.of(() -> payroll.reserveCalculated(first).getId(), () -> payroll.reserveCalculated(second).getId()));
        check(competing.stream().allMatch(Outcome::success), "不同工资竞争时后一份自动按剩余本金算薪");
        equal("100", jdbc.queryForObject("SELECT SUM(repay_amount) FROM hr_advance_repayment WHERE advance_id=? AND status='RESERVED'", BigDecimal.class, competingLoan), "并发预约合计不超过本金");
        assertBalance(competingLoan, "0", "100", "100", "PAID");
    }

    private void settlementReservations() throws Exception {
        Long employee = payrollEmployee();
        Long loan = fundedLoan(employee, "100", "30", policy("0", "1"));
        Long salaryId = payrollSalary(employee, "2026-09", "100");
        payroll.reserveCalculated(salaryId);
        rejectBusiness(() -> support.transaction(() -> {
            check(salaries.selectById(salaryId).getReservedSettlementId() == null, "缓存初读工资尚未占用");
            committedElsewhere(() -> {
                jdbc.update("UPDATE hr_salary_slip SET reserved_settlement_id=900001 WHERE id=?", salaryId);
                return salaryId;
            });
            payroll.reserveCalculated(salaryId);
            return null;
        }), "SALARY_RESERVED_BY_SETTLEMENT");
        equal(900001L, salaries.selectById(salaryId).getReservedSettlementId(), "工资占用正确映射且缓存被锁查询刷新");
        rejectBusiness(() -> payroll.assertReserved(salaries.selectById(salaryId)), "SALARY_RESERVED_BY_SETTLEMENT");
        rejectBusiness(() -> payroll.releaseSalary(salaryId), "SALARY_RESERVED_BY_SETTLEMENT");
        rejectBusiness(() -> ledger.releaseSalary(loan, salaryId), "SALARY_RESERVED_BY_SETTLEMENT");
        setSalaryState(salaryId, "SUBMITTED");
        rejectBusiness(() -> payroll.pay(salaryId, ignored -> { }), "SALARY_RESERVED_BY_SETTLEMENT");
        rejectBusiness(() -> ledger.postSalary(loan, salaryId, LocalDate.of(2026, 9, 30)), "SALARY_RESERVED_BY_SETTLEMENT");
        check("SUBMITTED".equals(salaries.selectById(salaryId).getStatus()), "结算占用时未改写工资支付状态");
        assertBalance(loan, "0", "100", "30", "PAID");
        equal(0L, auditCount(loan, "SALARY_POST"), "拒绝重复发薪未写实际扣还事实");
        jdbc.update("UPDATE hr_salary_slip SET reserved_settlement_id=NULL WHERE id=?", salaryId);
        payroll.pay(salaryId, ignored -> { });
        assertBalance(loan, "30", "70", "0", "REPAYING");
        equal(1L, auditCount(loan, "SALARY_POST"), "解除测试占用后普通发薪只入账一次");

        Long competingEmployee = payrollEmployee();
        Long competingLoan = fundedLoan(competingEmployee, "100", "30", policy("0", "1"));
        Long competingSalary = payrollSalary(competingEmployee, "2026-09", "100");
        payroll.reserveCalculated(competingSalary); setSalaryState(competingSalary, "SUBMITTED");
        List<Outcome> outcomes = race(List.of(() -> payroll.withEmployeeLocks(List.of(competingEmployee), () -> {
            if (jdbc.update("UPDATE hr_salary_slip SET reserved_settlement_id=900002 WHERE id=? AND status='SUBMITTED' AND reserved_settlement_id IS NULL", competingSalary) != 1) {
                throw new IllegalArgumentException("工资已支付，不能纳入结算");
            }
            return competingSalary;
        }), () -> { payroll.pay(competingSalary, ignored -> { }); return competingSalary; }));
        equal(1L, outcomes.stream().filter(Outcome::success).count(), "同员工结算占用与普通发薪竞争仅一方成功");
        HrSalarySlip competing = salaries.selectById(competingSalary);
        if (competing.getReservedSettlementId() != null) {
            check("SUBMITTED".equals(competing.getStatus()), "占用成功时工资仍未付");
            assertBalance(competingLoan, "0", "100", "30", "PAID");
        } else {
            check("PAID".equals(competing.getStatus()), "付款成功时未形成结算占用");
            assertBalance(competingLoan, "30", "70", "0", "REPAYING");
        }
    }

    private Long payrollEmployee() {
        Long identifier = nextEmployeeId++;
        jdbc.update("INSERT INTO hr_employee (id,tenant_id,employee_no,name,gender,employee_status,hire_date) VALUES (?,?,?,?,?,'ACTIVE','2026-01-01')",
                identifier, TENANT, "payroll-advance-" + identifier, "借款工资核验员工", "UNKNOWN");
        return identifier;
    }

    private Long fundedLoan(Long employee, String principal, String monthly, JsonNode policy) {
        Long identifier = advance(principal, monthly);
        HrEmployeeAdvance loan = advances.selectById(identifier);
        loan.setEmployeeId(employee); loan.setRuleSnapshot(policy); advances.updateById(loan);
        return identifier;
    }

    private ObjectNode policy(String minimum, String ratio) {
        ObjectNode snapshot = json.createObjectNode().put("ruleId", 93001).put("ruleVersion", 1);
        snapshot.putObject("payrollDeduction").put("confirmationStatus", "CONFIRMED")
                .put("minimumNetAmount", money(minimum)).put("maximumNetRatio", money(ratio));
        return snapshot;
    }

    private Long payrollSalary(Long employee, String month, String gross) {
        Long identifier = salary(employee, month);
        resetPayrollSalary(identifier, gross);
        return identifier;
    }

    private void resetPayrollSalary(Long identifier, String gross) {
        HrSalarySlip slip = salaries.selectById(identifier);
        slip.setGrossTotal(money(gross)); slip.setNetTotal(money(gross)); slip.setDeductionTotal(BigDecimal.ZERO);
        slip.setTaxAmount(BigDecimal.ZERO); slip.setCurrentTax(BigDecimal.ZERO); slip.setBenefitAmount(BigDecimal.ZERO);
        slip.setComponents(List.of(Map.of("name", "本测试已核算税额快照", "type", "TAX_SNAPSHOT", "amount", BigDecimal.ZERO,
                "currentTaxableIncome", money(gross))));
        salaries.updateById(slip);
    }

    private BigDecimal decimalTax(HrSalarySlip slip) {
        return new BigDecimal(String.valueOf(slip.getComponents().stream().filter(component -> "TAX_SNAPSHOT".equals(component.get("type")))
                .findFirst().orElseThrow().get("currentTaxableIncome")));
    }

    private HrAdvanceRepayment salaryEntry(Long salaryId, Long advanceId) {
        return repayments.selectOne(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<HrAdvanceRepayment>()
                .eq(HrAdvanceRepayment::getTenantId, TENANT).eq(HrAdvanceRepayment::getSalarySlipId, salaryId).eq(HrAdvanceRepayment::getAdvanceId, advanceId));
    }

    private List<Outcome> race(List<Callable<Long>> operations) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(operations.size());
        CountDownLatch ready = new CountDownLatch(operations.size());
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Outcome>> pending = new ArrayList<>();
            for (Callable<Long> operation : operations) {
                pending.add(executor.submit(() -> {
                    actor(TENANT);
                    ready.countDown();
                    try {
                        if (!start.await(15, TimeUnit.SECONDS)) throw new AssertionError("同时请求未启动");
                        try { return new Outcome(true, operation.call()); }
                        catch (HrHException | IllegalArgumentException expected) { return new Outcome(false, null); }
                    } finally {
                        UserContext.clear();
                        TenantContext.clear();
                    }
                }));
            }
            if (!ready.await(15, TimeUnit.SECONDS)) throw new AssertionError("测试线程未准备就绪");
            start.countDown();
            List<Outcome> results = new ArrayList<>();
            for (Future<Outcome> result : pending) results.add(result.get(30, TimeUnit.SECONDS));
            raceGroups++;
            return results;
        } finally {
            start.countDown();
            executor.shutdownNow();
            if (!executor.awaitTermination(15, TimeUnit.SECONDS)) throw new AssertionError("测试线程未退出");
        }
    }

    private Long advance(String principal, String monthly) {
        HrEmployeeAdvance row = new HrEmployeeAdvance();
        row.setTenantId(TENANT);
        row.setAdvanceNo("fixture_" + UUID.randomUUID());
        row.setEmployeeId(EMPLOYEE);
        row.setAdvanceAmount(money(principal));
        row.setPurpose("独立数据库借款台账测试，不代表真实放款");
        row.setApplyDate(LocalDate.of(2026, 9, 1));
        row.setRepayMode("SALARY_DEDUCT");
        row.setRepayStartMonth("2026-09");
        row.setRepayMonths(4);
        row.setMonthlyDeductAmount(money(monthly));
        row.setRepaidAmount(BigDecimal.ZERO);
        row.setOutstandingAmount(money(principal));
        row.setReservedAmount(BigDecimal.ZERO);
        row.setWrittenOffAmount(BigDecimal.ZERO);
        row.setStatus("PAID");
        row.setApprovalStatus("APPROVED");
        row.setVersion(0);
        row.setPaidTime(LocalDateTime.of(2026, 9, 1, 10, 0));
        row.setPaymentRequestId(nextSalaryId++);
        check(advances.insert(row) == 1, "真实MyBatis新增借款测试前置记录");
        return row.getAdvanceId();
    }

    private Long salary(Long employeeId, String month) {
        Long identifier = nextSalaryId++;
        jdbc.update("INSERT INTO hr_salary_slip (id,tenant_id,employee_id,period_month,status) VALUES (?,?,?,?,'DRAFT')",
                identifier, TENANT, employeeId, month);
        return identifier;
    }

    private void setSalaryState(Long identifier, String status) {
        jdbc.update("UPDATE hr_salary_slip SET status=? WHERE id=? AND tenant_id=?", status, identifier, TENANT);
    }

    private void assertBalance(Long advanceId, String repaid, String outstanding, String reserved, String status) {
        HrEmployeeAdvance row = advances.selectById(advanceId);
        equal(repaid, row.getRepaidAmount(), "已还金额正确");
        equal(outstanding, row.getOutstandingAmount(), "未还本金正确");
        equal(reserved, row.getReservedAmount(), "预约金额正确");
        equal(status, row.getStatus(), "借款状态正确");
        equal(row.getAdvanceAmount(), row.getRepaidAmount().add(row.getOutstandingAmount()).add(row.getWrittenOffAmount()), "总本金保持守恒");
    }

    private long scalar(String sql, Object... arguments) {
        return Objects.requireNonNull(jdbc.queryForObject(sql, Long.class, arguments));
    }

    private long auditCount(Long advanceId, String operation) {
        return scalar("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=? AND business_domain='HR_ADVANCE' AND business_id=? AND operation_type=?", TENANT, advanceId, operation);
    }

    private static void actor(Long tenantId) {
        TenantContext.setTenantId(tenantId);
        UserContext.setTenantId(tenantId);
        UserContext.setUserId(9100801L);
        UserContext.setUserName("advance-ledger-fixture");
    }

    private static BigDecimal money(String value) { return new BigDecimal(value); }

    private static void equal(String expected, BigDecimal actual, String message) {
        check(actual != null && money(expected).compareTo(actual) == 0, message);
    }

    private static void equal(Object expected, Object actual, String message) {
        check(Objects.equals(expected, actual), message + ": expected=" + expected + ", actual=" + actual);
    }

    private static void check(boolean condition, String message) {
        checks++;
        if (!condition) throw new AssertionError(message);
    }

    private static void rejectBusiness(Runnable operation, String code) {
        checks++;
        try { operation.run(); }
        catch (HrHException expected) {
            if (!code.equals(expected.getCode())) throw new AssertionError("拒绝原因不匹配: " + expected.getCode(), expected);
            return;
        }
        throw new AssertionError("业务边界未拒绝: " + code);
    }

    private static void rejectAmount(Runnable operation) {
        checks++;
        try { operation.run(); }
        catch (IllegalArgumentException expected) { return; }
        throw new AssertionError("非法借款金额未拒绝");
    }

    private record Outcome(boolean success, Long identifier) { }
}
