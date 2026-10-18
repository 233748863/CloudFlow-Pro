package com.cloudflow.hr.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.HrGrievanceQuery;
import com.cloudflow.hr.mapper.HrAuditLogMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrGrievanceMapper;
import com.cloudflow.hr.mapper.HrGrievanceRecordMapper;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.HrGrievanceAccessService;
import com.cloudflow.hr.service.HrGrievanceService;
import com.cloudflow.hr.service.HrRuleSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Boundary fixtures in a disposable schema; production queries, tenant filtering and audit writes. */
public final class HrGrievanceDurationChecks {
    private static final long TENANT = 198206101L;
    private static final long FOREIGN = 198206102L;
    private static final long READER = 198206103L;
    private static final long EMPLOYEE = 198206104L;
    private static final long BASE = 1982061000L;
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2 || !arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/d4_duration_[a-f0-9]{32}\\?.*")) {
            throw new IllegalArgumentException("Disposable loopback schema required");
        }
        Path expected = Path.of("D:/CloudFlowPro/.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/mysql-data").toRealPath();
        equal(expected, Path.of(arguments[1]).toRealPath(), "owned data directory argument");
        try (HikariDataSource source = new HikariDataSource()) {
            source.setJdbcUrl(arguments[0]); source.setUsername("root"); source.setPassword(""); source.setMaximumPoolSize(2);
            JdbcTemplate jdbc = new JdbcTemplate(source);
            equal(expected, Path.of(jdbc.queryForObject("SELECT @@datadir", String.class)).toRealPath(), "owned database process");
            equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_grievance", Integer.class), "empty scratch grievances");
            MybatisConfiguration configuration = new MybatisConfiguration(); configuration.setMapUnderscoreToCamelCase(true);
            configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
            GlobalConfig global = new GlobalConfig();
            global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
            GlobalConfigUtils.setGlobalConfig(configuration, global);
            configuration.addMapper(HrEmployeeMapper.class); configuration.addMapper(HrGrievanceMapper.class);
            configuration.addMapper(HrGrievanceRecordMapper.class); configuration.addMapper(HrAuditLogMapper.class);
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
            factory.setDataSource(source); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
            factory.setMapperLocations(new FileSystemResource("cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrGrievanceMapper.xml"),
                    new FileSystemResource("cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrAuditLogMapper.xml"));
            factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
            SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
            DataSourceTransactionManager manager = new DataSourceTransactionManager(source);
            ObjectMapper json = new ObjectMapper().findAndRegisterModules();
            HrEmployeeMapper employees = sessions.getMapper(HrEmployeeMapper.class);
            HrGrievanceMapper grievances = sessions.getMapper(HrGrievanceMapper.class);
            HrRuleSupport support = new HrRuleSupport(manager, null, employees, sessions.getMapper(HrAuditLogMapper.class), json, null);
            HrEssSupport ess = new HrEssSupport(null);
            HrGrievanceAccessService access = new HrGrievanceAccessService(employees, grievances, support, ess);
            HrGrievanceService service = new HrGrievanceService(grievances, sessions.getMapper(HrGrievanceRecordMapper.class), access, ess, support,
                    null, null, null, null, null, null, null, json);
            try {
                new TransactionTemplate(manager).executeWithoutResult(status -> {
                    try { verify(jdbc, service); } finally { status.setRollbackOnly(); }
                });
                equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_grievance", Integer.class), "all dated cases rolled back");
                equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM hr_audit_log", Integer.class), "scratch audits rolled back");
            } finally { UserContext.clear(); TenantContext.clear(); }
        }
        System.out.println("D4_DURATION: checks=" + checks + "; failed=0; fixtures_rolled_back=true; real_database=true");
    }

    private static void verify(JdbcTemplate jdbc, HrGrievanceService service) {
        UserContext.setUserId(READER); UserContext.setUserName("duration-check"); UserContext.setTenantId(TENANT);
        UserContext.setRoles(Set.of("hr")); TenantContext.setTenantId(TENANT);
        jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,employee_status,user_id) VALUES(?,?,'D4-DURATION-READER','统计人事','UNKNOWN','REGULAR',?)", EMPLOYEE, TENANT, READER);
        int[] days = {0, 1, 3, 4, 7, 8, 9, 365};
        String[] buckets = {"0–3天", "0–3天", "0–3天", "4–7天", "4–7天", "8天及以上", "8天及以上", "8天及以上"};
        for (int index = 0; index < days.length; index++) {
            LocalDateTime created = LocalDate.of(2024, 2, 28).atTime(23, 59, 59);
            insert(jdbc, index, TENANT, EMPLOYEE + 1, "NONE", null, 0, created, created.toLocalDate().plusDays(days[index]), "CLOSED");
            jdbc.update("INSERT INTO sys_dept(dept_id,tenant_id,dept_name) VALUES(?,?,?)", BASE + index, TENANT, "时长" + days[index]);
            HrGrievanceQuery query = new HrGrievanceQuery(); query.setDeptId(BASE + index);
            Map<String, Object> result = service.statistics(query);
            equal(1, result.get("total"), "single fixture total " + days[index]);
            equal(distribution(buckets[index], 1L), chart(result, "byDuration"), "exact day bucket " + days[index]);
            equal(Map.of("时长" + days[index], 1L), chart(result, "byDept"), "department boundary filter " + days[index]);
            equal(Map.of("OTHER", 1L), chart(result, "byType"), "type boundary filter " + days[index]);
        }
        insert(jdbc, 20, TENANT, EMPLOYEE + 1, "NONE", null, 0, LocalDate.of(2026, 1, 1).atStartOfDay(), null, "SUBMITTED");
        insert(jdbc, 21, TENANT, EMPLOYEE + 1, "USER", READER, 0, LocalDate.of(2026, 1, 1).atStartOfDay(), LocalDate.of(2026, 1, 9), "CLOSED");
        insert(jdbc, 22, TENANT, EMPLOYEE, "NONE", null, 0, LocalDate.of(2026, 1, 1).atStartOfDay(), LocalDate.of(2026, 1, 9), "CLOSED");
        insert(jdbc, 23, TENANT, EMPLOYEE + 1, "NONE", null, 1, LocalDate.of(2026, 1, 1).atStartOfDay(), LocalDate.of(2026, 1, 9), "CLOSED");
        insert(jdbc, 24, FOREIGN, EMPLOYEE + 1, "NONE", null, 0, LocalDate.of(2026, 1, 1).atStartOfDay(), LocalDate.of(2026, 1, 9), "CLOSED");
        Map<String, Object> all = service.statistics(new HrGrievanceQuery());
        equal(9, all.get("total"), "unresolved included and inaccessible cases excluded");
        equal(Map.of("0–3天", 3L, "4–7天", 2L, "8天及以上", 3L), chart(all, "byDuration"), "3 4 7 8 and leap day boundaries combined");
        equal(Map.of("OTHER", 9L), chart(all, "byType"), "unresolved contributes type total");
        equal(1L, chart(all, "byDept").get("未分配部门"), "missing department label");
        HrGrievanceQuery unresolved = new HrGrievanceQuery(); unresolved.setStatus("SUBMITTED");
        equal(distribution("0–3天", 0L), chart(service.statistics(unresolved), "byDuration"), "unresolved contributes no duration");
        HrGrievanceQuery combined = new HrGrievanceQuery(); combined.setStatus("CLOSED"); combined.setGrievanceType("OTHER"); combined.setDeptId(BASE + 3); combined.setHandlerId(READER + 3);
        equal(distribution("4–7天", 1L), chart(service.statistics(combined), "byDuration"), "combined filter keeps four day boundary");
        combined.setGrievanceType("SALARY"); equal(0, service.statistics(combined).get("total"), "conflicting filters produce empty result");
        UserContext.setRoles(Set.of("employee"));
        equal(distribution("0–3天", 1L), chart(service.statistics(new HrGrievanceQuery()), "byDuration"), "designated reader scope retained in statistics");
        equal(13, jdbc.queryForObject("SELECT COUNT(*) FROM hr_audit_log WHERE operation_type='VIEW_STATISTICS'", Integer.class), "each successful statistics read audited");
    }

    private static void insert(JdbcTemplate jdbc, int index, long tenant, long employee, String against, Long target, int deleted, LocalDateTime created, LocalDate resolved, String status) {
        jdbc.update("INSERT INTO hr_grievance(grievance_id,tenant_id,grievance_no,employee_id,employee_name,dept_id,grievance_type,subject,description,against_type,against_id,status,handler_id,create_time,resolution_date,deleted) VALUES(?,?,?,?,?,?,'OTHER','日期边界','独立样本',?,?,?,?,?,?,?)",
                BASE + index, tenant, "D4-DURATION-" + index, employee, "独立统计样本", BASE + index, against, target, status, READER + index, created, resolved, deleted);
    }

    private static Map<String, Long> chart(Map<String, Object> result, String field) {
        Map<String, Long> values = new LinkedHashMap<>();
        for (Object item : (List<?>) result.get(field)) { Map<?, ?> row = (Map<?, ?>) item; values.put(row.get("name").toString(), ((Number) row.get("value")).longValue()); }
        return values;
    }
    private static Map<String, Long> distribution(String bucket, long count) {
        Map<String, Long> expected = new LinkedHashMap<>(Map.of("0–3天", 0L, "4–7天", 0L, "8天及以上", 0L)); expected.put(bucket, count); return expected;
    }
    private static void equal(Object expected, Object actual, String label) { if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + ", actual=" + actual); checks++; }
}
