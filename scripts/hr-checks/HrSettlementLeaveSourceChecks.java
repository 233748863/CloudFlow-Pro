package com.cloudflow.hr.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.mapper.HrEarnedLeaveScheduleMapper;
import com.cloudflow.hr.mapper.HrLeaveLedgerMapper;
import com.cloudflow.hr.mapper.HrLeavePeriodMapper;
import com.cloudflow.hr.mapper.HrLeaveQuotaMapper;
import com.cloudflow.hr.mapper.HrLeaveTypeMapper;
import com.cloudflow.hr.service.HrHException;
import com.cloudflow.hr.service.HrHSupport;
import com.cloudflow.hr.service.HrSettlementLeaveSource;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;

public final class HrSettlementLeaveSourceChecks {
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static final Long EMPLOYEE = 993001L;
    private static final Long SETTLEMENT = 993090L;
    private static final LocalDate EXIT = LocalDate.of(2026, 9, 30);
    private static int checks;
    private final JdbcTemplate jdbc;
    private final HrSettlementLeaveSource source;
    private boolean permitted = true;

    private HrSettlementLeaveSourceChecks(HikariDataSource data) throws Exception {
        jdbc = new JdbcTemplate(data);
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true); configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        for (Class<?> mapper : List.of(HrLeaveLedgerMapper.class, HrLeaveQuotaMapper.class, HrLeaveTypeMapper.class,
                HrLeavePeriodMapper.class, HrEarnedLeaveScheduleMapper.class)) configuration.addMapper(mapper);
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(data); factory.setConfiguration(configuration);
        factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        HrHSupport access = new HrHSupport(null, null, null, null, null, null, null, null, null, JSON, null) {
            @Override public void permission(String permission) { if (!permitted || !"hr:settlement:calculate".equals(permission)) throw HrHException.forbidden(); }
            @Override public void scope(Long employeeId) { if (!EMPLOYEE.equals(employeeId)) throw HrHException.forbidden(); }
        };
        source = new HrSettlementLeaveSource(sessions.getMapper(HrLeaveLedgerMapper.class), sessions.getMapper(HrLeaveQuotaMapper.class),
                sessions.getMapper(HrLeaveTypeMapper.class), sessions.getMapper(HrLeavePeriodMapper.class), sessions.getMapper(HrEarnedLeaveScheduleMapper.class), access, JSON);
        equal(0, inspect().leaves().size(), "empty ledger is an actual empty source");
        jdbc.update("INSERT INTO hr_leave_type(id,tenant_id,leave_code,leave_name,need_quota,unit,encashment_flag,status,version) VALUES (993010,100000,'SOURCE_ANNUAL','年假来源',1,'DAY',1,1,3),(993011,100000,'SOURCE_HOURLY','小时假期',1,'HOUR',1,1,4),(993012,100000,'SOURCE_UNPAID','不可折现',1,'DAY',0,1,0)");
        jdbc.update("INSERT INTO hr_leave_period(period_id,tenant_id,period_name,start_date,end_date,status,version) VALUES(993020,100000,'来源年度','2026-01-01','2026-12-31','OPEN',2)");
        jdbc.update("INSERT INTO hr_leave_quota(id,tenant_id,employee_id,leave_type_id,period_id,total_quota,used_quota,available_quota) VALUES (993030,100000,993001,993010,993020,10,2,8),(993031,100000,993001,993011,993020,24,8,16),(993032,100000,993001,993012,993020,10,0,10),(993033,100000,993002,993010,993020,99,0,99),(993034,100001,993001,993010,993020,99,0,99)");
        jdbc.update("INSERT INTO hr_leave_ledger(ledger_id,tenant_id,employee_id,leave_type_id,leave_period_id,transaction_type,leave_days,quantity_unit) VALUES(993040,100000,993001,993010,993020,'ALLOCATION',10,'DAY'),(993041,100000,993001,993010,993020,'APPLICATION',-2,'DAY'),(993042,100000,993001,993011,993020,'ALLOCATION',24,'HOUR'),(993043,100000,993001,993011,993020,'APPLICATION',-8,'HOUR'),(993044,100000,993002,993010,993020,'ALLOCATION',99,'DAY'),(993045,100001,993001,993010,993020,'ALLOCATION',99,'DAY')");
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2 || !args[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_settlement_foundation_[a-f0-9]{32}\\?.*")) throw new IllegalArgumentException("Owned scratch database required");
        UserContext.setTenantId(100000L); TenantContext.setTenantId(100000L);
        try (HikariDataSource data = new HikariDataSource()) {
            data.setJdbcUrl(args[0]); data.setUsername("root"); data.setPassword(""); data.setMaximumPoolSize(2);
            equal(Path.of(args[1]).toRealPath(), Path.of(new JdbcTemplate(data).queryForObject("SELECT @@datadir", String.class)).toRealPath(), "owned database");
            HrSettlementLeaveSourceChecks suite = new HrSettlementLeaveSourceChecks(data);
            suite.sources(); suite.boundaries(); suite.reservations();
            System.out.println("H2_SETTLEMENT_LEAVE_SOURCE_DATABASE: checks=" + checks + "; failed=0; actual_mysql=true; actual_mappers=true; actual_D1_balance=true; actual_D1_credit_expiry=true; read_only=true; accrual_reservation_fixture=true; permission_scope_fixture=true; monetary_valuation=false; settlement_posting=false; http=false");
        } finally { UserContext.clear(); TenantContext.clear(); }
    }

    private void sources() {
        equal(0, inspect().issues().size(), "valid eligible leave source");
        equal(2, inspect().leaves().size(), "non-encashable/foreign/other employee sources excluded");
        equal("8.00", inspect().leaves().get(0).quantity(), "days reflect actual ledger less consumed quota");
        equal("16.00", inspect().leaves().get(1).quantity(), "hours retained without default workday conversion");
        equal("HOUR", inspect().leaves().get(1).unit(), "hour unit retained");
        equal(3, inspect().leaves().get(0).evidence().path("leaveTypeVersion").asInt(), "type version retained");
        equal(2, inspect().leaves().get(0).evidence().path("ledger").size(), "every immutable source retained");
        List<Map<String, Object>> quota = jdbc.queryForList("SELECT * FROM hr_leave_quota WHERE employee_id=993001 ORDER BY id");
        List<Map<String, Object>> ledger = jdbc.queryForList("SELECT * FROM hr_leave_ledger WHERE employee_id=993001 ORDER BY ledger_id");
        inspect(); inspect();
        equal(quota, jdbc.queryForList("SELECT * FROM hr_leave_quota WHERE employee_id=993001 ORDER BY id"), "source read never rewrites summary");
        equal(ledger, jdbc.queryForList("SELECT * FROM hr_leave_ledger WHERE employee_id=993001 ORDER BY ledger_id"), "source read never books leave");
        permitted = false; reject(() -> inspect(), "permission guard"); permitted = true;
        reject(() -> source.inspect(993002L, EXIT, null), "employee scope guard");
        reject(() -> source.inspect(EMPLOYEE, null, null), "missing exit date rejected");
    }

    private void boundaries() {
        jdbc.update("UPDATE hr_leave_quota SET available_quota=9 WHERE id=993030");
        issue("SETTLEMENT_LEAVE_BALANCE_MISMATCH", "cached balance cannot replace ledger");
        jdbc.update("UPDATE hr_leave_quota SET available_quota=8 WHERE id=993030");
        jdbc.update("UPDATE hr_leave_ledger SET quantity_unit='HOUR' WHERE ledger_id=993040");
        issue("SETTLEMENT_LEAVE_UNIT_MISMATCH", "historical unit changes rejected");
        jdbc.update("UPDATE hr_leave_ledger SET quantity_unit='DAY',transaction_type='UNKNOWN' WHERE ledger_id=993040");
        issue("SETTLEMENT_LEAVE_LEDGER_INVALID", "unknown ledger semantics rejected");
        jdbc.update("UPDATE hr_leave_ledger SET transaction_type='ALLOCATION',reversal_of_id=999999 WHERE ledger_id=993040");
        issue("SETTLEMENT_LEAVE_LEDGER_INVALID", "missing reversal origin rejected");
        jdbc.update("UPDATE hr_leave_ledger SET reversal_of_id=NULL,from_date='2026-10-01' WHERE ledger_id=993040");
        issue("SETTLEMENT_LEAVE_FUTURE_ENTRY", "future entitlement not silently paid");
        jdbc.update("UPDATE hr_leave_ledger SET from_date=NULL WHERE ledger_id=993040");
        jdbc.update("UPDATE hr_leave_period SET status='CLOSED' WHERE period_id=993020");
        issue("SETTLEMENT_LEAVE_PERIOD_PENDING", "closed period with balance requires resolution");
        jdbc.update("UPDATE hr_leave_period SET status='OPEN',start_date='2025-01-01',end_date='2025-12-31' WHERE period_id=993020");
        issue("SETTLEMENT_LEAVE_PERIOD_PENDING", "prior period balance requires carry forward");
        jdbc.update("UPDATE hr_leave_period SET start_date='2027-01-01',end_date='2027-12-31' WHERE period_id=993020");
        equal(0, inspect().leaves().size(), "future leave period excluded"); equal(0, inspect().issues().size(), "future period is not accrued debt");
        jdbc.update("UPDATE hr_leave_period SET start_date='2026-01-01',end_date='2026-12-31' WHERE period_id=993020");
        jdbc.update("UPDATE hr_leave_quota SET expiry_date='2026-09-29' WHERE id=993030");
        issue("SETTLEMENT_LEAVE_EXPIRY_PENDING", "expired quota blocked");
        jdbc.update("UPDATE hr_leave_quota SET expiry_date=NULL WHERE id=993030");
        jdbc.update("UPDATE hr_leave_ledger SET transaction_type='CARRY_FORWARD',to_date='2026-09-29' WHERE ledger_id=993040");
        issue("SETTLEMENT_LEAVE_EXPIRY_PENDING", "unconsumed expired carry-forward blocked");
        jdbc.update("UPDATE hr_leave_ledger SET transaction_type='ALLOCATION',to_date=NULL WHERE ledger_id=993040");
        jdbc.update("INSERT INTO hr_earned_leave_schedule(schedule_id,tenant_id,employee_id,leave_type_id,leave_period_id,schedule_date,earned_days,executed_flag) VALUES (993050,100000,993001,993010,993020,'2026-09-01',1,0)");
        issue("SETTLEMENT_LEAVE_ACCRUAL_PENDING", "due accrual must be posted first");
        jdbc.update("UPDATE hr_earned_leave_schedule SET schedule_date='2026-10-01' WHERE schedule_id=993050");
        equal(0, inspect().issues().size(), "future accrual excluded");
        jdbc.update("UPDATE hr_leave_ledger SET leave_days=1 WHERE ledger_id=993040");
        jdbc.update("UPDATE hr_leave_quota SET total_quota=1,available_quota=-1 WHERE id=993030");
        issue("SETTLEMENT_LEAVE_NEGATIVE", "negative allowance needs explicit handling");
        jdbc.update("UPDATE hr_leave_ledger SET leave_days=999999.99 WHERE ledger_id=993040");
        jdbc.update("UPDATE hr_leave_quota SET total_quota=999999.99,available_quota=999997.99 WHERE id=993030");
        equal("999997.99", inspect().leaves().get(0).quantity(), "quantity capacity exact");
        jdbc.update("UPDATE hr_leave_ledger SET leave_days=10 WHERE ledger_id=993040");
        jdbc.update("UPDATE hr_leave_quota SET total_quota=10,available_quota=8 WHERE id=993030");
        equal(0, inspect().issues().size(), "baseline restored");
    }

    private void reservations() {
        jdbc.update("INSERT INTO hr_leave_ledger(ledger_id,tenant_id,employee_id,leave_type_id,leave_period_id,transaction_type,leave_days,quantity_unit,source_biz_type,source_biz_id,source_event_key) VALUES(993060,100000,993001,993010,993020,'FREEZE',-8,'DAY','HR_SETTLEMENT','993090','HR_SETTLEMENT:993090:LEAVE:993010:993020:R1:FREEZE')");
        jdbc.update("UPDATE hr_leave_quota SET frozen_quota=8,available_quota=0 WHERE id=993030");
        issue("SETTLEMENT_LEAVE_RESERVED", "other settlement freeze blocks source");
        equal(0, source.inspect(EMPLOYEE, EXIT, SETTLEMENT).issues().size(), "own freeze refresh allowed");
        equal("8.00", source.inspect(EMPLOYEE, EXIT, SETTLEMENT).leaves().get(0).quantity(), "own frozen quantity not subtracted twice");
        jdbc.update("UPDATE hr_leave_ledger SET transaction_type='CARRY_FORWARD',to_date='2026-09-29' WHERE ledger_id=993040");
        equal(true, source.inspect(EMPLOYEE, EXIT, SETTLEMENT).issues().stream().anyMatch(row -> row.code().equals("SETTLEMENT_LEAVE_EXPIRY_PENDING")), "own freeze cannot hide expired credit");
        jdbc.update("UPDATE hr_leave_ledger SET transaction_type='ALLOCATION',to_date=NULL WHERE ledger_id=993040");
        jdbc.update("UPDATE hr_leave_ledger SET leave_days=-7 WHERE ledger_id=993060");
        jdbc.update("UPDATE hr_leave_quota SET frozen_quota=7,available_quota=1 WHERE id=993030");
        equal(true, source.inspect(EMPLOYEE, EXIT, SETTLEMENT).issues().stream().anyMatch(row -> row.code().equals("SETTLEMENT_LEAVE_RESERVATION_CHANGED")), "own freeze must cover unchanged full source");
        jdbc.update("UPDATE hr_leave_ledger SET leave_days=-8 WHERE ledger_id=993060");
        jdbc.update("INSERT INTO hr_leave_ledger(ledger_id,tenant_id,employee_id,leave_type_id,leave_period_id,transaction_type,leave_days,quantity_unit,source_biz_type,source_biz_id,source_event_key) VALUES(993061,100000,993001,993010,993020,'UNFREEZE',8,'DAY','HR_SETTLEMENT','993090','HR_SETTLEMENT:993090:LEAVE:993010:993020:R1:UNFREEZE')");
        jdbc.update("UPDATE hr_leave_quota SET frozen_quota=0,available_quota=8 WHERE id=993030");
        equal(0, source.inspect(EMPLOYEE, EXIT, SETTLEMENT).issues().size(), "release preserves original freeze and allows refresh");
        jdbc.update("INSERT INTO hr_leave_ledger(ledger_id,tenant_id,employee_id,leave_type_id,leave_period_id,transaction_type,leave_days,quantity_unit,source_biz_type,source_biz_id,source_event_key) VALUES(993062,100000,993001,993010,993020,'FREEZE',-8,'DAY','HR_SETTLEMENT','993090','HR_SETTLEMENT:993090:LEAVE:993010:993020:R2:FREEZE')");
        jdbc.update("UPDATE hr_leave_quota SET frozen_quota=8,available_quota=0 WHERE id=993030");
        equal("8.00", source.inspect(EMPLOYEE, EXIT, SETTLEMENT).leaves().get(0).quantity(), "resubmission uses a new reservation cycle without deleting original facts");
        jdbc.update("UPDATE hr_leave_ledger SET leave_days=7 WHERE ledger_id=993061");
        jdbc.update("UPDATE hr_leave_quota SET frozen_quota=9,available_quota=-1 WHERE id=993030");
        equal(true, source.inspect(EMPLOYEE, EXIT, SETTLEMENT).issues().stream().anyMatch(row -> row.code().equals("SETTLEMENT_LEAVE_RESERVATION_INVALID")), "release must match its own original cycle");
    }

    private HrSettlementLeaveSource.Inspection inspect() { return source.inspect(EMPLOYEE, EXIT, null); }
    private void issue(String code, String label) {
        List<String> codes = inspect().issues().stream().map(HrSettlementLeaveSource.Issue::code).toList();
        equal(true, codes.contains(code), label + " codes=" + codes);
    }
    private static void reject(Runnable action, String label) { boolean rejected = false; try { action.run(); } catch (HrHException expected) { rejected = true; } equal(true, rejected, label); }
    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + ", actual=" + actual); checks++;
    }
}
