package com.cloudflow.hr.service;

import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.auth.domain.report.ReportDefinitionInput;
import com.cloudflow.auth.domain.report.ReportDefinitionView;
import com.cloudflow.auth.mapper.report.SysReportChartMapper;
import com.cloudflow.auth.mapper.report.SysReportDashboardItemMapper;
import com.cloudflow.auth.mapper.report.SysReportDashboardMapper;
import com.cloudflow.auth.mapper.report.SysReportDatasetMapper;
import com.cloudflow.auth.service.report.ReportDatasetService;
import com.cloudflow.auth.service.report.ReportDefinitionService;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.report.PreparedReportQuery;
import com.cloudflow.common.core.report.ReportDataset;
import com.cloudflow.common.core.report.ReportQuery;
import com.cloudflow.common.core.report.ReportRegistry;
import com.cloudflow.common.core.report.ReportResult;
import com.cloudflow.common.core.report.ReportRow;
import com.cloudflow.common.core.report.ReportValidation;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.report.ReportDataScope;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.crm.mapper.CrmReportMapper;
import com.cloudflow.crm.service.impl.CrmReportService;
import com.cloudflow.hr.domain.entity.HrLeaveLedger;
import com.cloudflow.hr.domain.entity.HrLeaveQuota;
import com.cloudflow.hr.mapper.HrLeaveLedgerMapper;
import com.cloudflow.hr.mapper.HrReportMapper;
import com.cloudflow.oa.mapper.OaReportMapper;
import com.cloudflow.workflow.mapper.WorkflowReportMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.apache.ibatis.session.SqlSessionFactory;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionTemplate;

public final class ReportDatabaseChecks implements AutoCloseable {
    private static final long TENANT = 998781L;
    private static final long OTHER_TENANT = 998782L;
    private static final long USER = 99878101L;
    private static final long PEER = 99878102L;
    private static final long DEPARTMENT = 99878111L;
    private static final long OTHER_DEPARTMENT = 99878112L;
    private static final long BASE = 998781000L;
    private static final LocalDate TODAY = LocalDate.now();
    private static int assertions;
    private final HikariDataSource source;
    private final JdbcTemplate jdbc;
    private final SqlSessionTemplate sessions;
    private final DataSourceTransactionManager manager;
    private final TransactionTemplate transaction;
    private final ObjectMapper json = new ObjectMapper();
    private final ReportDataScope self = new ReportDataScope(false, USER, List.of());
    private final ReportDataScope all = new ReportDataScope(true, null, List.of());

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 4 || !arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/cloud_flow_db\\?.+")) throw new IllegalArgumentException("Owned loopback database arguments required");
        StpLogic previous = StpUtil.getStpLogic();
        StpUtil.setStpLogic(new StpLogic("report-database-checks") {
            @Override public void checkLogin() { }
            @Override public long getLoginIdAsLong() { return UserContext.getUserId(); }
            @Override public boolean hasPermission(String permission) { return true; }
            @Override public void checkPermission(String permission) { }
        });
        try (ReportDatabaseChecks fixture = new ReportDatabaseChecks(arguments[0], arguments[1], Path.of(arguments[3]))) {
            identity(TENANT, USER, DEPARTMENT);
            equal(0L, fixture.jdbc.queryForObject("SELECT COUNT(*) FROM sys_tenant WHERE tenant_id IN (?, ?)", Long.class, TENANT, OTHER_TENANT), "fixture tenants must not exist");
            fixture.transaction.executeWithoutResult(status -> {
                try { fixture.seed(); fixture.crm(); fixture.hr(); fixture.workflow(); fixture.oa(); fixture.expense(); fixture.sqlMatrix(); fixture.filters(); fixture.definitions(); fixture.truncation(); }
                finally { status.setRollbackOnly(); }
            });
            equal(0L, fixture.jdbc.queryForObject("SELECT COUNT(*) FROM sys_tenant WHERE tenant_id IN (?, ?)", Long.class, TENANT, OTHER_TENANT), "transaction fixtures fully rolled back");
            if ("verify-timeout".equals(arguments[2])) fixture.timeout();
            System.out.println("REPORT_DATABASE_CHECKS: assertions=" + assertions + "; failed=0; source_datasets=9; real_mysql=true; tenant_plugin=true; real_definition_services=true; identity_double=true; http=false; fixtures_rolled_back=true; production_modified=false");
        } finally { StpUtil.setStpLogic(previous); UserContext.clear(); TenantContext.clear(); }
    }

    private ReportDatabaseChecks(String url, String directory, Path root) throws Exception {
        source = new HikariDataSource(); source.setJdbcUrl(url); source.setUsername("root"); source.setPassword(""); source.setMaximumPoolSize(4); source.setMinimumIdle(1); source.setPoolName("report-isolated-checks");
        jdbc = new JdbcTemplate(source);
        equal(Path.of(directory).toRealPath(), Path.of(jdbc.queryForObject("SELECT @@datadir", String.class)).toRealPath(), "owned data directory");
        MybatisConfiguration configuration = new MybatisConfiguration(); configuration.setMapUnderscoreToCamelCase(true); configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig(); global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0")); global.setMetaObjectHandler(new MyMetaObjectHandler());
        GlobalConfigUtils.setGlobalConfig(configuration, global);
        for (Class<?> mapper : List.of(CrmReportMapper.class, HrReportMapper.class, WorkflowReportMapper.class, OaReportMapper.class, HrLeaveLedgerMapper.class, SysReportChartMapper.class, SysReportDashboardMapper.class, SysReportDashboardItemMapper.class, SysReportDatasetMapper.class)) configuration.addMapper(mapper);
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean(); factory.setDataSource(source); factory.setConfiguration(configuration); factory.setGlobalConfig(global); factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        factory.setMapperLocations(resource(root, "cloudflow-common/cloudflow-common-data", "report/ReportSqlMapper.xml"), resource(root, "cloudflow-service-crm", "CrmReportMapper.xml"), resource(root, "cloudflow-service-hr", "HrReportMapper.xml"), resource(root, "cloudflow-service-workflow", "workflow/WorkflowReportMapper.xml"), resource(root, "cloudflow-service-oa", "OaReportMapper.xml"), resource(root, "cloudflow-auth", "report/SysReportChartMapper.xml"), resource(root, "cloudflow-auth", "report/SysReportDashboardMapper.xml"), resource(root, "cloudflow-auth", "report/SysReportDashboardItemMapper.xml"), resource(root, "cloudflow-auth", "report/SysReportDatasetMapper.xml"));
        SqlSessionFactory sessionFactory = factory.getObject(); sessions = new SqlSessionTemplate(sessionFactory);
        for (String statement : List.of("com.cloudflow.crm.mapper.CrmReportMapper.funnel", "com.cloudflow.crm.mapper.CrmReportMapper.aging", "com.cloudflow.hr.mapper.HrReportMapper.attendance", "com.cloudflow.hr.mapper.HrReportMapper.leave", "com.cloudflow.workflow.mapper.WorkflowReportMapper.instances", "com.cloudflow.workflow.mapper.WorkflowReportMapper.tasks", "com.cloudflow.oa.mapper.OaReportMapper.budget", "com.cloudflow.oa.mapper.OaReportMapper.assets")) equal(5, sessionFactory.getConfiguration().getMappedStatement(statement).getTimeout(), "five second SQL timeout");
        manager = new DataSourceTransactionManager(source); transaction = new TransactionTemplate(manager);
    }

    private void seed() {
        jdbc.update("INSERT INTO sys_tenant (tenant_id,tenant_code,tenant_name) VALUES (?,'REPORT_CHECK','报表专项租户'),(?,'REPORT_OTHER','报表隔离租户')", TENANT, OTHER_TENANT);
        jdbc.update("INSERT INTO sys_dept (dept_id,tenant_id,dept_name) VALUES (?,?,'报表部门'),(?,?,'其他部门')", DEPARTMENT, TENANT, OTHER_DEPARTMENT, TENANT);
        jdbc.update("INSERT INTO crm_customer (customer_id,tenant_id,customer_code,customer_name,owner_id,dept_id) VALUES (?,?,'REPORT_OWN','本人客户',?,?),(?,?,'REPORT_HIDDEN','他人客户',?,?),(?,?,'REPORT_FOREIGN','跨租户客户',?,?)", BASE + 1, TENANT, USER, DEPARTMENT, BASE + 2, TENANT, PEER, OTHER_DEPARTMENT, BASE + 3, OTHER_TENANT, USER, DEPARTMENT);
        opportunity(BASE + 1, TENANT, BASE + 1, "LEAD", "100", "65", "65"); opportunity(BASE + 2, TENANT, BASE + 1, "WON", "200", "100", "200"); opportunity(BASE + 3, TENANT, BASE + 2, "LEAD", "900000", "100", "900000"); opportunity(BASE + 4, OTHER_TENANT, BASE + 3, "LEAD", "800000", "100", "800000");
        receivable(BASE + 1, TENANT, BASE + 1, TODAY.minusDays(10), "100", "30", "70"); receivable(BASE + 2, TENANT, BASE + 1, TODAY, "200", "50", "150"); receivable(BASE + 3, TENANT, BASE + 1, null, "50", "0", "50"); receivable(BASE + 4, TENANT, BASE + 2, TODAY.minusDays(60), "900000", "0", "900000");
        jdbc.update("INSERT INTO hr_employee (id,tenant_id,employee_no,name,gender,user_id,dept_id) VALUES (?,?,'REPORT_SELF','本人员工','UNKNOWN',?,?),(?,?,'REPORT_PEER','其他员工','UNKNOWN',?,?),(?,?,'REPORT_FOREIGN','异租户员工','UNKNOWN',?,?)", BASE + 1, TENANT, USER, DEPARTMENT, BASE + 2, TENANT, PEER, OTHER_DEPARTMENT, BASE + 3, OTHER_TENANT, USER, DEPARTMENT);
        attendance(BASE + 1, TENANT, BASE + 1, TODAY, 5); attendance(BASE + 2, TENANT, BASE + 1, TODAY.minusDays(100), 100); attendance(BASE + 3, TENANT, BASE + 2, TODAY, 999); attendance(BASE + 4, OTHER_TENANT, BASE + 3, TODAY, 888);
        jdbc.update("INSERT INTO hr_leave_type (id,tenant_id,leave_code,leave_name,unit) VALUES (?,?,'REPORT_DAY','天假期','DAY'),(?,?,'REPORT_HOUR','小时假期','HOUR')", BASE + 1, TENANT, BASE + 2, TENANT);
        jdbc.update("INSERT INTO hr_leave_period (period_id,tenant_id,period_name,start_date,end_date) VALUES (?,?,'完整周期',?,?)", BASE + 1, TENANT, TODAY.minusYears(1), TODAY.plusYears(1));
        ledger(BASE + 1, BASE + 1, "DAY", "ALLOCATION", "10", null); ledger(BASE + 2, BASE + 1, "DAY", "APPLICATION", "-3", null); ledger(BASE + 3, BASE + 1, "DAY", "FREEZE", "-2", null); ledger(BASE + 4, BASE + 1, "DAY", "REVERSAL", "3", BASE + 2); ledger(BASE + 5, BASE + 1, "DAY", "REVERSAL", "-3", BASE + 4); ledger(BASE + 6, BASE + 1, "DAY", "UNFREEZE", "1", null); ledger(BASE + 7, BASE + 1, "DAY", "CARRY_FORWARD", "2", null); ledger(BASE + 8, BASE + 1, "DAY", "ADJUSTMENT", "-1", null); ledger(BASE + 9, BASE + 2, "HOUR", "ALLOCATION", "8", null); ledger(BASE + 10, BASE + 2, "HOUR", "APPLICATION", "-2", null);
        jdbc.update("INSERT INTO oa_budget_plan (budget_id,tenant_id,budget_no,budget_name,fiscal_year,target_type,target_id,owner_id,dept_id,total_amount) VALUES (?,?,'REPORT_BUDGET','报表预算',2026,'DEPT',?,?,?,9999),(?,?,'REPORT_HIDDEN','他人预算',2026,'DEPT',?,?,?,900000)", BASE + 1, TENANT, DEPARTMENT, USER, DEPARTMENT, BASE + 2, TENANT, OTHER_DEPARTMENT, PEER, OTHER_DEPARTMENT);
        jdbc.update("INSERT INTO oa_budget_line (line_id,tenant_id,budget_id,subject_code,subject_name,amount,reserved_amount,actual_amount,available_amount) VALUES (?, ?, ?, 'REPORT_SUBJECT','同一科目',100,20,30,50),(?,?,?,'REPORT_SUBJECT_2','另一科目',200,0,50,150),(?,?,?,'REPORT_HIDDEN','他人科目',900000,0,0,900000)", BASE + 1, TENANT, BASE + 1, BASE + 2, TENANT, BASE + 1, BASE + 3, TENANT, BASE + 2);
        jdbc.update("INSERT INTO oa_asset_category (category_id,tenant_id,category_code,category_name) VALUES (?,?,'REPORT_ASSET','报表资产分类')", BASE + 1, TENANT);
        jdbc.update("INSERT INTO oa_asset (asset_id,tenant_id,asset_code,name,category_id,purchase_amount,opening_accumulated_depreciation,accumulated_depreciation,net_book_value) VALUES (?,?,'REPORT_ASSET','报表资产',?,1000,50,200,800),(?,?,'REPORT_FOREIGN','跨租户资产',?,900000,0,0,900000)", BASE + 1, TENANT, BASE + 1, BASE + 2, OTHER_TENANT, BASE + 1);
        jdbc.update("INSERT INTO wf_process_definition (definition_id,tenant_id,process_name,process_key) VALUES ('report-check-def',?,'报表检查流程','report-check')", TENANT);
        instance("report-own", TENANT, USER, "PASSED", true); instance("report-running", TENANT, USER, "RUNNING", false); instance("report-hidden", TENANT, PEER, "PASSED", true); instance("report-foreign", OTHER_TENANT, USER, "PASSED", true);
        task("report-todo", "report-own", USER, "TODO", null); task("report-peer", "report-own", PEER, "TODO", null); task("report-proxy", "report-running", PEER, "TODO", USER); task("report-done", "report-own", USER, "DONE", null);
        history("report-history-1", USER, null, "APPROVE", 120); history("report-history-2", USER, null, "COUNTERSIGN_APPROVE", -1); history("report-history-3", USER, null, "COMMENT", 888); history("report-history-4", PEER, USER, "REJECT", 240);
    }

    private void opportunity(long id, long tenant, long customer, String stage, String amount, String winRate, String weighted) { jdbc.update("INSERT INTO crm_opportunity (opportunity_id,tenant_id,customer_id,opportunity_name,stage,expected_amount,win_rate,weighted_amount,owner_id,dept_id) VALUES (?,?,?,'报表商机',?,?,?,?,?,?)", id, tenant, customer, stage, new BigDecimal(amount), new BigDecimal(winRate), new BigDecimal(weighted), USER, DEPARTMENT); }
    private void receivable(long id, long tenant, long customer, LocalDate due, String planned, String received, String outstanding) { jdbc.update("INSERT INTO crm_receivable (receivable_id,tenant_id,customer_id,receivable_no,receivable_name,due_date,planned_amount,received_amount,outstanding_amount,owner_id) VALUES (?,?,?,?, '报表回款',?,?,?,?,?)", id, tenant, customer, "REPORT-" + id, due, new BigDecimal(planned), new BigDecimal(received), new BigDecimal(outstanding), USER); }
    private void attendance(long id, long tenant, long employee, LocalDate date, int late) { jdbc.update("INSERT INTO hr_attendance_record (id,tenant_id,employee_id,attendance_date,status,late_minutes,early_exit_minutes,overtime_minutes) VALUES (?,?,?,?,'NORMAL',?,3,20)", id, tenant, employee, date, late); }
    private void ledger(long id, long type, String unit, String kind, String amount, Long reversal) { jdbc.update("INSERT INTO hr_leave_ledger (ledger_id,tenant_id,employee_id,leave_type_id,leave_period_id,quantity_unit,transaction_type,leave_days,reversal_of_id,create_time) VALUES (?,?,?,?,?,?,?,?,?,?)", id, TENANT, BASE + 1, type, BASE + 1, unit, kind, new BigDecimal(amount), reversal, TODAY.minusDays(180).atStartOfDay()); }
    private void instance(String id, long tenant, long owner, String status, boolean ended) { jdbc.update("INSERT INTO wf_process_instance (instance_id,tenant_id,definition_id,process_def_key,business_key,start_user_id,dept_id,status,start_time,end_time) VALUES (?,?,'report-check-def','report-check',?,?,?,?,?,?)", id, tenant, id, owner, DEPARTMENT, status, TODAY.minusDays(1).atTime(8, 0), ended ? TODAY.minusDays(1).atTime(9, 0) : null); }
    private void task(String id, String instance, long assignee, String status, Long proxy) { jdbc.update("INSERT INTO wf_task (task_id,tenant_id,instance_id,node_key,node_name,assignee,status,proxy_user_id,create_time) VALUES (?,?,?,'report-node','审批节点',?,?,?,?)", id, TENANT, instance, assignee, status, proxy, TODAY.atTime(9, 0)); }
    private void history(String id, long operator, Long behalf, String action, int seconds) { jdbc.update("INSERT INTO wf_task_history (history_id,tenant_id,task_id,instance_id,node_key,node_name,operator_id,on_behalf_of_user_id,action,duration_seconds,create_time) VALUES (?,?,'report-todo','report-own','report-node','审批节点',?,?,?,?,?)", id, TENANT, operator, behalf, action, seconds, TODAY.atTime(10, 0)); }

    private void crm() {
        CrmReportMapper mapper = sessions.getMapper(CrmReportMapper.class);
        PreparedReportQuery funnel = prepared("CRM_FUNNEL", List.of(), List.of("OPPORTUNITY_COUNT:COUNT", "EXPECTED_AMOUNT:SUM", "WEIGHTED_AMOUNT:SUM"));
        ReportRow own = one(valid("CRM_FUNNEL", funnel, mapper.funnel(TENANT, self, funnel))); decimal("2", own.getMeasure1(), "distinct opportunities"); decimal("300", own.getMeasure2(), "customer ownership filters before sum"); decimal("265", own.getMeasure3(), "65 percent correctly weighted");
        decimal("900300", one(valid("CRM_FUNNEL", funnel, mapper.funnel(TENANT, all, funnel))).getMeasure2(), "tenant scope with all-person permission");
        equal(0, valid("CRM_FUNNEL", funnel, mapper.funnel(OTHER_TENANT, all, funnel)).size(), "tenant plugin rejects forged parameter tenant");
        jdbc.update("UPDATE crm_opportunity SET weighted_amount=64 WHERE opportunity_id=? AND tenant_id=?", BASE + 1, TENANT);
        sessions.clearCache();
        fails(400, () -> valid("CRM_FUNNEL", funnel, mapper.funnel(TENANT, self, funnel)), "source weighting discrepancy rejected");
        jdbc.update("UPDATE crm_opportunity SET weighted_amount=65 WHERE opportunity_id=? AND tenant_id=?", BASE + 1, TENANT);
        sessions.clearCache();
        PreparedReportQuery aging = prepared("CRM_AGING", List.of("AGING_BUCKET"), List.of("PLANNED_AMOUNT:SUM", "RECEIVED_AMOUNT:SUM", "OUTSTANDING_AMOUNT:SUM"));
        List<CrmReportService.AgingTier> tiers = List.of(new CrmReportService.AgingTier(30, "DUE_30", "逾期1—30天"), new CrmReportService.AgingTier(Long.MAX_VALUE, "OLDER", "逾期30天以上"));
        List<ReportRow> balances = valid("CRM_AGING", aging, mapper.aging(TENANT, self, aging, tiers, tiers.get(1)));
        equal(3, balances.size(), "undated current overdue are separate"); decimal("70", row(balances, "DUE_30").getMeasure3(), "outstanding source cumulative only"); equal("逾期1—30天", row(balances, "DUE_30").getLabel1(), "aging label retained"); decimal("150", row(balances, "CURRENT").getMeasure3(), "due today not overdue"); decimal("50", row(balances, "UNDATED").getMeasure1(), "undated balance not lost");
        System.out.println("REPORT_CRM_SQL: weighted=265.00; expected=300.00; overdue=70.00; current=150.00; undated=50.00; scope_before_aggregate=true");
    }

    private void hr() {
        HrReportMapper mapper = sessions.getMapper(HrReportMapper.class);
        PreparedReportQuery attendance = prepared("HR_ATTENDANCE", List.of(), List.of("RECORD_COUNT:COUNT", "LATE_MINUTES:SUM", "EARLY_MINUTES:SUM", "OVERTIME_MINUTES:SUM"));
        ReportRow own = one(valid("HR_ATTENDANCE", attendance, mapper.attendance(TENANT, self, attendance)));
        decimal("1", own.getMeasure1(), "ninety-day period excludes older row"); decimal("5", own.getMeasure2(), "only own employee before aggregate"); decimal("3", own.getMeasure3(), "early minutes"); decimal("20", own.getMeasure4(), "overtime minutes");
        ReportDataScope department = new ReportDataScope(false, null, List.of(OTHER_DEPARTMENT)); decimal("999", one(valid("HR_ATTENDANCE", attendance, mapper.attendance(TENANT, department, attendance))).getMeasure2(), "department scope before aggregate");
        PreparedReportQuery leave = prepared("HR_LEAVE", List.of("UNIT"), List.of("TOTAL_QUOTA:SUM", "USED_QUOTA:SUM", "FROZEN_QUOTA:SUM", "AVAILABLE_QUOTA:SUM"));
        List<ReportRow> rows = valid("HR_LEAVE", leave, mapper.leave(TENANT, self, leave)); equal(2, rows.size(), "DAY and HOUR remain separate");
        for (String unit : List.of("DAY", "HOUR")) {
            List<HrLeaveLedger> ledger = sessions.getMapper(HrLeaveLedgerMapper.class).selectList(new LambdaQueryWrapper<HrLeaveLedger>().eq(HrLeaveLedger::getTenantId, TENANT).eq(HrLeaveLedger::getEmployeeId, BASE + 1).eq(HrLeaveLedger::getQuantityUnit, unit));
            HrLeaveQuota quota = HrLeaveBusinessService.balanceFromLedger(ledger); ReportRow result = row(rows, unit);
            decimal(quota.getTotalQuota().toPlainString(), result.getMeasure1(), "same total as business ledger"); decimal(quota.getUsedQuota().toPlainString(), result.getMeasure2(), "same used as business ledger"); decimal(quota.getFrozenQuota().toPlainString(), result.getMeasure3(), "same frozen as business ledger"); decimal(quota.getAvailableQuota().toPlainString(), result.getMeasure4(), "same available as business ledger");
        }
        decimal("11", row(rows, "DAY").getMeasure1(), "complete opening quota and adjustment"); decimal("7", row(rows, "DAY").getMeasure4(), "reversal of reversal follows original kind"); decimal("6", row(rows, "HOUR").getMeasure4(), "hour balance separate");
        for (long invalidSource : List.of(BASE + 999, BASE + 5, BASE + 9)) {
            jdbc.update("UPDATE hr_leave_ledger SET reversal_of_id=? WHERE tenant_id=? AND ledger_id=?", invalidSource, TENANT, BASE + 4);
            sessions.clearCache();
            fails(400, () -> valid("HR_LEAVE", leave, mapper.leave(TENANT, self, leave)), "missing source cycle or crossed unit rejected");
        }
        jdbc.update("UPDATE hr_leave_ledger SET reversal_of_id=? WHERE tenant_id=? AND ledger_id=?", BASE + 2, TENANT, BASE + 4);
        sessions.clearCache();
        equal(0, valid("HR_LEAVE", leave, mapper.leave(OTHER_TENANT, all, leave)).size(), "recursive query maintains tenant isolation");
        System.out.println("REPORT_HR_SQL: attendance=1; DAY_quota=11.00; DAY_available=7.00; HOUR_available=6.00; business_ledger_reconciled=true; invalid_chains=3");
    }

    private void workflow() {
        WorkflowReportMapper mapper = sessions.getMapper(WorkflowReportMapper.class);
        PreparedReportQuery instances = prepared("WF_INSTANCE", List.of(), List.of("INSTANCE_COUNT:COUNT", "DURATION_SECONDS:AVG", "DURATION_SECONDS:MAX"));
        ReportRow result = one(valid("WF_INSTANCE", instances, mapper.instances(TENANT, USER, false, Set.of(), instances)));
        decimal("2", result.getMeasure1(), "instance relation excludes hidden and foreign"); decimal("3600", result.getMeasure2(), "ongoing instance excluded from duration"); decimal("3600", result.getMeasure3(), "actual end duration");
        jdbc.update("INSERT INTO wf_process_copy (tenant_id,instance_id,process_def_key,user_id) VALUES (?,'report-hidden','report-check',?)", TENANT, USER);
        sessions.clearCache();
        decimal("3", one(valid("WF_INSTANCE", instances, mapper.instances(TENANT, USER, false, Set.of(), instances))).getMeasure1(), "copy relation grants existing instance read");
        PreparedReportQuery tasks = prepared("WF_TASK", List.of("FACT_TYPE"), List.of("TODO_COUNT:COUNT", "HANDLED_COUNT:COUNT", "DURATION_SECONDS:AVG"));
        List<ReportRow> facts = valid("WF_TASK", tasks, mapper.tasks(TENANT, USER, false, Set.of(), true, true, tasks));
        decimal("1", row(facts, "TODO").getMeasure1(), "only own TODO counted"); decimal("3", row(facts, "HANDLED").getMeasure2(), "votes and proxy history count as handling"); decimal("180", row(facts, "HANDLED").getMeasure3(), "null negative and nonhandling durations ignored");
        decimal("2", row(valid("WF_TASK", tasks, mapper.tasks(TENANT, USER, false, Set.of("report-proxy"), true, true, tasks)), "TODO").getMeasure1(), "verified proxy task set only");
        equal(1, mapper.proxyTasks(TENANT, USER, tasks, false).size(), "proxy candidate list exact");
        equal(List.of("TODO"), valid("WF_TASK", tasks, mapper.tasks(TENANT, USER, false, Set.of(), true, false, tasks)).stream().map(ReportRow::getDimension1).toList(), "TODO permission cannot grant history");
        equal(List.of("HANDLED"), valid("WF_TASK", tasks, mapper.tasks(TENANT, USER, false, Set.of(), false, true, tasks)).stream().map(ReportRow::getDimension1).toList(), "history permission cannot grant TODO");
        System.out.println("REPORT_WORKFLOW_SQL: visible_instances=3; TODO=1; HANDLED=3; handling_average_seconds=180; fact_permissions_separate=true");
    }

    private void oa() {
        OaReportMapper mapper = sessions.getMapper(OaReportMapper.class);
        PreparedReportQuery budget = prepared("OA_BUDGET", List.of(), List.of("BUDGET_AMOUNT:SUM", "RESERVED_AMOUNT:SUM", "ACTUAL_AMOUNT:SUM", "AVAILABLE_AMOUNT:SUM"));
        ReportRow result = one(valid("OA_BUDGET", budget, mapper.budget(TENANT, self, budget))); decimal("300", result.getMeasure1(), "main budget never counted twice"); decimal("20", result.getMeasure2(), "reserved source balance"); decimal("80", result.getMeasure3(), "actual source balance"); decimal("200", result.getMeasure4(), "available source balance");
        PreparedReportQuery assets = prepared("OA_ASSET", List.of(), List.of("ASSET_COUNT:COUNT", "PURCHASE_AMOUNT:SUM", "DEPRECIATION_AMOUNT:SUM", "NET_AMOUNT:SUM"));
        ReportRow asset = one(valid("OA_ASSET", assets, mapper.assets(TENANT, assets))); decimal("1", asset.getMeasure1(), "asset tenant isolation"); decimal("1000", asset.getMeasure2(), "asset original value"); decimal("200", asset.getMeasure3(), "opening depreciation not added twice"); decimal("800", asset.getMeasure4(), "asset net source balance");
        System.out.println("REPORT_OA_SQL: budget=300.00; reserved=20.00; actual=80.00; available=200.00; asset_depreciation=200.00; duplicate_balance=false");
    }

    private void expense() {
        OaReportMapper mapper = sessions.getMapper(OaReportMapper.class);
        jdbc.update("INSERT INTO biz_expense_claim (id,tenant_id,user_id,dept_id,claim_no,category,total_amount,status,deleted,create_time) VALUES (?, ?, ?, ?, 'REPORT_DATED', 'OFFICE',100.10,'PAID',0,NOW()),(?, ?, ?, ?, 'REPORT_UNDATED','OFFICE',50.50,'DRAFT',0,?), (?, ?, ?, ?, 'REPORT_PEER','OFFICE',900000.90,'PAID',0,NOW()),(?, ?, ?, ?, 'REPORT_FOREIGN','OFFICE',800000.80,'PAID',0,NOW()),(?, ?, ?, ?, 'REPORT_OLD_DATE','OFFICE',70.07,'PAID',0,NOW()),(?, ?, ?, ?, 'REPORT_DELETED','OFFICE',30.30,'PAID',1,NOW())",
                BASE + 201, TENANT, USER, DEPARTMENT, BASE + 202, TENANT, USER, DEPARTMENT, TODAY.minusDays(400).atStartOfDay(),
                BASE + 203, TENANT, PEER, OTHER_DEPARTMENT, BASE + 204, OTHER_TENANT, USER, DEPARTMENT, BASE + 205, TENANT, USER, DEPARTMENT, BASE + 206, TENANT, USER, DEPARTMENT);
        jdbc.update("INSERT INTO biz_expense_item (id,tenant_id,claim_id,expense_type,amount,expense_date) VALUES (?, ?, ?, 'OFFICE',40.03,?), (?, ?, ?, 'OFFICE',60.07,?), (?, ?, ?, 'OFFICE',70.07,?)",
                BASE + 201, TENANT, BASE + 201, TODAY, BASE + 202, TENANT, BASE + 201, TODAY, BASE + 203, TENANT, BASE + 205, TODAY.minusDays(100));
        ReportQuery input = input("OA_EXPENSE", List.of(), List.of("CLAIM_COUNT:COUNT", "CLAIM_AMOUNT:SUM", "APPROVED_AMOUNT:SUM", "PAID_AMOUNT:SUM"));
        ReportResult initial = expenseResult(input, self);
        ReportRow dated = one(initial.rows()); decimal("1", dated.getMeasure1(), "two expense items count as one dated claim");
        decimal("100.10", dated.getMeasure2(), "main total is not duplicated over items"); decimal("100.10", dated.getMeasure3(), "paid claims count as approved"); decimal("100.10", dated.getMeasure4(), "actual paid claim status only");
        equal("1", initial.missingDates().claimCount(), "undated summary excludes other person tenant and deleted claims"); decimal("50.50", new BigDecimal(initial.missingDates().claimAmount()), "old undated claim is separately visible without date substitution");
        decimal("0", new BigDecimal(initial.missingDates().approvedAmount()), "draft is not approved"); decimal("0", new BigDecimal(initial.missingDates().paidAmount()), "draft is not paid");
        ReportResult department = expenseResult(input, new ReportDataScope(false, null, List.of(DEPARTMENT))); equal(initial.missingDates(), department.missingDates(), "department summary preserves person range semantics");
        for (String status : List.of("APPROVED", "PAID", "DRAFT")) {
            jdbc.update("UPDATE biz_expense_claim SET status=? WHERE tenant_id=? AND id=?", status, TENANT, BASE + 202); sessions.clearCache();
            ReportResult changed = expenseResult(input, self); decimal(status.equals("DRAFT") ? "0" : "50.50", new BigDecimal(changed.missingDates().approvedAmount()), "undated approved status " + status);
            decimal(status.equals("PAID") ? "50.50" : "0", new BigDecimal(changed.missingDates().paidAmount()), "undated paid status " + status);
        }
        for (ReportQuery.FilterGroup filters : List.of(group("AND", filter("EXPENSE_TYPE", "EQ", "OFFICE")), group("AND", filter("BUSINESS_DATE", "EQ", TODAY.toString())))) {
            ReportResult filtered = expenseResult(new ReportQuery(input.dimensions(), input.measures(), filters, List.of(), 500, null, null), self);
            decimal("100.10", one(filtered.rows()).getMeasure2(), "typed expense filter retains correct dated amounts"); equal("0", filtered.missingDates().claimCount(), "unknown date or type cannot match an explicit value");
        }
        ReportResult undatedOnly = expenseResult(new ReportQuery(input.dimensions(), input.measures(), group("AND", filter("BUSINESS_DATE", "IS_NULL")), List.of(), 500, null, null), self);
        equal(0, undatedOnly.rows().size(), "missing date selection has no dated chart row"); equal("1", undatedOnly.missingDates().claimCount(), "IS_NULL selects missing date summary");
        ReportResult previousDate = expenseResult(new ReportQuery(input.dimensions(), input.measures(), null, List.of(), 500, TODAY.minusDays(100).toString(), TODAY.minusDays(100).toString()), self);
        decimal("70.07", one(previousDate.rows()).getMeasure2(), "statistics use item date not claim creation time"); equal("1", previousDate.missingDates().claimCount(), "changing date window does not invent a date for missing claims");
        jdbc.update("INSERT INTO biz_expense_item (id,tenant_id,claim_id,expense_type,amount,expense_date) VALUES (?, ?, ?, 'OFFICE',50.50,?)", BASE + 204, TENANT, BASE + 202, TODAY); sessions.clearCache();
        ReportResult filled = expenseResult(input, self); equal("0", filled.missingDates().claimCount(), "filling a real date removes the missing classification");
        decimal("2", one(filled.rows()).getMeasure1(), "filled claim enters the dated count once"); decimal("150.60", one(filled.rows()).getMeasure2(), "filled claim enters dated amount once"); decimal("100.10", one(filled.rows()).getMeasure3(), "filling date does not change approval facts");
        jdbc.update("DELETE FROM biz_expense_item WHERE tenant_id=? AND id=?", TENANT, BASE + 204); sessions.clearCache();
        jdbc.update("UPDATE biz_expense_item SET amount=40.04 WHERE tenant_id=? AND id=?", TENANT, BASE + 201); sessions.clearCache(); fails(400, () -> expenseResult(input, self), "unreconciled detail amounts reject the whole result");
        jdbc.update("UPDATE biz_expense_item SET amount=40.03 WHERE tenant_id=? AND id=?", TENANT, BASE + 201); sessions.clearCache();
        identity(OTHER_TENANT, USER, DEPARTMENT);
        try {
            PreparedReportQuery prepared = ReportValidation.prepare(ReportRegistry.require("OA_EXPENSE"), input, TODAY);
            ReportResult foreign = ReportResult.from(ReportRegistry.require("OA_EXPENSE"), prepared, mapper.expense(OTHER_TENANT, self, prepared));
            equal(0, foreign.rows().size(), "foreign tenant cannot see dated facts from original tenant"); decimal("800000.80", new BigDecimal(foreign.missingDates().claimAmount()), "foreign tenant gets only its own undated amount");
        } finally { identity(TENANT, USER, DEPARTMENT); sessions.clearCache(); }
        equal(5, sessions.getConfiguration().getMappedStatement("com.cloudflow.oa.mapper.OaReportMapper.expense").getTimeout(), "dated and missing summaries execute together with five second timeout");
        System.out.println("REPORT_EXPENSE_DATES_DB: dated_claims=1; dated_amount=100.10; missing_claims=1; missing_amount=50.50; filled_dated_claims=2; filled_dated_amount=150.60; filled_missing_claims=0; distinct_claims=true; create_time_not_used=true; tenant_person_filters=true; one_statement=true");
    }

    private ReportResult expenseResult(ReportQuery input, ReportDataScope scope) {
        PreparedReportQuery query = ReportValidation.prepare(ReportRegistry.require("OA_EXPENSE"), input, TODAY);
        return ReportResult.from(ReportRegistry.require("OA_EXPENSE"), query, sessions.getMapper(OaReportMapper.class).expense(TENANT, scope, query));
    }

    private void sqlMatrix() {
        Map<String, Map<String, String>> expected = Map.of(
                "WF_INSTANCE", Map.of("INSTANCE_COUNT", "3", "DURATION_SECONDS", "3600"),
                "WF_TASK", Map.of("TODO_COUNT", "1", "HANDLED_COUNT", "3", "DURATION_SECONDS", "180"),
                "CRM_FUNNEL", Map.of("OPPORTUNITY_COUNT", "2", "EXPECTED_AMOUNT", "300", "WEIGHTED_AMOUNT", "265"),
                "CRM_AGING", Map.of("PLANNED_AMOUNT", "350", "RECEIVED_AMOUNT", "80", "OUTSTANDING_AMOUNT", "270"),
                "HR_ATTENDANCE", Map.of("RECORD_COUNT", "1", "LATE_MINUTES", "5", "EARLY_MINUTES", "3", "OVERTIME_MINUTES", "20"),
                "HR_LEAVE", Map.of("TOTAL_QUOTA", "11", "USED_QUOTA", "3", "FROZEN_QUOTA", "1", "AVAILABLE_QUOTA", "7"),
                "OA_EXPENSE", Map.of("CLAIM_COUNT", "1", "CLAIM_AMOUNT", "100.10", "APPROVED_AMOUNT", "100.10", "PAID_AMOUNT", "100.10"),
                "OA_BUDGET", Map.of("BUDGET_AMOUNT", "300", "RESERVED_AMOUNT", "20", "ACTUAL_AMOUNT", "80", "AVAILABLE_AMOUNT", "200"),
                "OA_ASSET", Map.of("ASSET_COUNT", "1", "PURCHASE_AMOUNT", "1000", "DEPRECIATION_AMOUNT", "200", "NET_AMOUNT", "800"));
        int queries = 0;
        int dimensionSets = 0;
        for (ReportDataset dataset : ReportRegistry.datasets()) {
            List<String> dimensions = dataset.fields().stream().filter(ReportDataset.Field::dimension).map(ReportDataset.Field::code).toList();
            List<List<String>> groupings = new ArrayList<>(); groupings.add(List.of());
            for (String first : dimensions) {
                groupings.add(List.of(first));
                for (String second : dimensions) if (!first.equals(second)) groupings.add(List.of(first, second));
            }
            dimensionSets += groupings.size();
            ReportQuery.FilterGroup unit = dataset.code().equals("HR_LEAVE") ? group("AND", filter("UNIT", "EQ", "DAY")) : null;
            for (List<String> grouping : groupings) {
                for (ReportDataset.Field field : dataset.fields()) {
                    for (String aggregate : field.aggregates()) {
                        ReportQuery query = new ReportQuery(grouping, List.of(new ReportQuery.Measure(field.code(), aggregate)), unit, List.of(), 500, null, null);
                        List<ReportRow> rows = execute(dataset.code(), query);
                        equal(false, rows.isEmpty(), dataset.code() + " " + grouping + " " + field.code() + " " + aggregate + " has real fixture facts");
                        if (List.of("COUNT", "SUM").contains(aggregate)) {
                            BigDecimal total = rows.stream().map(ReportRow::getMeasure1).reduce(BigDecimal.ZERO, BigDecimal::add);
                            decimal(expected.get(dataset.code()).get(field.code()), total, "all grouped totals reconcile: " + dataset.code() + " " + field.code());
                        } else {
                            for (ReportRow row : rows) {
                                if (row.getMeasure1() == null) continue;
                                if (dataset.code().equals("WF_TASK")) {
                                    equal(true, List.of("120", "180", "240").stream().anyMatch(value -> new BigDecimal(value).compareTo(row.getMeasure1()) == 0), "handled durations exclude negative and TODO facts");
                                } else decimal(expected.get(dataset.code()).get(field.code()), row.getMeasure1(), "exact allowed duration aggregation");
                            }
                        }
                        for (int index = 0; index < grouping.size(); index++) {
                            String fieldCode = grouping.get(index);
                            String expectedId = switch (fieldCode) {
                                case "EMPLOYEE", "LEAVE_TYPE", "CUSTOMER", "CATEGORY" -> Long.toString(BASE + 1);
                                case "OWNER" -> Long.toString(USER);
                                default -> null;
                            };
                            if (expectedId != null) for (ReportRow row : rows) equal(expectedId, index == 0 ? row.getDimension1() : row.getDimension2(), "dimension uses registered identifier " + fieldCode);
                        }
                        queries++;
                    }
                }
            }
        }
        ReportQuery fiveMeasures = new ReportQuery(List.of("EMPLOYEE", "DEPARTMENT"), List.of(
                new ReportQuery.Measure("RECORD_COUNT", "COUNT"), new ReportQuery.Measure("LATE_MINUTES", "SUM"),
                new ReportQuery.Measure("LATE_MINUTES", "AVG"), new ReportQuery.Measure("EARLY_MINUTES", "MAX"),
                new ReportQuery.Measure("OVERTIME_MINUTES", "MIN")), null,
                List.of(new ReportQuery.Sort("dimension1", "ASC"), new ReportQuery.Sort("dimension2", "DESC"),
                        new ReportQuery.Sort("measure1", "ASC"), new ReportQuery.Sort("measure2", "DESC"), new ReportQuery.Sort("measure3", "ASC"),
                        new ReportQuery.Sort("measure4", "DESC"), new ReportQuery.Sort("measure5", "ASC")), 500, null, null);
        ReportRow wide = one(execute("HR_ATTENDANCE", fiveMeasures));
        equal(Long.toString(BASE + 1), wide.getDimension1(), "first projected dimension"); equal(Long.toString(DEPARTMENT), wide.getDimension2(), "second projected dimension");
        decimal("1", wide.getMeasure1(), "first measure"); decimal("5", wide.getMeasure2(), "second measure"); decimal("5", wide.getMeasure3(), "third measure"); decimal("3", wide.getMeasure4(), "fourth measure"); decimal("20", wide.getMeasure5(), "fifth measure");
        for (String direction : List.of("ASC", "DESC")) {
            ReportQuery query = new ReportQuery(List.of("STAGE"), List.of(new ReportQuery.Measure("EXPECTED_AMOUNT", "SUM")), null, List.of(new ReportQuery.Sort("measure1", direction)), 1, null, null);
            PreparedReportQuery prepared = ReportValidation.prepare(ReportRegistry.require("CRM_FUNNEL"), query, TODAY);
            ReportResult result = ReportResult.from(ReportRegistry.require("CRM_FUNNEL"), prepared, sessions.getMapper(CrmReportMapper.class).funnel(TENANT, self, prepared));
            equal(true, result.truncated(), "sorted max plus one signals actual truncation"); decimal(direction.equals("ASC") ? "100" : "200", one(result.rows()).getMeasure1(), "sorting precedes limit");
        }
        System.out.println("REPORT_SQL_MATRIX: source_datasets=9; dimension_sets=" + dimensionSets + "; dimension_aggregate_queries=" + queries + "; all_registered_aggregates=true; max_projection=2_dimensions_5_measures; sort_columns=7; sorted_limit_verified=true");
    }

    private void filters() {
        int before = assertions;
        String employee = Long.toString(BASE + 1);
        for (String field : List.of("LATE_MINUTES", "EMPLOYEE", "BUSINESS_DATE")) {
            String value = field.equals("LATE_MINUTES") ? "5" : field.equals("EMPLOYEE") ? employee : TODAY.toString();
            String lower = field.equals("LATE_MINUTES") ? "4" : field.equals("EMPLOYEE") ? Long.toString(BASE) : TODAY.minusDays(1).toString();
            String upper = field.equals("LATE_MINUTES") ? "6" : field.equals("EMPLOYEE") ? Long.toString(BASE + 2) : TODAY.plusDays(1).toString();
            filteredCount("HR_ATTENDANCE", group("AND", filter(field, "EQ", value)), 1);
            filteredCount("HR_ATTENDANCE", group("AND", filter(field, "NE", value)), 0);
            filteredCount("HR_ATTENDANCE", group("AND", filter(field, "GT", lower)), 1);
            filteredCount("HR_ATTENDANCE", group("AND", filter(field, "GT", value)), 0);
            filteredCount("HR_ATTENDANCE", group("AND", filter(field, "GE", value)), 1);
            filteredCount("HR_ATTENDANCE", group("AND", filter(field, "LT", upper)), 1);
            filteredCount("HR_ATTENDANCE", group("AND", filter(field, "LT", value)), 0);
            filteredCount("HR_ATTENDANCE", group("AND", filter(field, "LE", value)), 1);
            filteredCount("HR_ATTENDANCE", group("AND", filter(field, "IN", lower, value, upper)), 1);
            filteredCount("HR_ATTENDANCE", group("AND", filter(field, "BETWEEN", value, value)), 1);
            filteredCount("HR_ATTENDANCE", group("AND", filter(field, "IS_NULL")), 0);
        }
        filteredCount("HR_ATTENDANCE", group("AND", filter("STATUS", "EQ", "NORMAL")), 1);
        filteredCount("HR_ATTENDANCE", group("AND", filter("STATUS", "NE", "NORMAL")), 0);
        filteredCount("HR_ATTENDANCE", group("AND", filter("STATUS", "LIKE", "OR")), 1);
        filteredCount("HR_ATTENDANCE", group("AND", filter("STATUS", "IN", "ABSENT", "NORMAL")), 1);
        filteredCount("HR_ATTENDANCE", group("AND", filter("STATUS", "IS_NULL")), 0);
        filteredCount("HR_ATTENDANCE", new ReportQuery.FilterGroup("AND", List.of(filter("EMPLOYEE", "EQ", employee)),
                List.of(group("OR", filter("LATE_MINUTES", "EQ", "5"), filter("LATE_MINUTES", "EQ", "999")))), 1);
        filteredCount("HR_ATTENDANCE", new ReportQuery.FilterGroup("OR", List.of(), List.of(
                group("AND", filter("LATE_MINUTES", "EQ", "5"), filter("EMPLOYEE", "EQ", employee)),
                group("AND", filter("LATE_MINUTES", "EQ", "999")))), 1);
        filteredCount("HR_ATTENDANCE", group("OR", filter("EMPLOYEE", "EQ", employee), filter("EMPLOYEE", "EQ", Long.toString(BASE + 2))), 1);
        filteredCount("OA_ASSET", group("AND", filter("CUSTODIAN", "IS_NULL")), 1);
        filteredCount("OA_ASSET", group("AND", filter("CUSTODIAN", "EQ", Long.toString(USER))), 0);
        jdbc.update("UPDATE crm_opportunity SET stage='S%_!tage' WHERE opportunity_id=? AND tenant_id=?", BASE + 1, TENANT); sessions.clearCache();
        try {
            for (String literal : List.of("%", "_", "!", "S%_!tage")) filteredCount("CRM_FUNNEL", group("AND", filter("STAGE", "LIKE", literal)), 1);
            filteredCount("CRM_FUNNEL", group("AND", filter("STAGE", "LIKE", "%' OR 1=1 --")), 0);
            filteredCount("CRM_FUNNEL", group("AND", filter("STAGE", "EQ", "' OR 1=1 --")), 0);
        } finally { jdbc.update("UPDATE crm_opportunity SET stage='LEAD' WHERE opportunity_id=? AND tenant_id=?", BASE + 1, TENANT); sessions.clearCache(); }
        System.out.println("REPORT_FILTER_SQL: assertions=" + (assertions - before) + "; types=TEXT_ID_NUMBER_DATE; operators=10; nested_groups=2; literal_wildcards=true; bound_injection_returns_zero=true; OR_cannot_expand_scope=true");
    }

    private List<ReportRow> execute(String code, ReportQuery input) {
        PreparedReportQuery query = ReportValidation.prepare(ReportRegistry.require(code), input, TODAY);
        List<ReportRow> rows = switch (code) {
            case "WF_INSTANCE" -> sessions.getMapper(WorkflowReportMapper.class).instances(TENANT, USER, false, Set.of(), query);
            case "WF_TASK" -> sessions.getMapper(WorkflowReportMapper.class).tasks(TENANT, USER, false, Set.of(), true, true, query);
            case "CRM_FUNNEL" -> sessions.getMapper(CrmReportMapper.class).funnel(TENANT, self, query);
            case "CRM_AGING" -> sessions.getMapper(CrmReportMapper.class).aging(TENANT, self, query, List.of(new CrmReportService.AgingTier(30, "DUE_30", "逾期1—30天")), new CrmReportService.AgingTier(Long.MAX_VALUE, "OLDER", "逾期30天以上"));
            case "HR_ATTENDANCE" -> sessions.getMapper(HrReportMapper.class).attendance(TENANT, self, query);
            case "HR_LEAVE" -> sessions.getMapper(HrReportMapper.class).leave(TENANT, self, query);
            case "OA_EXPENSE" -> sessions.getMapper(OaReportMapper.class).expense(TENANT, self, query);
            case "OA_BUDGET" -> sessions.getMapper(OaReportMapper.class).budget(TENANT, self, query);
            case "OA_ASSET" -> sessions.getMapper(OaReportMapper.class).assets(TENANT, query);
            default -> throw new AssertionError("Unregistered SQL matrix source");
        };
        return valid(code, query, rows);
    }

    private void filteredCount(String code, ReportQuery.FilterGroup filters, int expected) {
        String count = switch (code) { case "HR_ATTENDANCE" -> "RECORD_COUNT"; case "CRM_FUNNEL" -> "OPPORTUNITY_COUNT"; case "OA_ASSET" -> "ASSET_COUNT"; default -> throw new AssertionError("Count source required"); };
        List<ReportRow> rows = execute(code, new ReportQuery(List.of(), List.of(new ReportQuery.Measure(count, "COUNT")), filters, List.of(), 500, null, null));
        BigDecimal actual = rows.stream().map(ReportRow::getMeasure1).reduce(BigDecimal.ZERO, BigDecimal::add);
        decimal(Integer.toString(expected), actual, "typed source filter " + code + " " + filters);
    }

    private ReportQuery.Filter filter(String field, String operator, String... values) {
        return new ReportQuery.Filter(field, operator, java.util.Arrays.stream(values).<JsonNode>map(json.getNodeFactory()::textNode).toList());
    }

    private static ReportQuery.FilterGroup group(String junction, ReportQuery.Filter... conditions) {
        return new ReportQuery.FilterGroup(junction, List.of(conditions), List.of());
    }

    private void definitions() {
        ReportDatasetService datasets = new ReportDatasetService(sessions.getMapper(SysReportDatasetMapper.class), json);
        ReportDefinitionService target = new ReportDefinitionService(sessions.getMapper(SysReportChartMapper.class), sessions.getMapper(SysReportDashboardMapper.class), sessions.getMapper(SysReportDashboardItemMapper.class), datasets, json);
        ProxyFactory proxy = new ProxyFactory(target); proxy.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));
        ReportDefinitionService service = (ReportDefinitionService) proxy.getProxy();
        equal(9, datasets.list().size(), "nine deployment registered datasets"); equal("OA_EXPENSE", datasets.require("OA_EXPENSE").getDatasetCode(), "approved expense missing date policy is available");
        ReportQuery query = input("WF_INSTANCE", List.of("STATUS"), List.of("INSTANCE_COUNT:COUNT"));
        Long id = service.saveChart(new ReportDefinitionInput.Chart(null, null, "本人图表", "BAR", "WF_INSTANCE", query, null)); String chartId = id.toString();
        equal(true, service.chart(chartId).editable(), "owner can edit definition");
        Long dashboardId = service.saveDashboard(new ReportDefinitionInput.Dashboard(null, null, "本人仪表盘", "", List.of(new ReportDefinitionInput.Item(chartId, 0, 0, 6, 10))));
        fails(409, () -> service.removeChart(chartId, 0), "referenced chart deletion prevented");
        service.share(new ReportDefinitionInput.Share("DASHBOARD", dashboardId.toString(), "TENANT", 0));
        identity(TENANT, PEER, OTHER_DEPARTMENT);
        fails(404, () -> service.chart(chartId), "private chart not readable by another admin");
        equal("NO_DEFINITION_ACCESS", service.dashboard(dashboardId.toString()).items().get(0).availability(), "shared dashboard does not share private chart");
        fails(404, () -> service.removeDashboard(dashboardId.toString(), 1), "another admin cannot delete owner's dashboard");
        fails(404, () -> service.share(new ReportDefinitionInput.Share("CHART", chartId, "TENANT", 0)), "another admin cannot share owner's chart");
        identity(TENANT, USER, DEPARTMENT); service.share(new ReportDefinitionInput.Share("CHART", chartId, "DEPT", 0));
        identity(TENANT, PEER, OTHER_DEPARTMENT); fails(404, () -> service.chart(chartId), "department share excludes another department");
        identity(TENANT, PEER, DEPARTMENT); equal(false, service.chart(chartId).editable(), "department share read only");
        fails(404, () -> service.saveChart(new ReportDefinitionInput.Chart(chartId, 1, "非法编辑", "BAR", "WF_INSTANCE", query, null)), "shared definitions do not become writable");
        identity(OTHER_TENANT, USER, DEPARTMENT); fails(404, () -> service.chart(chartId), "same user different tenant cannot open chart");
        identity(TENANT, USER, DEPARTMENT); service.share(new ReportDefinitionInput.Share("CHART", chartId, "TENANT", 1));
        fails(409, () -> service.share(new ReportDefinitionInput.Share("CHART", chartId, "PRIVATE", 1)), "stale version rejected");
        identity(TENANT, PEER, OTHER_DEPARTMENT); equal("AVAILABLE", service.dashboard(dashboardId.toString()).items().get(0).availability(), "explicitly shared chart visible");
        identity(TENANT, USER, DEPARTMENT); service.share(new ReportDefinitionInput.Share("CHART", chartId, "PRIVATE", 2));
        identity(TENANT, PEER, OTHER_DEPARTMENT); fails(404, () -> service.chart(chartId), "old address checks revoked sharing"); equal("NO_DEFINITION_ACCESS", service.dashboard(dashboardId.toString()).items().get(0).availability(), "embedded chart revocation enforced");
        identity(TENANT, USER, DEPARTMENT);
        jdbc.update("UPDATE sys_report_dataset SET mapper_method='tampered.Mapper.execute' WHERE tenant_id=? AND dataset_code='WF_INSTANCE'", TENANT);
        sessions.clearCache();
        fails(409, () -> datasets.require("WF_INSTANCE"), "actual persisted mapper tampering rejected");
        equal("INVALID_CONFIGURATION", service.dashboard(dashboardId.toString()).items().get(0).availability(), "invalid chart isolated within dashboard");
        jdbc.update("UPDATE sys_report_dataset SET mapper_method='WorkflowReportMapper.instances' WHERE tenant_id=? AND dataset_code='WF_INSTANCE'", TENANT);
        sessions.clearCache();
        service.removeDashboard(dashboardId.toString(), 1); service.removeChart(chartId, 3); fails(404, () -> service.chart(chartId), "deleted chart address unavailable");
        System.out.println("REPORT_DEFINITIONS_DB: owner_only=true; admin_no_override=true; department_and_tenant_shares=true; revoked_old_address=404; stale_version=409; reference_delete=409; mapper_tampering=409; chart_failure_isolated=true");
    }

    private void truncation() {
        List<Object[]> employees = new ArrayList<>(); List<Object[]> records = new ArrayList<>();
        for (int index = 0; index < 2001; index++) { long id = BASE + 10000 + index; employees.add(new Object[]{ id, TENANT, "REPORT_LIMIT_" + index, "截断员工", DEPARTMENT }); records.add(new Object[]{ id, TENANT, id, TODAY }); }
        jdbc.batchUpdate("INSERT INTO hr_employee (id,tenant_id,employee_no,name,gender,dept_id) VALUES (?,?,?,?,'UNKNOWN',?)", employees);
        jdbc.batchUpdate("INSERT INTO hr_attendance_record (id,tenant_id,employee_id,attendance_date) VALUES (?,?,?,?)", records);
        PreparedReportQuery query = ReportValidation.prepare(ReportRegistry.require("HR_ATTENDANCE"), new ReportQuery(List.of("EMPLOYEE"), List.of(new ReportQuery.Measure("RECORD_COUNT", "COUNT")), null, List.of(), 2000, null, null), TODAY);
        List<ReportRow> sourceRows = sessions.getMapper(HrReportMapper.class).attendance(TENANT, all, query); equal(2001, sourceRows.size(), "database returns only max plus one");
        ReportResult result = ReportResult.from(ReportRegistry.require("HR_ATTENDANCE"), query, sourceRows); equal(true, result.truncated(), "actual row excess declared"); equal(2000, result.rows().size(), "client limit enforced");
        System.out.println("REPORT_TRUNCATION_DB: database_rows=2001; response_rows=2000; truncated=true");
        List<Object[]> expenseClaims = new ArrayList<>(); List<Object[]> expenseItems = new ArrayList<>();
        for (int index = 0; index < 2001; index++) {
            long id = BASE + 20000 + index;
            expenseClaims.add(new Object[]{id, TENANT, USER, DEPARTMENT, "REPORT_LIMIT_" + index});
            expenseItems.add(new Object[]{id, TENANT, id, "TYPE_" + index, TODAY});
        }
        jdbc.batchUpdate("INSERT INTO biz_expense_claim (id,tenant_id,user_id,dept_id,claim_no,category,total_amount) VALUES (?,?,?,?,?,'OTHER',1.00)", expenseClaims);
        jdbc.batchUpdate("INSERT INTO biz_expense_item (id,tenant_id,claim_id,expense_type,expense_date,amount) VALUES (?,?,?,?,?,1.00)", expenseItems);
        PreparedReportQuery expenseQuery = ReportValidation.prepare(ReportRegistry.require("OA_EXPENSE"), new ReportQuery(List.of("EXPENSE_TYPE"), List.of(new ReportQuery.Measure("CLAIM_AMOUNT", "SUM")), null, List.of(), 2000, null, null), TODAY);
        List<ReportRow> expenseRows = sessions.getMapper(OaReportMapper.class).expense(TENANT, self, expenseQuery);
        equal(2002, expenseRows.size(), "expense query returns max plus one dated rows and exactly one summary");
        ReportResult expenseResult = ReportResult.from(ReportRegistry.require("OA_EXPENSE"), expenseQuery, expenseRows);
        equal(2000, expenseResult.rows().size(), "expense response dated row limit"); equal(true, expenseResult.truncated(), "expense dated groups declare truncation"); equal("1", expenseResult.missingDates().claimCount(), "truncation never drops missing date summary");
        System.out.println("REPORT_EXPENSE_TRUNCATION_DB: dated_response_rows=2000; truncated=true; separate_summary_rows=1; missing_claims=1; one_statement=true");
    }

    private void timeout() throws Exception {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try (Connection locked = source.getConnection(); Statement lock = locked.createStatement()) {
          for (String code : List.of("HR_ATTENDANCE", "OA_EXPENSE")) {
            lock.execute(code.equals("OA_EXPENSE") ? "LOCK TABLES biz_expense_item WRITE" : "LOCK TABLES hr_attendance_record WRITE");
            try {
                Future<Long> measured = executor.submit(() -> {
                    identity(TENANT, USER, DEPARTMENT); long started = System.nanoTime();
                    try {
                        PreparedReportQuery query = prepared(code, List.of(), List.of(code.equals("OA_EXPENSE") ? "CLAIM_COUNT:COUNT" : "RECORD_COUNT:COUNT"));
                        if (code.equals("OA_EXPENSE")) sessions.getMapper(OaReportMapper.class).expense(TENANT, self, query);
                        else sessions.getMapper(HrReportMapper.class).attendance(TENANT, self, query);
                        throw new AssertionError("locked report query unexpectedly succeeded");
                    } catch (RuntimeException failure) {
                        Throwable cause = failure; while (cause.getCause() != null) cause = cause.getCause();
                        if (!cause.getClass().getName().contains("Timeout") && !String.valueOf(cause.getMessage()).toLowerCase().contains("timeout")) throw failure;
                        return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
                    } finally { UserContext.clear(); TenantContext.clear(); }
                });
                long elapsed = measured.get(15, TimeUnit.SECONDS); if (elapsed < 4000 || elapsed > 14000) throw new AssertionError("SQL timeout outside measured boundary: " + elapsed); assertions++;
                System.out.println("REPORT_SQL_TIMEOUT_DB: dataset=" + code + "; configured_seconds=5; cancelled=true; elapsed_ms=" + elapsed + "; real_table_lock=true");
            } finally { lock.execute("UNLOCK TABLES"); }
          }
        } finally { executor.shutdownNow(); }
    }

    private static ReportQuery input(String code, List<String> dimensions, List<String> measures) { ReportRegistry.require(code); return new ReportQuery(dimensions, measures.stream().map(value -> { String[] parts = value.split(":"); return new ReportQuery.Measure(parts[0], parts[1]); }).toList(), null, List.of(), 500, null, null); }
    private static FileSystemResource resource(Path root, String module, String file) { return new FileSystemResource(root.resolve("cloudflow-backend").resolve(module).resolve("src/main/resources/mapper").resolve(file)); }
    private static PreparedReportQuery prepared(String code, List<String> dimensions, List<String> measures) { return ReportValidation.prepare(ReportRegistry.require(code), input(code, dimensions, measures), TODAY); }
    private static List<ReportRow> valid(String code, PreparedReportQuery query, List<ReportRow> rows) { return ReportResult.from(ReportRegistry.require(code), query, rows).rows(); }
    private static ReportRow one(List<ReportRow> rows) { equal(1, rows.size(), "one aggregate result"); return rows.get(0); }
    private static ReportRow row(List<ReportRow> rows, String dimension) { return rows.stream().filter(value -> Objects.equals(value.getDimension1(), dimension)).findFirst().orElseThrow(() -> new AssertionError("missing dimension " + dimension)); }
    private static void decimal(String expected, BigDecimal actual, String label) { if (actual == null || new BigDecimal(expected).compareTo(actual) != 0) throw new AssertionError(label + ": expected=" + expected + "; actual=" + actual); assertions++; }
    private static void equal(Object expected, Object actual, String label) { if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + "; actual=" + actual); assertions++; }
    private static void fails(int code, Runnable operation, String label) { try { operation.run(); } catch (ServiceException expected) { equal(code, expected.getCode(), label); return; } throw new AssertionError(label + ": unexpectedly accepted"); }
    private static void identity(long tenant, long user, long department) { TenantContext.clear(); TenantContext.setTenantId(tenant); UserContext.setTenantId(tenant); UserContext.setUserId(user); UserContext.setDeptId(department); UserContext.setUserName("report-fixture"); UserContext.setAuthToken("report-isolated-token"); }
    @Override public void close() { source.close(); }
}
