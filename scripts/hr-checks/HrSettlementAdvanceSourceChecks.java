package com.cloudflow.hr.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.entity.HrEmployeeAdvance;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.mapper.HrAdvanceRepaymentMapper;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.cloudflow.hr.mapper.HrSalarySlipMapper;
import com.cloudflow.hr.service.HrAdvanceLedgerService;
import com.cloudflow.hr.service.HrHException;
import com.cloudflow.hr.service.HrHSupport;
import com.cloudflow.hr.service.HrSettlementAdvanceSource;
import com.cloudflow.hr.service.HrSettlementPayrollSource;
import com.cloudflow.hr.service.impl.HrEssServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.lang.reflect.Constructor;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;

public final class HrSettlementAdvanceSourceChecks {
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static final Long EMPLOYEE = 992001L;
    private static final Long ADVANCE = 992010L;
    private static final Long SETTLEMENT = 992020L;
    private static final LocalDate EXIT = LocalDate.of(2026, 9, 30);
    private static int checks;
    private final HrSettlementAdvanceSource sources;
    private final HrSalarySlipMapper salaries;
    private final HrEssServiceImpl ess;
    private final JdbcTemplate jdbc;
    private boolean permitted = true;

    private HrSettlementAdvanceSourceChecks(HikariDataSource data) throws Exception {
        jdbc = new JdbcTemplate(data);
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true); configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        configuration.addMapper(HrSalarySlipMapper.class); configuration.addMapper(HrEmployeeAdvanceMapper.class);
        configuration.addMapper(HrAdvanceRepaymentMapper.class);
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(data); factory.setConfiguration(configuration);
        factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        salaries = sessions.getMapper(HrSalarySlipMapper.class);
        Constructor<?> constructor = HrEssServiceImpl.class.getConstructors()[0];
        Class<?>[] types = constructor.getParameterTypes(); Object[] parameters = new Object[types.length];
        for (int index = 0; index < types.length; index++) if (types[index] == ObjectMapper.class) parameters[index] = JSON;
        ess = (HrEssServiceImpl) constructor.newInstance(parameters);
        HrHSupport access = new HrHSupport(null, null, null, null, null, null, null, null, null, JSON, null) {
            @Override public void permission(String permission) { if (!permitted || !"hr:settlement:calculate".equals(permission)) throw HrHException.forbidden(); }
            @Override public void scope(Long employeeId) { if (!EMPLOYEE.equals(employeeId)) throw HrHException.forbidden(); }
        };
        HrEmployeeAdvanceMapper advances = sessions.getMapper(HrEmployeeAdvanceMapper.class);
        sources = new HrSettlementAdvanceSource(advances, new HrAdvanceLedgerService(advances,
                sessions.getMapper(HrAdvanceRepaymentMapper.class), null), new HrSettlementPayrollSource(salaries, ess, access, JSON), access, JSON);
        equal(0, inspect().loans().size(), "empty real sources"); equal(0, inspect().issues().size(), "empty real sources have no artificial missing policy");
        advances.insert(advance(ADVANCE, 100000L, EMPLOYEE));
        advances.insert(advance(992011L, 100000L, 992002L));
        UserContext.setTenantId(100001L); TenantContext.setTenantId(100001L);
        advances.insert(advance(992012L, 100001L, EMPLOYEE));
        UserContext.setTenantId(100000L); TenantContext.setTenantId(100000L);
        HrEmployeeAdvance pending = advance(992013L, 100000L, EMPLOYEE); pending.setPaidTime(null);
        pending.setStatus("APPROVED"); pending.setOutstandingAmount(BigDecimal.ZERO); advances.insert(pending);
        equal(1, inspect().loans().size(), "foreign/other employee/not yet funded loans excluded");
        equal("1000.00", inspect().loans().get(0).amount(), "funded principal only");
        jdbc.update("INSERT INTO hr_advance_repayment(repayment_id,tenant_id,advance_id,repay_amount,repay_type,status,source_event_key,repay_date,posted_time) VALUES(992040,100000,992010,200,'MANUAL','POSTED','MANUAL:source-check','2026-09-02','2026-09-02 10:00:00')");
        jdbc.update("UPDATE hr_employee_advance SET repaid_amount=200,outstanding_amount=800,status='REPAYING' WHERE advance_id=992010");
        equal("800.00", inspect().loans().get(0).amount(), "actual repayments reduce collectible principal");
        salaries.insert(wage(992030L, "100.00")); salaries.insert(wage(992031L, "75.00"));
        jdbc.update("INSERT INTO hr_advance_repayment(repayment_id,tenant_id,advance_id,repay_amount,repay_type,status,source_event_key,salary_slip_id,repay_month) VALUES(992041,100000,992010,100,'SALARY','RESERVED','SALARY:992030:ADVANCE:992010',992030,'2026-09'),(992042,100000,992010,75,'SALARY','RESERVED','SALARY:992031:ADVANCE:992010',992031,'2026-09')");
        jdbc.update("UPDATE hr_employee_advance SET reserved_amount=175 WHERE advance_id=992010");
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2 || !args[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_settlement_foundation_[a-f0-9]{32}\\?.*")) throw new IllegalArgumentException("Owned scratch database required");
        UserContext.setTenantId(100000L); TenantContext.setTenantId(100000L);
        try (HikariDataSource data = new HikariDataSource()) {
            data.setJdbcUrl(args[0]); data.setUsername("root"); data.setPassword(""); data.setMaximumPoolSize(2);
            equal(Path.of(args[1]).toRealPath(), Path.of(new JdbcTemplate(data).queryForObject("SELECT @@datadir", String.class)).toRealPath(), "owned actual database");
            HrSettlementAdvanceSourceChecks suite = new HrSettlementAdvanceSourceChecks(data);
            suite.validSources(); suite.boundaries(); suite.salaryBoundaries(); suite.amountBoundaries();
            System.out.println("H2_SETTLEMENT_ADVANCE_SOURCE_DATABASE: checks=" + checks + "; failed=0; actual_mysql=true; actual_mappers=true; actual_ledger_check=true; actual_salary_digest=true; read_only=true; funding_reservation_fixture=true; permission_scope_fixture=true; settlement_posting=false; http=false");
        } finally { UserContext.clear(); TenantContext.clear(); }
    }

    private void validSources() {
        HrSettlementAdvanceSource.Inspection result = inspect();
        equal(0, result.issues().size(), "valid cross-source reconciliation"); equal(1, result.loans().size(), "one actual loan");
        equal("625.00", result.loans().get(0).amount(), "salary deductions not collected twice");
        equal("175.00", result.loans().get(0).payrollReserved(), "two wages reconcile to reserved principal");
        BigDecimal wages = result.payroll().unpaid().stream().map(row -> new BigDecimal(row.amount())).reduce(BigDecimal.ZERO, BigDecimal::add);
        equal(new BigDecimal("1200.00"), wages.subtract(new BigDecimal(result.loans().get(0).amount())), "2000 gross less 800 actual remaining loan equals settlement net");
        equal("200.00", result.loans().get(0).evidence().path("repaid").asText(), "posted repayment evidence retained");
        equal(2, result.loans().get(0).evidence().path("reservations").size(), "each payroll reservation retained");
        List<Map<String, Object>> before = jdbc.queryForList("SELECT * FROM hr_employee_advance WHERE advance_id=992010");
        List<Map<String, Object>> entries = jdbc.queryForList("SELECT * FROM hr_advance_repayment WHERE advance_id=992010 ORDER BY repayment_id");
        inspect(); inspect();
        equal(before, jdbc.queryForList("SELECT * FROM hr_employee_advance WHERE advance_id=992010"), "repeated source refresh does not change principal/version");
        equal(entries, jdbc.queryForList("SELECT * FROM hr_advance_repayment WHERE advance_id=992010 ORDER BY repayment_id"), "read only preserves actual and reserved entries");
        jdbc.update("INSERT INTO hr_advance_repayment(repayment_id,tenant_id,advance_id,repay_amount,repay_type,status,source_event_key,settlement_id) VALUES(992043,100000,992010,625,'SETTLEMENT','RESERVED','SETTLEMENT:992020:ADVANCE:992010',992020)");
        jdbc.update("UPDATE hr_employee_advance SET reserved_amount=800 WHERE advance_id=992010");
        equal(0, inspect().issues().size(), "own matching reservation may refresh");
        equal("625.00", inspect().loans().get(0).amount(), "own reservation not subtracted a second time");
        has("SETTLEMENT_ADVANCE_RESERVED", sources.inspect(EMPLOYEE, EXIT, 992021L), "other settlement blocked");
        has("SETTLEMENT_ADVANCE_RESERVED", sources.inspect(EMPLOYEE, EXIT, null), "new settlement cannot reuse reservation");
        jdbc.update("UPDATE hr_advance_repayment SET repay_amount=624 WHERE repayment_id=992043");
        jdbc.update("UPDATE hr_employee_advance SET reserved_amount=799 WHERE advance_id=992010");
        has("SETTLEMENT_ADVANCE_RESERVATION_CHANGED", inspect(), "own reservation must still cover current balance");
        jdbc.update("UPDATE hr_advance_repayment SET status='RELEASED' WHERE repayment_id=992043");
        jdbc.update("UPDATE hr_employee_advance SET reserved_amount=175 WHERE advance_id=992010");
        equal(0, inspect().issues().size(), "released settlement reservation no longer occupies principal");
    }

    private void boundaries() {
        jdbc.update("UPDATE hr_employee_advance SET reserved_amount=174 WHERE advance_id=992010");
        has("ADVANCE_LEDGER_MISMATCH", inspect(), "summary differs from actual ledger");
        jdbc.update("UPDATE hr_employee_advance SET reserved_amount=175,paid_time=NULL WHERE advance_id=992010");
        has("ADVANCE_NOT_FUNDED", inspect(), "missing funding evidence blocked");
        jdbc.update("UPDATE hr_employee_advance SET paid_time='2026-10-01 10:00:00' WHERE advance_id=992010");
        has("SETTLEMENT_ADVANCE_EVIDENCE_INVALID", inspect(), "funding after exit blocked");
        jdbc.update("UPDATE hr_employee_advance SET paid_time='2026-09-01 10:00:00',advance_amount=999 WHERE advance_id=992010");
        has("SETTLEMENT_ADVANCE_AMOUNT_INVALID", inspect(), "funding equation must hold");
        jdbc.update("UPDATE hr_employee_advance SET advance_amount=1000 WHERE advance_id=992010");
        jdbc.update("UPDATE hr_advance_repayment SET source_event_key='SALARY:wrong' WHERE repayment_id=992041");
        rejectedSourceUnchanged("ADVANCE_SALARY_CHAIN_INVALID", "event identity verified");
        jdbc.update("UPDATE hr_advance_repayment SET source_event_key='SALARY:992030:ADVANCE:992010',settlement_id=992020 WHERE repayment_id=992041");
        rejectedSourceUnchanged("SETTLEMENT_ADVANCE_SALARY_MISMATCH", "mixed salary settlement identity blocked");
        jdbc.update("UPDATE hr_advance_repayment SET settlement_id=NULL,repay_month='2026-08' WHERE repayment_id=992041");
        rejectedSourceUnchanged("SETTLEMENT_ADVANCE_SALARY_MISMATCH", "month identity verified");
        jdbc.update("UPDATE hr_advance_repayment SET repay_month='2026-09',repay_amount=99 WHERE repayment_id=992041");
        jdbc.update("UPDATE hr_employee_advance SET reserved_amount=174 WHERE advance_id=992010");
        rejectedSourceUnchanged("SETTLEMENT_ADVANCE_SALARY_MISMATCH", "matching summary alone cannot authorize wrong payroll amount");
        jdbc.update("UPDATE hr_advance_repayment SET repay_amount=100,status='RELEASED' WHERE repayment_id=992041");
        jdbc.update("UPDATE hr_employee_advance SET reserved_amount=75 WHERE advance_id=992010");
        has("SETTLEMENT_ADVANCE_RESERVATION_MISSING", inspect(), "payroll cannot subtract released reservation");
        jdbc.update("UPDATE hr_advance_repayment SET status='RESERVED' WHERE repayment_id=992041");
        jdbc.update("UPDATE hr_employee_advance SET reserved_amount=175 WHERE advance_id=992010");
        permitted = false; rejects(() -> inspect(), "permission required"); permitted = true;
        rejects(() -> sources.inspect(992002L, EXIT, SETTLEMENT), "employee scope required");
        rejects(() -> sources.inspect(EMPLOYEE, EXIT, 0L), "invalid settlement identity");
        equal(0, inspect().issues().size(), "valid baseline restored");
    }

    private void salaryBoundaries() {
        jdbc.update("UPDATE hr_salary_slip SET status='DRAFT' WHERE id=992030");
        has("SETTLEMENT_SALARY_PENDING", inspect(), "unfinished wage retained as issue");
        has("SETTLEMENT_ADVANCE_SALARY_EXCLUDED", inspect(), "cannot deduct reservation absent from imported wages");
        jdbc.update("UPDATE hr_salary_slip SET status='SUBMITTED',reserved_settlement_id=992021 WHERE id=992030");
        has("SETTLEMENT_SALARY_RESERVED", inspect(), "salary reserved by other settlement");
        jdbc.update("UPDATE hr_salary_slip SET reserved_settlement_id=NULL,net_total=899 WHERE id=992030");
        has("SETTLEMENT_SALARY_TAMPERED", inspect(), "sealed payroll tampering propagates");
        jdbc.update("UPDATE hr_salary_slip SET net_total=900 WHERE id=992030");
        HrSalarySlip row = salaries.selectById(992030L);
        List<Map<String, Object>> original = new ArrayList<>(row.getComponents());
        row.setComponents(List.of(original.get(0), original.get(1), original.get(1))); save(row);
        has("SETTLEMENT_ADVANCE_COMPONENT_INVALID", inspect(), "duplicate loan deduction rejected");
        for (Map<String, Object> component : List.<Map<String, Object>>of(
                Map.of("type", "ADDITION", "sourceBizType", "HR_ADVANCE", "advanceId", "992010", "amount", "100.00"),
                Map.of("type", "DEDUCTION", "sourceBizType", "HR_ADVANCE", "advanceId", "9223372036854775808", "amount", "100.00"),
                Map.of("type", "DEDUCTION", "sourceBizType", "HR_ADVANCE", "advanceId", "992010", "amount", "100.001"),
                Map.of("type", "DEDUCTION", "sourceBizType", "HR_ADVANCE", "advanceId", "992010", "amount", "-100.00"))) {
            row.setComponents(List.of(original.get(0), component)); save(row);
            has("SETTLEMENT_ADVANCE_COMPONENT_INVALID", inspect(), "invalid original component cannot supply reservation");
        }
        for (String missing : List.of("992011", "992012", "992099")) {
            row.setComponents(List.of(original.get(0), Map.of("type", "DEDUCTION", "sourceBizType", "HR_ADVANCE", "advanceId", missing, "amount", "100.00"))); save(row);
            has("SETTLEMENT_ADVANCE_SOURCE_MISSING", inspect(), "other employee/tenant/missing loan cannot be imported");
        }
        row.setComponents(List.of(original.get(0), Map.of("type", "DEDUCTION", "sourceBizType", "HR_ADVANCE_REVERSAL", "advanceId", "992010", "amount", "-100.00"))); save(row);
        has("SETTLEMENT_ADVANCE_CORRECTION_PENDING", inspect(), "unpaid reversal cannot silently use pre-refund balance");
        row.setComponents(original); save(row);
        equal(0, inspect().issues().size(), "all source cases restore valid records");
    }

    private HrSettlementAdvanceSource.Inspection inspect() { return sources.inspect(EMPLOYEE, EXIT, SETTLEMENT); }

    private void rejectedSourceUnchanged(String code, String label) {
        List<Map<String, Object>> balances = jdbc.queryForList("SELECT * FROM hr_employee_advance WHERE advance_id=992010");
        List<Map<String, Object>> entries = jdbc.queryForList("SELECT * FROM hr_advance_repayment WHERE advance_id=992010 ORDER BY repayment_id");
        List<Map<String, Object>> wages = jdbc.queryForList("SELECT * FROM hr_salary_slip WHERE id IN (992030,992031) ORDER BY id");
        HrSettlementAdvanceSource.Inspection result = inspect();
        has(code, result, label);
        equal(true, result.loans().stream().noneMatch(loan -> ADVANCE.equals(loan.advanceId())), label + " does not expose an eligible loan");
        equal(balances, jdbc.queryForList("SELECT * FROM hr_employee_advance WHERE advance_id=992010"), label + " preserves balances and version");
        equal(entries, jdbc.queryForList("SELECT * FROM hr_advance_repayment WHERE advance_id=992010 ORDER BY repayment_id"), label + " preserves actual and reserved repayments");
        equal(wages, jdbc.queryForList("SELECT * FROM hr_salary_slip WHERE id IN (992030,992031) ORDER BY id"), label + " preserves salary evidence and amounts");
    }

    private void amountBoundaries() {
        jdbc.update("UPDATE hr_employee_advance SET written_off_amount=100,outstanding_amount=700 WHERE advance_id=992010");
        equal("525.00", inspect().loans().get(0).amount(), "authorized writeoff is not collected again");
        jdbc.update("UPDATE hr_employee_advance SET written_off_amount=625,outstanding_amount=175 WHERE advance_id=992010");
        equal(0, inspect().issues().size(), "fully payroll-reserved outstanding is valid");
        equal("0.00", inspect().loans().get(0).amount(), "zero direct collection retains loan source");
        equal("175.00", inspect().loans().get(0).payrollReserved(), "zero direct collection still has payroll posting evidence");
        jdbc.update("UPDATE hr_employee_advance SET written_off_amount=0,outstanding_amount=800 WHERE advance_id=992010");
        jdbc.update("UPDATE hr_salary_slip SET status='PAID' WHERE id IN (992030,992031)");
        jdbc.update("UPDATE hr_advance_repayment SET status='POSTED',repay_date='2026-09-30',posted_time='2026-09-30 10:00:00' WHERE repayment_id IN (992041,992042)");
        jdbc.update("UPDATE hr_employee_advance SET reserved_amount=0,repaid_amount=375,outstanding_amount=625 WHERE advance_id=992010");
        equal(0, inspect().issues().size(), "paid payroll has actual posted entries");
        equal("625.00", inspect().loans().get(0).amount(), "posted salary repayment uses remaining principal once");
        equal(0, inspect().payroll().unpaid().size(), "paid salary no longer imported");
        jdbc.update("UPDATE hr_employee_advance SET advance_amount=999999999999.99,outstanding_amount=999999999624.99 WHERE advance_id=992010");
        equal("999999999624.99", inspect().loans().get(0).amount(), "maximum principal remains exact after repayment");
        jdbc.update("UPDATE hr_employee_advance SET advance_amount=1000,written_off_amount=625,outstanding_amount=0,status='WRITTEN_OFF' WHERE advance_id=992010");
        equal(0, inspect().loans().size(), "fully settled written-off principal not collected");
        equal(0, inspect().issues().size(), "closed balance still checked against actual entries");
    }
    private void save(HrSalarySlip row) { ess.sealSalarySlip(row); equal(1, salaries.updateById(row), "test source snapshot saved"); }
    private static HrEmployeeAdvance advance(Long id, Long tenantId, Long employeeId) {
        HrEmployeeAdvance row = new HrEmployeeAdvance(); row.setAdvanceId(id); row.setTenantId(tenantId); row.setEmployeeId(employeeId);
        row.setAdvanceNo("SOURCE-" + id); row.setPurpose("隔离来源核验"); row.setApplyDate(LocalDate.of(2026, 9, 1));
        row.setAdvanceAmount(new BigDecimal("1000.00")); row.setRepaidAmount(BigDecimal.ZERO); row.setOutstandingAmount(new BigDecimal("1000.00"));
        row.setReservedAmount(BigDecimal.ZERO); row.setWrittenOffAmount(BigDecimal.ZERO); row.setRepayMode("LUMP_SUM");
        row.setStatus("PAID"); row.setApprovalStatus("APPROVED"); row.setPaymentRequestId(id + 100);
        row.setPaidTime(LocalDateTime.of(2026, 9, 1, 10, 0)); row.setVersion(0);
        row.setCreateTime(LocalDateTime.of(2026, 9, 1, 10, 0)); row.setUpdateTime(row.getCreateTime()); return row;
    }
    private HrSalarySlip wage(Long id, String deducted) {
        HrSalarySlip row = new HrSalarySlip(); row.setId(id); row.setTenantId(100000L); row.setEmployeeId(EMPLOYEE);
        row.setPeriodMonth("2026-09"); row.setStatus("SUBMITTED"); row.setVersion(0); row.setDeleted(0); row.setEmployeeConfirmed(false); row.setPayDate(EXIT);
        row.setTaxAmount(BigDecimal.ZERO); row.setBenefitAmount(BigDecimal.ZERO); row.setCurrentTax(BigDecimal.ZERO);
        row.setCumulativeTaxableIncome(BigDecimal.ZERO); row.setCumulativeDeduction(BigDecimal.ZERO);
        row.setCumulativeTaxPayable(BigDecimal.ZERO); row.setCumulativeTaxPaid(BigDecimal.ZERO);
        row.setGrossTotal(new BigDecimal("1000.00")); row.setDeductionTotal(new BigDecimal(deducted)); row.setNetTotal(row.getGrossTotal().subtract(row.getDeductionTotal()));
        row.setComponents(List.of(Map.of("type", "TAX_SNAPSHOT", "periodStart", "2026-09-01", "periodEnd", "2026-09-30", "amount", "0.00"),
                Map.of("type", "DEDUCTION", "sourceBizType", "HR_ADVANCE", "advanceId", ADVANCE.toString(), "amount", deducted)));
        ess.sealSalarySlip(row); return row;
    }
    private static void has(String code, HrSettlementAdvanceSource.Inspection result, String label) {
        equal(true, result.issues().stream().anyMatch(issue -> code.equals(issue.code())), label + " codes=" + result.issues().stream().map(HrSettlementAdvanceSource.Issue::code).toList());
    }
    private static void rejects(Runnable action, String label) {
        boolean rejected = false; try { action.run(); } catch (HrHException expected) { rejected = true; } equal(true, rejected, label);
    }
    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + ", actual=" + actual); checks++;
    }
}
