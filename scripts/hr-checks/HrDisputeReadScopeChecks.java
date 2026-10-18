package com.cloudflow.hr.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.entity.HrLaborDispute;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrAuditLogMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrGrievanceMapper;
import com.cloudflow.hr.mapper.HrLaborDisputeMapper;
import com.cloudflow.hr.service.HrAppraisalGuard;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.HrGrievanceAccessService;
import com.cloudflow.hr.service.HrRuleSupport;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.context.support.StaticApplicationContext;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Real MySQL, production mappers/scopes/masking; all fixture rows are rolled back. */
public final class HrDisputeReadScopeChecks {
    private static int checks;
    private static final long TENANT = 198206001L;
    private static final long FOREIGN = 198206002L;
    private static final long HANDLER = 198206003L;
    private static final long APPLICANT = 198206004L;
    private static final String PHONE = "+8613812345678";
    private final String marker = "D4-SCOPE-" + UUID.randomUUID();
    private final JdbcTemplate jdbc;
    private final HrTypedCrudService crud;
    private final HrGrievanceAccessService access;
    private final long base = System.currentTimeMillis() * 100;

    private HrDisputeReadScopeChecks(JdbcTemplate jdbc, HrTypedCrudService crud, HrGrievanceAccessService access) {
        this.jdbc = jdbc; this.crud = crud; this.access = access;
    }

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2 || !arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/d4_scope_[a-f0-9]{32}\\?.*")) {
            throw new IllegalArgumentException("Owned loopback fixture required");
        }
        Path expected = Path.of("D:/CloudFlowPro/.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/mysql-data").toRealPath();
        equal(expected, Path.of(arguments[1]).toRealPath(), "fixed owned data directory");
        try (HikariDataSource source = new HikariDataSource(); StaticApplicationContext application = new StaticApplicationContext()) {
            source.setJdbcUrl(arguments[0]); source.setUsername("root"); source.setPassword(""); source.setMaximumPoolSize(2);
            JdbcTemplate jdbc = new JdbcTemplate(source);
            equal(expected, Path.of(jdbc.queryForObject("SELECT @@datadir", String.class)).toRealPath(), "owned database");
            for (long tenant : List.of(TENANT, FOREIGN)) {
                equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_tenant WHERE tenant_id=?", Integer.class, tenant), "unused fixture tenant");
                equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_grievance WHERE tenant_id=?", Integer.class, tenant), "unused grievance scope");
                equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_labor_dispute WHERE tenant_id=?", Integer.class, tenant), "unused dispute scope");
            }
            MybatisConfiguration configuration = new MybatisConfiguration(); configuration.setMapUnderscoreToCamelCase(true);
            configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
            GlobalConfig global = new GlobalConfig();
            global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
            GlobalConfigUtils.setGlobalConfig(configuration, global);
            configuration.addMapper(HrEmployeeMapper.class); configuration.addMapper(HrGrievanceMapper.class);
            configuration.addMapper(HrLaborDisputeMapper.class); configuration.addMapper(HrAuditLogMapper.class);
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
            factory.setDataSource(source); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
            factory.setMapperLocations(new FileSystemResource("cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrGrievanceMapper.xml"),
                    new FileSystemResource("cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrAuditLogMapper.xml"));
            factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
            SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
            HrEmployeeMapper employees = sessions.getMapper(HrEmployeeMapper.class);
            HrAuditLogMapper audits = sessions.getMapper(HrAuditLogMapper.class);
            ObjectMapper json = new ObjectMapper().findAndRegisterModules();
            DataSourceTransactionManager manager = new DataSourceTransactionManager(source);
            HrRuleSupport support = new HrRuleSupport(manager, null, employees, audits, json, null);
            HrGrievanceAccessService access = new HrGrievanceAccessService(employees, sessions.getMapper(HrGrievanceMapper.class), support, new HrEssSupport(null));
            application.getBeanFactory().registerSingleton("hrLaborDisputeMapper", sessions.getMapper(HrLaborDisputeMapper.class));
            SysConfigHelper settings = new SysConfigHelper() {
                @Override public int getConfigInt(String key, int fallback) { return fallback; }
            };
            HrTypedCrudService crud = new HrTypedCrudService(application, json, employees, null, null, audits,
                    new HrAppraisalGuard(null, null, null, null, null), null, null, settings, access);
            HrDisputeReadScopeChecks fixture = new HrDisputeReadScopeChecks(jdbc, crud, access);
            try {
                new TransactionTemplate(manager).executeWithoutResult(status -> {
                    try { fixture.verify(); } finally { status.setRollbackOnly(); }
                });
                for (long tenant : List.of(TENANT, FOREIGN)) {
                    equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_labor_dispute WHERE tenant_id=?", Integer.class, tenant), "dispute fixtures rolled back");
                    equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_grievance WHERE tenant_id=?", Integer.class, tenant), "source fixtures rolled back");
                    equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_employee WHERE tenant_id=?", Integer.class, tenant), "employee fixtures rolled back");
                    equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=?", Integer.class, tenant), "test audits rolled back");
                }
            } finally { UserContext.clear(); TenantContext.clear(); }
        }
        System.out.println("D4_DISPUTE_SCOPE: checks=" + checks + "; failed=0; fixtures_rolled_back=true");
    }

    private void verify() {
        jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,employee_status,user_id,deleted) VALUES(?,?,?,'范围验收处理人','UNKNOWN','REGULAR',?,0)", base, TENANT, marker, HANDLER);
        // 1/2: assigned; 3: unrelated; 4: applicant; 5: targeted; 6: deleted source;
        // 7: foreign; 8/9: independent own/other; 10: deleted dispute.
        for (int number = 1; number <= 10; number++) {
            long tenant = number == 7 ? FOREIGN : TENANT;
            jdbc.update("INSERT INTO hr_labor_dispute(id,tenant_id,dispute_no,applicant_employee_id,applicant_external_phone,dispute_type,status,create_by,deleted) VALUES(?,?,?,?,?,'OTHER',?,?,?)",
                    base + number, tenant, marker + "-" + number, APPLICANT, PHONE, number == 2 ? "CLOSED" : "REGISTERED", number == 8 ? "scope-handler" : "scope-other", number == 10 ? 1 : 0);
            if (number != 8 && number != 9) {
                jdbc.update("INSERT INTO hr_grievance(grievance_id,tenant_id,grievance_no,employee_id,employee_name,grievance_type,subject,description,against_type,against_id,status,handler_id,escalated_dispute_id,deleted) VALUES(?,?,?,?,?,'OTHER',?,?,?,?,'ESCALATED',?,?,?)",
                        base + number, tenant, marker + "-" + number, number == 4 ? base : APPLICANT, "范围验收", marker, marker,
                        number == 5 ? "USER" : "NONE", number == 5 ? HANDLER : null, number == 3 ? HANDLER + 10 : HANDLER, base + number, number == 6 ? 1 : 0);
            }
        }
        identity(HANDLER, TENANT, Set.of("employee"), 2);
        for (int type : List.of(1, 2, 3, 4)) {
            UserContext.setDsType(type);
            visible(List.of(1, 2, 8), "handler restricted scope " + type);
            Map<String, Object> detail = crud.get(HrLaborDispute.class, base + 1);
            equal(base + 1, ((Number) detail.get("id")).longValue(), "assigned detail outside creator scope");
            check(!PHONE.equals(detail.get("applicantExternalPhone")), "assigned phone remains masked");
            equal(Map.of(), crud.get(HrLaborDispute.class, base + 9), "independent other creator remains hidden");
        }
        UserContext.setDsDeptIds(List.of()); visible(List.of(1, 2, 8), "empty departments keep original creator scope");
        UserContext.setDsType(0); visible(List.of(1, 2, 8, 9), "unrestricted original scope retained");
        UserContext.setDsType(null); visible(List.of(1, 2, 8, 9), "null original scope retained");
        identity(HANDLER, TENANT, Set.of("hr"), 2);
        visible(List.of(1, 2, 3, 8), "HR assigned and unassigned readable with original independent scope");
        for (int number : List.of(4, 5, 6)) {
            denied(() -> access.assertDisputeAccess(base + number), "HR applicant/target/deleted source rejected");
            denied(() -> access.linkedDispute(base + number), "attachment source boundary retained");
            equal(Map.of(), crud.get(HrLaborDispute.class, base + number), "direct CRUD read excludes conflict");
        }
        access.assertDisputeAccess(base + 1);
        equal(base + 1, access.linkedDispute(base + 1).getEscalatedDisputeId(), "assigned attachment source retained");
        equal(Map.of(), crud.get(HrLaborDispute.class, base + 10), "deleted dispute not resurrected by grant");
        identity(HANDLER + 20, TENANT, Set.of("admin"), 0);
        visible(List.of(8, 9), "unassigned admin cannot read linked cases");
        identity(HANDLER, FOREIGN, Set.of("employee"), 2);
        visible(List.of(7), "foreign tenant only reads its assigned case");
        equal(Map.of(), crud.get(HrLaborDispute.class, base + 1), "known foreign id returns no detail");
        denied(() -> access.linkedDispute(base + 1), "known foreign attachment source rejected");
        identity(HANDLER, TENANT, Set.of("employee"), 2);
        Map<String, Object> closed = crud.page(HrLaborDispute.class, Map.of("keyword", marker, "status", "CLOSED"));
        equal(List.of(base + 2), ids(closed), "status filter cannot be bypassed by per-case grant");
        equal(0L, ((Number) crud.page(HrLaborDispute.class, Map.of("keyword", marker + "-missing")).get("total")).longValue(), "keyword filter cannot be bypassed");
        equal(0L, ((Number) crud.page(HrLaborDispute.class, Map.of("keyword", marker, "applicantEmployeeId", APPLICANT + 1)).get("total")).longValue(), "applicant filter cannot be bypassed");
        denied(() -> access.assertDisputeAccess(null), "missing dispute id fails closed");
    }

    private void visible(List<Integer> numbers, String label) {
        List<Long> expected = numbers.stream().map(number -> base + number).sorted().toList();
        Map<String, Object> all = crud.page(HrLaborDispute.class, Map.of("keyword", marker, "pageSize", 100));
        equal((long) expected.size(), ((Number) all.get("total")).longValue(), label + " total");
        equal(expected, ids(all).stream().sorted().toList(), label + " rows");
        List<Long> paginated = new java.util.ArrayList<>();
        for (int page = 1; page <= expected.size() + 1; page++) {
            Map<String, Object> current = crud.page(HrLaborDispute.class, Map.of("keyword", marker, "pageSize", 1, "pageNum", page));
            equal((long) expected.size(), ((Number) current.get("total")).longValue(), label + " paginated total");
            paginated.addAll(ids(current));
        }
        equal(expected, paginated.stream().sorted().toList(), label + " pagination complete without duplicate");
        equal(expected, crud.list(HrLaborDispute.class, Map.of("keyword", marker)).stream().map(row -> ((Number) row.get("id")).longValue()).sorted().toList(), label + " generic list");
    }

    private static List<Long> ids(Map<String, Object> page) {
        return ((List<?>) page.get("rows")).stream().map(row -> ((Number) ((Map<?, ?>) row).get("id")).longValue()).toList();
    }
    private static void identity(long user, long tenant, Set<String> roles, Integer scope) {
        UserContext.setUserId(user); UserContext.setUserName("scope-handler"); UserContext.setTenantId(tenant);
        UserContext.setRoles(roles); UserContext.setDsType(scope); UserContext.setDsDeptIds(List.of(100L)); TenantContext.setTenantId(tenant);
    }
    private static void denied(Runnable action, String label) {
        try { action.run(); } catch (HrBusinessException exception) { checks++; return; }
        throw new AssertionError(label);
    }
    private static void equal(Object expected, Object actual, String label) { check(Objects.equals(expected, actual), label); }
    private static void check(boolean passed, String label) { if (!passed) throw new AssertionError(label); checks++; }
}
