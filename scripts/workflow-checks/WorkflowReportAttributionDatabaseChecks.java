package com.cloudflow.workflow.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.report.PreparedReportQuery;
import com.cloudflow.common.core.report.ReportQuery;
import com.cloudflow.common.core.report.ReportRegistry;
import com.cloudflow.common.core.report.ReportResult;
import com.cloudflow.common.core.report.ReportRow;
import com.cloudflow.common.core.report.ReportValidation;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.mapper.WorkflowReportMapper;
import com.fasterxml.jackson.databind.node.TextNode;
import com.zaxxer.hikari.HikariDataSource;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Only H1 AC-12 attribution and directly related visibility; all fixtures roll back. */
public final class WorkflowReportAttributionDatabaseChecks {
    private static final long TENANT = 998783L;
    private static final long FOREIGN_TENANT = 998784L;
    private static final long OWNER = 99878301L;
    private static final long AGENT = 99878302L;
    private static final long PEER = 99878303L;
    private static final String PREFIX = "h1-attribution-";
    private static int assertions;

    public static void main(String[] args) throws Exception {
        if (args.length != 3 || !args[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/cloud_flow_db\\?.+")) {
            throw new IllegalArgumentException("Owned loopback database URL, data directory and repository required");
        }
        Path root = Path.of(args[2]).toRealPath();
        try (HikariDataSource source = new HikariDataSource()) {
            source.setJdbcUrl(args[0]); source.setUsername("root"); source.setPassword("");
            source.setMaximumPoolSize(1); source.setMinimumIdle(1); source.setPoolName("h1-attribution-only");
            JdbcTemplate jdbc = new JdbcTemplate(source);
            equal(Path.of(args[1]).toRealPath(), Path.of(jdbc.queryForObject("SELECT @@datadir", String.class)).toRealPath(), "owned database");
            equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM sys_tenant WHERE tenant_id IN (?,?)", Long.class, TENANT, FOREIGN_TENANT), "fixture tenants unused");
            for (String table : List.of("wf_process_instance", "wf_task_history")) {
                equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE instance_id LIKE ?", Long.class, PREFIX + "%"), "fixture prefix unused " + table);
            }
            MybatisConfiguration configuration = new MybatisConfiguration();
            configuration.setMapUnderscoreToCamelCase(true);
            configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
            configuration.addMapper(WorkflowReportMapper.class);
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
            factory.setConfiguration(configuration); factory.setDataSource(source);
            factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
            factory.setMapperLocations(
                    new FileSystemResource(root.resolve("cloudflow-backend/cloudflow-common/cloudflow-common-data/src/main/resources/mapper/report/ReportSqlMapper.xml")),
                    new FileSystemResource(root.resolve("cloudflow-backend/cloudflow-service-workflow/src/main/resources/mapper/workflow/WorkflowReportMapper.xml")));
            SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
            WorkflowReportMapper mapper = sessions.getMapper(WorkflowReportMapper.class);
            TransactionTemplate transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
            identity(TENANT, OWNER);
            transaction.executeWithoutResult(status -> {
                try {
                    jdbc.update("INSERT INTO sys_tenant (tenant_id,tenant_code,tenant_name) VALUES (?,'H1_ATTR_OWN','H1统计检查'),(?,'H1_ATTR_FOREIGN','H1隔离检查')", TENANT, FOREIGN_TENANT);
                    instance(jdbc, "own", TENANT); instance(jdbc, "foreign", FOREIGN_TENANT);
                    history(jdbc, "normal", TENANT, "own", OWNER, "负责人", null, null, "APPROVE", 120);
                    history(jdbc, "proxy", TENANT, "own", AGENT, "代理人", OWNER, "负责人", "REJECT", 240);
                    history(jdbc, "agent-own", TENANT, "own", AGENT, "代理人", null, null, "APPROVE", 60);
                    history(jdbc, "peer", TENANT, "own", PEER, "他人", null, null, "APPROVE", 600);
                    history(jdbc, "assist", TENANT, "own", AGENT, "代理人", OWNER, "负责人", "AGENT_ASSIST", 888);
                    history(jdbc, "return", TENANT, "own", AGENT, "代理人", OWNER, "负责人", "AGENT_RETURN", 888);
                    history(jdbc, "foreign", FOREIGN_TENANT, "foreign", OWNER, "外租户负责人", null, null, "APPROVE", 999);
                    PreparedReportQuery query = query(null);
                    List<ReportRow> all = rows(mapper, TENANT, OWNER, true, query);
                    equal(3, all.size(), "admin sees only own tenant handlers");
                    row(all, OWNER, "负责人", "2", "180");
                    row(all, AGENT, "代理人", "1", "60");
                    row(all, PEER, "他人", "1", "600");
                    List<ReportRow> owner = rows(mapper, TENANT, OWNER, false, query);
                    equal(1, owner.size(), "principal visibility only"); row(owner, OWNER, "负责人", "2", "180");
                    identity(TENANT, AGENT); sessions.clearCache();
                    List<ReportRow> agent = rows(mapper, TENANT, AGENT, false, query);
                    equal(2, agent.size(), "agent can see own and proxied actions");
                    row(agent, OWNER, "负责人", "1", "240"); row(agent, AGENT, "代理人", "1", "60");
                    List<ReportRow> filtered = rows(mapper, TENANT, AGENT, false, query(OWNER));
                    equal(1, filtered.size(), "principal filter uses attribution"); row(filtered, OWNER, "负责人", "1", "240");
                    List<ReportRow> ownFiltered = rows(mapper, TENANT, AGENT, true, query(AGENT));
                    equal(1, ownFiltered.size(), "agent filter excludes represented work"); row(ownFiltered, AGENT, "代理人", "1", "60");
                    identity(TENANT, PEER); sessions.clearCache();
                    List<ReportRow> peer = rows(mapper, TENANT, PEER, false, query);
                    equal(1, peer.size(), "unrelated operator isolated"); row(peer, PEER, "他人", "1", "600");
                    equal(0, rows(mapper, FOREIGN_TENANT, PEER, true, query).size(), "tenant plugin rejects forged tenant");
                    identity(FOREIGN_TENANT, OWNER); sessions.clearCache();
                    List<ReportRow> foreign = rows(mapper, FOREIGN_TENANT, OWNER, true, query);
                    equal(1, foreign.size(), "foreign tenant sees own data only"); row(foreign, OWNER, "外租户负责人", "1", "999");
                    identity(TENANT, OWNER); sessions.clearCache();
                    equal(0, mapper.tasks(TENANT, OWNER, false, Set.of(), true, false, query).size(), "todo permission cannot expose history");
                    equal(7L, jdbc.queryForObject("SELECT COUNT(*) FROM wf_task_history WHERE tenant_id IN (?,?)", Long.class, TENANT, FOREIGN_TENANT), "only dedicated history fixtures");
                } finally { status.setRollbackOnly(); }
            });
            equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM sys_tenant WHERE tenant_id IN (?,?)", Long.class, TENANT, FOREIGN_TENANT), "tenant fixtures rolled back");
            for (String table : List.of("wf_process_instance", "wf_task_history")) {
                equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE instance_id LIKE ?", Long.class, PREFIX + "%"), "fixtures rolled back " + table);
            }
            System.out.println("H1_REPORT_ATTRIBUTION: assertions=" + assertions + "; failed=0; real_mysql=true; formal_mapper=true; tenant_plugin=true; fixtures_rolled_back=true; http=false");
        } finally { UserContext.clear(); TenantContext.clear(); }
    }

    private static void instance(JdbcTemplate jdbc, String suffix, long tenant) {
        jdbc.update("INSERT INTO wf_process_instance (instance_id,tenant_id,process_def_key,business_key,start_user_id,status,start_time) VALUES (?,?,'h1-attribution',?,?,'PASSED',NOW())", PREFIX + suffix, tenant, PREFIX + suffix, OWNER);
    }
    private static void history(JdbcTemplate jdbc, String suffix, long tenant, String instance, long operator, String operatorName, Long behalf, String behalfName, String action, int seconds) {
        jdbc.update("INSERT INTO wf_task_history (history_id,tenant_id,task_id,instance_id,node_key,node_name,operator_id,operator_name,on_behalf_of_user_id,on_behalf_of_user_name,action,duration_seconds,create_time) VALUES (?,?,?,?,'h1-node','审批',?,?,?,?,?,?,NOW())",
                PREFIX + suffix, tenant, PREFIX + "task", PREFIX + instance, operator, operatorName, behalf, behalfName, action, seconds);
    }
    private static PreparedReportQuery query(Long handler) {
        ReportQuery.FilterGroup filters = handler == null ? null : new ReportQuery.FilterGroup("AND",
                List.of(new ReportQuery.Filter("HANDLER", "EQ", List.of(TextNode.valueOf(handler.toString())))), List.of());
        ReportQuery input = new ReportQuery(List.of("HANDLER"), List.of(new ReportQuery.Measure("HANDLED_COUNT", "COUNT"),
                new ReportQuery.Measure("DURATION_SECONDS", "AVG")), filters, List.of(), 500, null, null);
        return ReportValidation.prepare(ReportRegistry.require("WF_TASK"), input, LocalDate.now());
    }
    private static List<ReportRow> rows(WorkflowReportMapper mapper, long tenant, long user, boolean admin, PreparedReportQuery query) {
        return ReportResult.from(ReportRegistry.require("WF_TASK"), query, mapper.tasks(tenant, user, admin, Set.of(), false, true, query)).rows();
    }
    private static void row(List<ReportRow> rows, long handler, String name, String count, String average) {
        ReportRow row = rows.stream().filter(item -> Long.toString(handler).equals(item.getDimension1())).findFirst().orElseThrow();
        equal(name, row.getLabel1(), "attributed name " + handler);
        decimal(count, row.getMeasure1(), "attributed count " + handler); decimal(average, row.getMeasure2(), "attributed duration " + handler);
    }
    private static void identity(long tenant, long user) {
        TenantContext.clear(); TenantContext.setTenantId(tenant); UserContext.setTenantId(tenant); UserContext.setUserId(user);
    }
    private static void decimal(String expected, BigDecimal actual, String message) {
        if (actual == null || new BigDecimal(expected).compareTo(actual) != 0) throw new AssertionError(message + ": " + actual);
        assertions++;
    }
    private static void equal(Object expected, Object actual, String message) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(message + ": expected=" + expected + "; actual=" + actual);
        assertions++;
    }
}
