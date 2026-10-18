package com.cloudflow.hr.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.mapper.HrLeaveLedgerMapper;
import com.cloudflow.hr.mapper.HrLeaveQuotaMapper;
import com.cloudflow.hr.mapper.HrLeaveTypeMapper;
import com.cloudflow.hr.service.HrLeaveBusinessService;
import com.cloudflow.hr.service.HrRuleSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Constructor;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Supplier;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Actual service and SQL date boundaries; single-threaded transaction replaces only the distributed lock. */
public final class HrLeaveExpiryBoundaryChecks {
    private static int checks;
    private static final long TYPE = 995900L;
    private static final long PERIOD = 995900L;
    private static final LocalDate EXPIRY = LocalDate.of(2030, 4, 30);

    public static void main(String[] args) throws Exception {
        if (args.length != 2 || !args[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_settlement_foundation_[a-f0-9]{32}\\?.*")) {
            throw new IllegalArgumentException("Owned scratch database required");
        }
        DriverManagerDataSource data = new DriverManagerDataSource(args[0], "root", "");
        JdbcTemplate jdbc = new JdbcTemplate(data);
        require(Path.of(args[1]).toRealPath().equals(Path.of(Objects.requireNonNull(jdbc.queryForObject("SELECT @@datadir", String.class))).toRealPath()), "owned database");
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig();
        global.setBanner(false); global.setDbConfig(new GlobalConfig.DbConfig()); global.setMetaObjectHandler(new MyMetaObjectHandler());
        GlobalConfigUtils.setGlobalConfig(configuration, global);
        List<Class<?>> mapperTypes = List.of(HrLeaveLedgerMapper.class, HrLeaveQuotaMapper.class, HrLeaveTypeMapper.class);
        for (Class<?> mapper : mapperTypes) configuration.addMapper(mapper);
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(data); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
        SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        HrRuleSupport support = new HrRuleSupport(new DataSourceTransactionManager(data), null, null, null, new ObjectMapper(), null) {
            @Override public <T> T locked(String resource, Supplier<T> action) { return transaction(action); }
        };
        Map<Class<?>, Object> dependencies = new HashMap<>();
        dependencies.put(HrRuleSupport.class, support);
        for (Class<?> mapper : mapperTypes) dependencies.put(mapper, sessions.getMapper(mapper));
        Constructor<?> constructor = HrLeaveBusinessService.class.getConstructors()[0];
        Object[] parameters = new Object[constructor.getParameterCount()];
        for (int index = 0; index < parameters.length; index++) parameters[index] = dependencies.get(constructor.getParameterTypes()[index]);
        HrLeaveBusinessService service = (HrLeaveBusinessService) constructor.newInstance(parameters);
        try {
            actor(100000L);
            require(jdbc.queryForObject("SELECT COUNT(*) FROM hr_leave_ledger WHERE transaction_type='CARRY_FORWARD'", Integer.class) == 0, "clean synthetic carry sample");
            jdbc.update("INSERT INTO hr_leave_type(id,tenant_id,leave_code,leave_name,need_quota,unit,status) VALUES(995900,100000,'D1-EXPIRY','到期边界样本',1,'DAY',1),(995901,100001,'D1-EXPIRY','其他租户样本',1,'DAY',1)");
            jdbc.update("INSERT INTO hr_leave_period(period_id,tenant_id,period_name,start_date,end_date,status) VALUES(995900,100000,'到期边界样本','2030-04-01','2031-03-31','OPEN'),(995901,100001,'其他租户样本','2030-04-01','2031-03-31','OPEN')");
            jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date) VALUES(995901,100000,'D1-EXPIRY-1','到期样本一','UNKNOWN',100,'REGULAR','2029-01-01'),(995902,100000,'D1-EXPIRY-2','到期样本二','UNKNOWN',100,'REGULAR','2029-01-01'),(995903,100000,'D1-EXPIRY-3','到期样本三','UNKNOWN',100,'REGULAR','2029-01-01'),(995904,100001,'D1-EXPIRY-4','到期样本四','UNKNOWN',100,'REGULAR','2029-01-01')");
            entry(jdbc, 9959001L, 100000L, 995901L, "CARRY_FORWARD", "2");
            entry(jdbc, 9959002L, 100000L, 995902L, "ALLOCATION", "10");
            entry(jdbc, 9959003L, 100000L, 995902L, "CARRY_FORWARD", "2");
            entry(jdbc, 9959004L, 100000L, 995902L, "APPLICATION", "-1");
            entry(jdbc, 9959005L, 100000L, 995903L, "CARRY_FORWARD", "2");
            entry(jdbc, 9959006L, 100000L, 995903L, "FREEZE", "-1");
            entry(jdbc, 9959007L, 100001L, 995904L, "CARRY_FORWARD", "2");
            List<Map<String, Object>> original = jdbc.queryForList("SELECT * FROM hr_leave_ledger ORDER BY ledger_id");
            List<Map<String, Object>> originalQuotas = jdbc.queryForList("SELECT * FROM hr_leave_quota ORDER BY id");
            require(service.expireCarryForward(EXPIRY.minusDays(1)) == 0, "day before expiry preserves entitlement");
            require(service.expireCarryForward(EXPIRY) == 0, "expiry date remains usable through that day");
            require(original.equals(jdbc.queryForList("SELECT * FROM hr_leave_ledger ORDER BY ledger_id")), "before and on expiry have no ledger writes");
            require(originalQuotas.equals(jdbc.queryForList("SELECT * FROM hr_leave_quota ORDER BY id")), "before and on expiry have no quota writes");
            require(service.expireCarryForward(EXPIRY.plusDays(1)) == 3, "next day expires three remaining credits");
            expiry(jdbc, 9959001L, "-2", 1);
            expiry(jdbc, 9959003L, "-1", 1);
            expiry(jdbc, 9959005L, "-1", 1);
            balance(jdbc, 995901L, "0", "0");
            balance(jdbc, 995902L, "10", "0");
            balance(jdbc, 995903L, "0", "1");
            require(jdbc.queryForObject("SELECT COUNT(*) FROM hr_leave_ledger WHERE tenant_id=100001", Integer.class) == 1, "other tenant untouched");
            require(service.expireCarryForward(EXPIRY.plusDays(1)) == 0, "same date repeat adds no expiry");
            long releasedId = Objects.requireNonNull(jdbc.queryForObject("SELECT MAX(ledger_id)+1 FROM hr_leave_ledger", Long.class));
            entry(jdbc, releasedId, 100000L, 995903L, "UNFREEZE", "1");
            require(service.expireCarryForward(EXPIRY.plusDays(2)) == 1, "released expired reservation is processed once");
            expiry(jdbc, 9959005L, "-2", 2);
            balance(jdbc, 995903L, "0", "0");
            require(service.expireCarryForward(EXPIRY.plusDays(2)) == 0, "released expiry repeat adds no debit");
            actor(100001L);
            require(service.expireCarryForward(EXPIRY.plusDays(1)) == 1, "other tenant processes its own credit");
            expiry(jdbc, 9959007L, "-2", 1);
            require(original.equals(jdbc.queryForList("SELECT * FROM hr_leave_ledger WHERE ledger_id<=9959007 ORDER BY ledger_id")), "all original ledger rows immutable");
            require(jdbc.queryForObject("SELECT COUNT(*) FROM hr_leave_quota q WHERE q.employee_id BETWEEN 995901 AND 995904 AND q.available_quota<>(SELECT SUM(l.leave_days) FROM hr_leave_ledger l WHERE l.tenant_id=q.tenant_id AND l.employee_id=q.employee_id AND l.leave_type_id=q.leave_type_id AND l.leave_period_id=q.period_id)", Integer.class) == 0, "final balances equal actual ledger sums");
            System.out.println("D1_EXPIRY_BOUNDARIES: checks=" + checks + "; before=0; on=0; next=3; released=1; other_tenant=1; original_rows_changed=0; actual_mysql=true; actual_service=true; distributed_lock=false; http=false; operating_system_clock_changed=false");
        } finally { UserContext.clear(); TenantContext.clear(); }
    }

    private static void entry(JdbcTemplate jdbc, long ledger, long tenant, long employee, String kind, String quantity) {
        jdbc.update("INSERT INTO hr_leave_ledger(ledger_id,tenant_id,employee_id,leave_type_id,leave_period_id,transaction_type,leave_days,quantity_unit,from_date,to_date) VALUES(?,?,?,?,?,?,?,'DAY','2030-04-01',?)",
                ledger, tenant, employee, tenant == 100000L ? TYPE : TYPE + 1, tenant == 100000L ? PERIOD : PERIOD + 1, kind, new BigDecimal(quantity), "CARRY_FORWARD".equals(kind) ? EXPIRY : LocalDate.of(2031, 3, 31));
    }

    private static void expiry(JdbcTemplate jdbc, long credit, String quantity, int count) {
        require(jdbc.queryForObject("SELECT COUNT(*) FROM hr_leave_ledger WHERE transaction_type='EXPIRY' AND source_biz_type='LEAVE_LEDGER' AND source_biz_id=?", Integer.class, Long.toString(credit)) == count, "expiry source link count");
        require(new BigDecimal(quantity).compareTo(Objects.requireNonNull(jdbc.queryForObject("SELECT SUM(leave_days) FROM hr_leave_ledger WHERE transaction_type='EXPIRY' AND source_biz_type='LEAVE_LEDGER' AND source_biz_id=?", BigDecimal.class, Long.toString(credit)))) == 0, "expiry only consumes original unspent credit");
    }

    private static void balance(JdbcTemplate jdbc, long employee, String available, String frozen) {
        require(new BigDecimal(available).compareTo(Objects.requireNonNull(jdbc.queryForObject("SELECT available_quota FROM hr_leave_quota WHERE employee_id=?", BigDecimal.class, employee))) == 0, "available quota");
        require(new BigDecimal(frozen).compareTo(Objects.requireNonNull(jdbc.queryForObject("SELECT frozen_quota FROM hr_leave_quota WHERE employee_id=?", BigDecimal.class, employee))) == 0, "pending reservation remains protected");
    }

    private static void actor(long tenant) {
        TenantContext.setTenantId(tenant); UserContext.setTenantId(tenant); UserContext.setUserId(995900L); UserContext.setUserName("d1-expiry-check"); UserContext.setDsType(0);
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }
}
