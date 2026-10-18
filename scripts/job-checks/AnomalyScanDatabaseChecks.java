package com.cloudflow.workflow.service.monitor.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.job.config.JobInvocationContext;
import com.cloudflow.common.job.model.JobExecuteDTO;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.config.MessageAutoConfiguration;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.workflow.mapper.AnomalyAlertMapper;
import com.cloudflow.workflow.mapper.PerformanceStatsMapper;
import com.cloudflow.workflow.mapper.ProcessMonitorMapper;
import com.cloudflow.workflow.mapper.TaskMonitorMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.mapper.WfTaskCandidateMapper;
import com.cloudflow.workflow.mapper.WfTaskDelegationMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.service.WorkflowHParticipantPolicy;
import com.cloudflow.workflow.service.impl.WfEmployeeOffboardTransferService;
import com.cloudflow.workflow.service.impl.WfCandidateOffboardService;
import com.cloudflow.workflow.service.impl.WfUserDisabledCleanupService;
import com.cloudflow.workflow.domain.monitor.AnomalyAlert;
import com.cloudflow.workflow.service.monitor.IAnomalyDetectionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.ibatis.session.LocalCacheScope;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** Actual scan handlers, mapper SQL, statistics and message outbox in an exclusively owned temporary schema. */
public final class AnomalyScanDatabaseChecks {
    private static final List<String> TABLES = List.of("wf_process_instance", "wf_task", "wf_process_monitor", "wf_task_monitor",
            "wf_timeout_alert", "wf_anomaly_alert", "wf_performance_stats", "outbox_event", "wf_task_candidate", "wf_task_delegation", "sys_user", "wf_process_definition");
    private static int checks;
    private static JdbcTemplate jdbc;
    private static HikariDataSource source;
    private static SqlSessionTemplate sessions;
    private static MessageSender sender;
    private static TransactionTemplate transactions;
    private static final LocalDateTime NOW = LocalDateTime.now().withNano(0);
    private static final TenantIterator TENANTS = new TenantIterator(null) {
        @Override public List<Long> listActiveTenantIds() { return List.of(10L, 20L); }
    };
    private static long failConfigurationTenant = -1;
    private static final SysConfigHelper CONFIG = new SysConfigHelper() {
        @Override public int getConfigInt(String key, int fallback) {
            if (Objects.equals(TenantContext.getTenantId(), failConfigurationTenant)) throw new IllegalStateException("OWNED_CONFIG_FAILURE");
            return 24;
        }
    };

    public static void main(String[] args) throws Exception {
        if (args.length != 4 || !args[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/cloud_flow_db\\?.*")) throw new IllegalArgumentException("Owned JDBC, datadir, root and focus required");
        String focus = args[3];
        if (!List.of("suite", "offboard-long-name", "offboard-after-disable").contains(focus)) throw new IllegalArgumentException("Unknown verification focus");
        String schema = "a3_anomaly_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        boolean created = false;
        try (Connection owner = DriverManager.getConnection(args[0], "root", ""); Statement statement = owner.createStatement()) {
            try (ResultSet result = statement.executeQuery("SELECT @@datadir")) {
                check(result.next() && Path.of(result.getString(1)).toRealPath().equals(Path.of(args[1]).toRealPath()), "owned database identity");
            }
            try {
                statement.execute("CREATE DATABASE %s CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci".formatted(schema)); created = true;
                HikariConfig pool = new HikariConfig();
                pool.setJdbcUrl(args[0].replace("/cloud_flow_db?", "/" + schema + "?")); pool.setUsername("root"); pool.setPassword("");
                pool.setMaximumPoolSize(4); pool.setMinimumIdle(1); pool.setConnectionTimeout(10000); pool.setPoolName("owned-anomaly-checks");
                source = new HikariDataSource(pool); jdbc = new JdbcTemplate(source); jdbc.setQueryTimeout(15);
                for (String table : TABLES) jdbc.execute("CREATE TABLE %s LIKE cloud_flow_db.%s".formatted(table, table));
                setup(Path.of(args[2]));
                if ("offboard-long-name".equals(focus)) {
                    offboardLongName();
                } else if ("offboard-after-disable".equals(focus)) {
                    offboardAfterDisable();
                } else {
                    messageRollbackAndContinuation(); statisticsRollback(); flagRollbackAndPending(); eligibilityAndScopes(); paging(); concurrency(true); concurrency(false);
                    eventNotifications(); eventConcurrency(); disabledUserCleanup(); disabledCandidateConcurrency(); disabledReassignmentRace(); disabledAnomalyMetadata();
                    offboardStaleRace(true); offboardStaleRace(false); offboardTransactions(); offboardSuccessorLock();
                    offboardOpenInstances(); offboardMonitorConflict(); offboardLongName(); offboardAfterDisable();
                    releasedHandoverScopes(); releasedHandoverRollback(); releasedHandoverRace(false); releasedHandoverRace(true);
                    offboardFrozenHParticipants();
                }
                check(TenantContext.getTenantId() == null && UserContext.getTenantId() == null, "all tenant contexts restored");
                System.out.println("ANOMALY_SCAN_DATABASE: checks=" + checks + "; failed=0; focus=" + focus + "; real_handlers_mysql=true; http=false; delivery=false; long_name_and_released_handover_in_default_suite=true");
            } finally {
                TenantContext.clear(); UserContext.clear();
                if (source != null) source.close();
                if (created) {
                    if (!schema.matches("a3_anomaly_[a-f0-9]{12}")) throw new IllegalStateException("Exclusive schema required");
                    statement.execute("DROP DATABASE %s".formatted(schema));
                    try (ResultSet result = statement.executeQuery("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='%s'".formatted(schema))) {
                        check(result.next() && result.getInt(1) == 0, "temporary schema removed");
                    }
                }
                System.out.println("ANOMALY_SCAN_RESTORED: temporary_schema_removed=true; original_schema_untouched=true");
            }
        }
        System.out.println("ANOMALY_SCAN_FINAL: checks=" + checks + "; failed=0; cleanup_verified=true");
    }

    private static void setup(Path root) throws Exception {
        transactions = new TransactionTemplate(new DataSourceTransactionManager(source)); transactions.setTimeout(15);
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true); configuration.setCacheEnabled(false);
        configuration.setLocalCacheScope(LocalCacheScope.STATEMENT); configuration.setDefaultStatementTimeout(15);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        for (Class<?> mapper : List.of(ProcessMonitorMapper.class, WfTaskMapper.class, WfProcessInstanceMapper.class,
                WfTaskCandidateMapper.class, WfTaskDelegationMapper.class, SysUserMapper.class, WfProcessDefinitionMapper.class,
                AnomalyAlertMapper.class, PerformanceStatsMapper.class, TaskMonitorMapper.class, OutboxEventMapper.class)) configuration.addMapper(mapper);
        GlobalConfig global = new GlobalConfig(); global.setBanner(false); global.setDbConfig(new GlobalConfig.DbConfig());
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(source); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
        MybatisPlusInterceptor plugins = new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor();
        factory.setPlugins(plugins);
        Path workflow = root.resolve("cloudflow-backend/cloudflow-service-workflow/src/main/resources/mapper/workflow");
        factory.setMapperLocations(new FileSystemResource(workflow.resolve("ProcessMonitorMapper.xml")),
                new FileSystemResource(workflow.resolve("WfProcessInstanceMapper.xml")),
                new FileSystemResource(workflow.resolve("../system/SysUserMapper.xml")),
                new FileSystemResource(workflow.resolve("AnomalyAlertMapper.xml")),
                new FileSystemResource(workflow.resolve("WfTaskMapper.xml")),
                new FileSystemResource(workflow.resolve("WfTaskCandidateMapper.xml")),
                new FileSystemResource(workflow.resolve("PerformanceStatsMapper.xml")),
                new FileSystemResource(workflow.resolve("TaskMonitorMapper.xml")),
                new FileSystemResource(root.resolve("cloudflow-backend/cloudflow-common/cloudflow-common-event/src/main/resources/mapper/OutboxEventMapper.xml")));
        sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        ObjectMapper json = new ObjectMapper().findAndRegisterModules();
        StandardEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().addFirst(new MapPropertySource("owned-anomaly", Map.of("spring.application.name", "cloudflow-service-workflow",
                "cloudflow.message.secret-key", UUID.randomUUID().toString())));
        sender = new MessageAutoConfiguration().messageSender(new OutboxPublisher(sessions.getMapper(OutboxEventMapper.class), json), json, environment);
    }

    private static AnomalyDetectionServiceImpl service(MessageSender messages) {
        return new AnomalyDetectionServiceImpl(sessions.getMapper(AnomalyAlertMapper.class), sessions.getMapper(ProcessMonitorMapper.class),
                sessions.getMapper(WfTaskMapper.class), sessions.getMapper(WfProcessInstanceMapper.class),
                new PerformanceStatsRefreshService(sessions.getMapper(PerformanceStatsMapper.class), sessions.getMapper(ProcessMonitorMapper.class), sessions.getMapper(TaskMonitorMapper.class)),
                TENANTS, CONFIG, messages, transactions);
    }
    private static void reset() {
        for (String table : TABLES) jdbc.execute("DELETE FROM %s".formatted(table));
        failConfigurationTenant = -1;
    }
    private static void seed(long tenant, long id, String bucket, LocalDateTime start, String status) {
        jdbc.update("INSERT INTO wf_process_instance(instance_id,tenant_id,process_def_key,business_key,start_user_id,status,start_time) VALUES (?,?,?,?,?,'RUNNING',?)",
                "i" + id, tenant, bucket, "i" + id, tenant + 100, start);
        jdbc.update("INSERT INTO wf_process_monitor(id,tenant_id,instance_id,process_def_key,process_def_name,status,start_time) VALUES (?,?,?,?,?,?,?)",
                id, tenant, "i" + id, bucket, "Owned process", status, start);
    }
    private static void task(long tenant, long monitor, String status) {
        jdbc.update("INSERT INTO wf_task(task_id,tenant_id,instance_id,node_key,node_name,status) VALUES (?,?,?,'review','Review',?)",
                "t" + tenant + "-" + monitor, tenant, "i" + monitor, status);
    }
    private static long count(String table) { return Objects.requireNonNull(jdbc.queryForObject("SELECT COUNT(*) FROM %s".formatted(table), Long.class)); }
    private static long scalar(String sql, Object... args) { return Objects.requireNonNull(jdbc.queryForObject(sql, Long.class, args)); }
    private static JobResult scan(long tenant, boolean deadlock) {
        return TenantBroker.applyAs(tenant, ignored -> deadlock ? service(sender).detectDeadlock() : service(sender).detectDataInconsistency());
    }

    private static void messageRollbackAndContinuation() {
        reset(); seed(10, 1, "fail", NOW.minusHours(26), "RUNNING"); seed(10, 2, "good", NOW.minusHours(26), "RUNNING"); seed(20, 3, "other", NOW.minusHours(26), "RUNNING");
        jdbc.execute("CREATE TRIGGER own_anomaly_message_failure BEFORE INSERT ON outbox_event FOR EACH ROW BEGIN IF EXISTS(SELECT 1 FROM wf_anomaly_alert WHERE id=NEW.aggregate_id AND instance_id='i1') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OWNED_MESSAGE_FAILURE'; END IF; END");
        RuntimeException failure = caught(() -> service(sender).detectDeadlock());
        check(contains(failure, "OWNED_MESSAGE_FAILURE"), "original message insert error retained");
        check(count("wf_anomaly_alert") == 2 && count("outbox_event") == 2 && count("wf_performance_stats") == 2,
                "failed row rolls back alert message and stats while same and later tenants commit");
        check(scalar("SELECT COUNT(*) FROM wf_anomaly_alert WHERE instance_id='i1'") == 0, "no partial alert survives failed message");
        jdbc.execute("DROP TRIGGER own_anomaly_message_failure");
        check(service(sender).detectDeadlock().getAffectedRows() == 1 && count("outbox_event") == 3, "recovery commits exactly failed item");
        check(service(sender).detectDeadlock().getAffectedRows() == 0 && count("wf_anomaly_alert") == 3 && count("outbox_event") == 3, "repeat creates neither alerts nor messages");
        check(scalar("SELECT SUM(anomaly_count) FROM wf_performance_stats") == 3, "real statistics match committed alerts");
        System.out.println("ANOMALY_SCAN_CASE: message_rollback_continuation_recovery=PASS");
    }

    private static void statisticsRollback() {
        reset(); seed(10, 1, "metrics", NOW.minusHours(26), "RUNNING");
        jdbc.execute("CREATE TRIGGER own_anomaly_stats_failure BEFORE UPDATE ON wf_performance_stats FOR EACH ROW BEGIN IF NEW.anomaly_count>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OWNED_STATS_FAILURE'; END IF; END");
        check(contains(caught(() -> scan(10, true)), "OWNED_STATS_FAILURE"), "actual statistics update failure reported");
        check(count("wf_anomaly_alert") == 0 && count("outbox_event") == 0 && count("wf_performance_stats") == 0, "late statistics failure rolls back notice flag message alert and bucket");
        jdbc.execute("DROP TRIGGER own_anomaly_stats_failure");
        check(scan(10, true).getAffectedRows() == 1 && scalar("SELECT SUM(anomaly_count) FROM wf_performance_stats") == 1, "statistics failure recovers on next scan");
    }

    private static void flagRollbackAndPending() {
        reset(); seed(10, 1, "pending", NOW.minusHours(26), "RUNNING");
        jdbc.execute("CREATE TRIGGER own_anomaly_flag_failure BEFORE UPDATE ON wf_anomaly_alert FOR EACH ROW BEGIN IF NEW.notification_sent='Y' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OWNED_FLAG_FAILURE'; END IF; END");
        check(contains(caught(() -> scan(10, true)), "OWNED_FLAG_FAILURE") && count("outbox_event") == 0 && count("wf_anomaly_alert") == 0, "notification flag failure rolls back actual message and alert");
        jdbc.execute("DROP TRIGGER own_anomaly_flag_failure");
        check(scan(10, true).getAffectedRows() == 1, "notification flag recovery");
        long alertId = scalar("SELECT id FROM wf_anomaly_alert");
        jdbc.update("UPDATE wf_anomaly_alert SET notification_sent='N' WHERE id=?", alertId);
        JobResult repaired = scan(10, true);
        check(repaired.getAffectedRows() == 1 && repaired.getResultMsg().contains("新增告警0条，补登提醒1条"), "existing pending alert counted only as reminder repair");
        check(count("outbox_event") == 1 && count("wf_anomaly_alert") == 1 && scalar("SELECT COUNT(*) FROM wf_anomaly_alert WHERE notification_sent='Y'") == 1,
                "real stable message identity prevents duplicate on pending flag recovery");
        jdbc.update("UPDATE wf_anomaly_alert SET notification_sent='N' WHERE id=?", alertId);
        jdbc.update("INSERT INTO wf_anomaly_alert(tenant_id,instance_id,process_def_key,process_def_name,anomaly_type,severity,error_message,resolved,alert_time,notification_sent,create_time,update_time) SELECT tenant_id,instance_id,process_def_key,process_def_name,anomaly_type,severity,error_message,resolved,alert_time,'N',create_time,update_time FROM wf_anomaly_alert WHERE id=?", alertId);
        JobResult multiple = scan(10, true);
        check(multiple.getAffectedRows() == 2 && multiple.getResultMsg().contains("新增告警0条，补登提醒2条"), "multiple pending alerts count every repaired reminder");
        check(count("outbox_event") == 2 && count("wf_anomaly_alert") == 2 && scan(10, true).getAffectedRows() == 0,
                "multiple pending recovery retains stable identities and leaves no repeat work");
        jdbc.update("UPDATE wf_anomaly_alert SET resolved='Y' WHERE instance_id='i1'");
        check(scan(10, true).getAffectedRows() == 1 && count("outbox_event") == 3, "a resolved previous occurrence allows new alert and reminder");
        System.out.println("ANOMALY_SCAN_CASE: statistics_flag_rollback_and_pending_repair=PASS");
    }

    private static void eligibilityAndScopes() throws Exception {
        reset();
        seed(10, 1, "boundary", NOW.minusHours(23), "RUNNING");
        seed(10, 2, "boundary", NOW.minusHours(24).minusMinutes(1), "RUNNING");
        seed(10, 3, "boundary", NOW.minusHours(26), "RUNNING"); task(10, 3, "TODO");
        seed(10, 4, "boundary", NOW.minusHours(26), "PASSED");
        seed(20, 5, "other", NOW.minusHours(26), "RUNNING");
        task(20, 2, "TODO");
        check(scan(10, true).getAffectedRows() == 1 && scalar("SELECT COUNT(*) FROM wf_anomaly_alert WHERE instance_id='i2'") == 1,
                "configured hours use full precision and ignore other tenant tasks, active tasks and finished monitors");
        TenantBroker.runAs(10L, ignored -> {
            JobExecuteDTO request = new JobExecuteDTO(); request.setHandlerName("anomalyDetect");
            try { check(JobInvocationContext.callWithPlatformLock(request, service(sender)::detectDeadlock).getAffectedRows() == 1, "platform invocation scans other active tenant"); }
            catch (Exception failure) { throw new IllegalStateException(failure); }
            check(Objects.equals(TenantContext.getTenantId(), 10L) && Objects.equals(UserContext.getTenantId(), 10L), "platform call restores caller contexts");
        });
        reset(); seed(10, 1, "daily", NOW.minusHours(1), "RUNNING"); seed(10, 2, "daily", NOW.minusHours(1), "RUNNING"); task(10, 2, "APPROVED");
        check(scan(10, false).getAffectedRows() == 1 && scalar("SELECT COUNT(*) FROM wf_anomaly_alert WHERE anomaly_type='DATA_INCONSISTENCY' AND instance_id='i1'") == 1,
                "daily scan detects missing all tasks without time threshold and preserves completed tasks");
        check(scan(10, false).getAffectedRows() == 0 && count("outbox_event") == 1, "daily repeat accurately reports zero");
        reset(); seed(10, 1, "tenant-fail", NOW.minusHours(26), "RUNNING"); seed(20, 2, "tenant-good", NOW.minusHours(26), "RUNNING");
        failConfigurationTenant = 10;
        check(contains(caught(() -> service(sender).detectDeadlock()), "OWNED_CONFIG_FAILURE") && count("wf_anomaly_alert") == 1,
                "failed tenant configuration does not hide later tenant success");
        failConfigurationTenant = -1; check(service(sender).detectDeadlock().getAffectedRows() == 1, "tenant failure recovers without repeating completed tenant");
        reset(); seed(10, 1, "missing-recipient", NOW.minusHours(26), "RUNNING"); jdbc.update("DELETE FROM wf_process_instance WHERE instance_id='i1'");
        check(contains(caught(() -> scan(10, true)), "缺少本租户") && count("wf_anomaly_alert") == 0 && count("outbox_event") == 0, "missing recipient is visible and leaves no partial alert");
    }

    private static void paging() {
        reset();
        for (int id = 1; id <= 501; id++) seed(10, id, "page", id == 501 ? NOW.minusHours(26) : NOW.minusHours(1), "RUNNING");
        check(scan(10, true).getAffectedRows() == 1 && scalar("SELECT COUNT(*) FROM wf_anomaly_alert WHERE instance_id='i501'") == 1,
                "second page inspected after 500 ineligible monitors");
        check(scan(10, true).getAffectedRows() == 0, "second-page completed alert does not increment repeat count");
    }

    private static void concurrency(boolean sameMonitor) throws Exception {
        reset(); seed(10, 1, "concurrent", NOW.minusHours(26), "RUNNING");
        if (!sameMonitor) seed(10, 2, "concurrent", NOW.minusHours(26), "RUNNING");
        CountDownLatch inMessage = new CountDownLatch(1), release = new CountDownLatch(1), secondStarted = new CountDownLatch(1);
        AtomicBoolean first = new AtomicBoolean(true);
        MessageSender controlledTiming = request -> {
            sender.send(request);
            if (first.compareAndSet(true, false)) {
                inMessage.countDown();
                try { if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Owned concurrency deadline"); }
                catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new IllegalStateException(failure); }
            }
        };
        AnomalyDetectionServiceImpl detector = service(controlledTiming);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<Integer> firstResult = executor.submit(() -> scanItem(detector, 1L));
            check(inMessage.await(5, TimeUnit.SECONDS), "first real transaction reaches outbox registration");
            Future<Integer> secondResult = executor.submit(() -> { secondStarted.countDown(); return scanItem(detector, sameMonitor ? 1L : 2L); });
            check(secondStarted.await(2, TimeUnit.SECONDS), "second database session started");
            Thread.sleep(200);
            check(!secondResult.isDone(), "second transaction waits for monitor or shared statistics bucket");
            release.countDown();
            int total = firstResult.get(8, TimeUnit.SECONDS) + secondResult.get(8, TimeUnit.SECONDS);
            int expected = sameMonitor ? 1 : 2;
            check(total == expected && count("wf_anomaly_alert") == expected && count("outbox_event") == expected,
                    "concurrent transactions commit expected unique alerts and messages");
            check(count("wf_performance_stats") == 1 && scalar("SELECT anomaly_count FROM wf_performance_stats") == expected,
                    "concurrent first bucket insert and later update preserve every committed anomaly");
        } finally {
            release.countDown(); executor.shutdownNow(); check(executor.awaitTermination(5, TimeUnit.SECONDS), "concurrency workers stopped");
        }
        System.out.println("ANOMALY_SCAN_CASE: concurrency=" + (sameMonitor ? "same-monitor" : "same-statistics-bucket") + "; result=PASS");
    }

    private static int scanItem(AnomalyDetectionServiceImpl service, Long id) {
        return TenantBroker.applyAs(10L, ignored -> {
            TransactionTemplate transaction = new TransactionTemplate(transactions.getTransactionManager());
            transaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED); transaction.setTimeout(15);
            return Objects.requireNonNull(transaction.execute(status -> {
                try {
                    Method method = AnomalyDetectionServiceImpl.class.getDeclaredMethod("scanScheduledProcess", Long.class, Long.class, boolean.class, int.class, LocalDateTime.class);
                    method.setAccessible(true);
                    AnomalyDetectionServiceImpl.ScanCounts counts = (AnomalyDetectionServiceImpl.ScanCounts) method.invoke(service, 10L, id, true, 24, NOW);
                    return counts.created() + counts.repaired();
                } catch (InvocationTargetException failure) { throw new IllegalStateException(failure.getCause()); }
                catch (ReflectiveOperationException failure) { throw new IllegalStateException(failure); }
            }));
        });
    }

    private static IAnomalyDetectionService eventService(MessageSender messages) {
        ProxyFactory proxy = new ProxyFactory(service(messages));
        TransactionInterceptor interceptor = new TransactionInterceptor();
        interceptor.setTransactionManager(Objects.requireNonNull(transactions.getTransactionManager()));
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        proxy.addAdvice(interceptor);
        return (IAnomalyDetectionService) proxy.getProxy();
    }

    private static void execution(IAnomalyDetectionService detector) {
        TenantBroker.runAs(10L, ignored -> detector.detectExecutionFailure("i1", "Owned timeout", "Owned trace"));
    }

    private static AnomalyAlert alert() {
        return sessions.getMapper(AnomalyAlertMapper.class).selectById(scalar("SELECT MAX(id) FROM wf_anomaly_alert"));
    }

    private static void sendEvent(IAnomalyDetectionService detector, AnomalyAlert event) {
        TenantBroker.runAs(10L, ignored -> detector.sendAnomalyAlert(event));
    }

    private static void eventNotifications() {
        IAnomalyDetectionService detector = eventService(sender);
        reset(); seed(10, 1, "event", NOW.minusHours(1), "RUNNING");
        jdbc.execute("CREATE TRIGGER own_event_message_failure BEFORE INSERT ON outbox_event FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OWNED_EVENT_MESSAGE_FAILURE'");
        RuntimeException eventFailure = caught(() -> execution(detector));
        if (!contains(eventFailure, "OWNED_EVENT_MESSAGE_FAILURE")) throw new IllegalStateException("Unexpected event failure before owned message fault", eventFailure);
        check(true, "event handler propagates real message insert error through Spring transaction proxy");
        check(count("wf_anomaly_alert") == 0 && count("outbox_event") == 0 && count("wf_performance_stats") == 0, "event message failure rolls back alert and statistics");
        jdbc.execute("DROP TRIGGER own_event_message_failure");
        execution(detector);
        check(count("wf_anomaly_alert") == 1 && count("outbox_event") == 1 && scalar("SELECT anomaly_count FROM wf_performance_stats") == 1, "event recovery commits one alert message and real statistics");
        check("Y".equals(alert().getNotificationSent()) && "HIGH".equals(alert().getSeverity()), "registered execution reminder and severity persist");
        execution(detector);
        check(count("wf_anomaly_alert") == 1 && count("outbox_event") == 1, "repeated source event is idempotent");
        jdbc.update("UPDATE wf_anomaly_alert SET notification_sent='N'");
        execution(detector);
        check("Y".equals(alert().getNotificationSent()) && count("outbox_event") == 1, "existing pending event repairs flag with stable message deduplication");
        jdbc.update("DELETE FROM wf_performance_stats"); jdbc.update("UPDATE wf_anomaly_alert SET notification_sent='N'");
        execution(detector);
        check(count("wf_performance_stats") == 1 && scalar("SELECT anomaly_count FROM wf_performance_stats") == 1,
                "pending event repair also rebuilds missing statistics from prior partial registration");
        jdbc.update("DELETE FROM outbox_event"); jdbc.update("UPDATE wf_anomaly_alert SET notification_sent='N'");
        jdbc.execute("CREATE TRIGGER own_event_flag_failure BEFORE UPDATE ON wf_anomaly_alert FOR EACH ROW BEGIN IF NEW.notification_sent='Y' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OWNED_EVENT_FLAG_FAILURE'; END IF; END");
        check(contains(caught(() -> sendEvent(detector, alert())), "OWNED_EVENT_FLAG_FAILURE"), "public reminder reports flag update error");
        check(count("outbox_event") == 0 && "N".equals(alert().getNotificationSent()), "public reminder flag failure rolls back inserted outbox event");
        check(contains(caught(() -> execution(detector)), "OWNED_EVENT_FLAG_FAILURE") && count("outbox_event") == 0, "self-invoked repair rolls back through outer detector transaction");
        jdbc.execute("DROP TRIGGER own_event_flag_failure");
        AnomalyAlert stale = alert();
        jdbc.update("UPDATE wf_anomaly_alert SET resolved='Y',resolve_note='Owned resolved' WHERE id=?", stale.getId());
        stale.setInstanceId("other-instance"); stale.setErrorMessage("Forged reminder content");
        sendEvent(detector, stale);
        check("Y".equals(alert().getResolved()) && "Owned resolved".equals(alert().getResolveNote()), "stale reminder object cannot overwrite persisted resolution");
        check(scalar("SELECT COUNT(*) FROM outbox_event WHERE payload_json LIKE '%Forged reminder content%'") == 0 && count("outbox_event") == 1,
                "reminder uses persisted instance recipient and content instead of caller supplied snapshot");
        sendEvent(detector, stale);
        check(count("outbox_event") == 1, "stale sent flag cannot resend completed reminder");
        execution(detector);
        check(count("wf_anomaly_alert") == 2 && count("outbox_event") == 2, "resolved event allows a new occurrence");
        AnomalyAlert crossTenant = alert(); crossTenant.setTenantId(20L);
        check(caught(() -> sendEvent(detector, crossTenant)) instanceof IllegalArgumentException && count("outbox_event") == 2,
                "cross tenant reminder object is rejected");
        check(contains(caught(() -> detector.sendAnomalyAlert(alert())), "租户上下文"), "missing caller tenant is rejected");

        reset(); seed(10, 1, "event-stats", NOW.minusHours(1), "RUNNING");
        jdbc.execute("CREATE TRIGGER own_event_stats_failure BEFORE INSERT ON wf_performance_stats FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OWNED_EVENT_STATS_FAILURE'");
        check(contains(caught(() -> execution(detector)), "OWNED_EVENT_STATS_FAILURE") && count("wf_anomaly_alert") == 0 && count("outbox_event") == 0,
                "event statistics failure propagates and rolls back new alert");
        jdbc.execute("DROP TRIGGER own_event_stats_failure");
        jdbc.update("DELETE FROM wf_process_instance WHERE instance_id='i1'");
        check(contains(caught(() -> execution(detector)), "缺少本租户") && count("wf_anomaly_alert") == 0 && count("wf_performance_stats") == 0,
                "missing initiator leaves no falsely completed event or statistics");

        reset(); seed(10, 1, "candidate", NOW.minusHours(1), "RUNNING"); task(10, 1, "TODO");
        jdbc.update("UPDATE wf_task SET assignee=123 WHERE task_id='t10-1'");
        jdbc.execute("CREATE TRIGGER own_event_message_failure BEFORE INSERT ON outbox_event FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OWNED_EVENT_MESSAGE_FAILURE'");
        Runnable offboard = () -> TenantBroker.runAs(10L, ignored -> transactions.executeWithoutResult(status -> {
            jdbc.update("UPDATE wf_task SET assignee=NULL WHERE task_id='t10-1'");
            detector.detectNoAssignee("t10-1", "i1", "review");
        }));
        check(contains(caught(offboard), "OWNED_EVENT_MESSAGE_FAILURE"), "no assignee event propagates message failure to enclosing business transaction");
        check(scalar("SELECT assignee FROM wf_task WHERE task_id='t10-1'") == 123 && count("wf_anomaly_alert") == 0 && count("outbox_event") == 0,
                "business assignment update and failed reminder roll back together");
        jdbc.execute("DROP TRIGGER own_event_message_failure");
        offboard.run();
        check(scalar("SELECT COUNT(*) FROM wf_task WHERE assignee IS NULL") == 1 && count("wf_anomaly_alert") == 1 && count("outbox_event") == 1,
                "no assignee business recovery commits together");
        offboard.run();
        check(count("wf_anomaly_alert") == 1 && count("outbox_event") == 1, "no assignee event repeat does not duplicate alert");
        jdbc.update("UPDATE wf_anomaly_alert SET notification_sent='N'");
        offboard.run();
        check("Y".equals(alert().getNotificationSent()) && count("outbox_event") == 1, "no assignee pending reminder repair is idempotent");
        check(caught(() -> TenantBroker.runAs(10L, ignored -> detector.detectNoAssignee("t10-1", "i1", "forged"))) instanceof IllegalArgumentException,
                "task node mismatch is rejected");
        TenantBroker.runAs(20L, ignored -> detector.detectNoAssignee("t10-1", "i1", "review"));
        check(count("wf_anomaly_alert") == 1 && count("outbox_event") == 1, "other tenant cannot read task for event detection");
        System.out.println("ANOMALY_SCAN_CASE: event_notifications_real_spring_transactions=PASS; business_caller=controlled; consumer_delivery=false");
    }

    private static void eventConcurrency() throws Exception {
        reset(); seed(10, 1, "event-concurrent", NOW.minusHours(1), "RUNNING");
        CountDownLatch inMessage = new CountDownLatch(1), release = new CountDownLatch(1), secondStarted = new CountDownLatch(1);
        AtomicBoolean first = new AtomicBoolean(true);
        MessageSender controlledTiming = request -> {
            sender.send(request);
            if (first.compareAndSet(true, false)) {
                inMessage.countDown();
                try { if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Owned event concurrency deadline"); }
                catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new IllegalStateException(failure); }
            }
        };
        IAnomalyDetectionService detector = eventService(controlledTiming);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> firstResult = executor.submit(() -> execution(detector));
            check(inMessage.await(5, TimeUnit.SECONDS), "event first transaction reached real outbox");
            Future<?> secondResult = executor.submit(() -> { secondStarted.countDown(); execution(detector); });
            check(secondStarted.await(2, TimeUnit.SECONDS), "event second database session started");
            Thread.sleep(200);
            check(!secondResult.isDone(), "second source event waits on monitor row");
            release.countDown(); firstResult.get(8, TimeUnit.SECONDS); secondResult.get(8, TimeUnit.SECONDS);
            check(count("wf_anomaly_alert") == 1 && count("outbox_event") == 1 && scalar("SELECT anomaly_count FROM wf_performance_stats") == 1,
                    "concurrent source events under default repeatable read retain one alert and reminder");
        } finally {
            release.countDown(); executor.shutdownNow(); check(executor.awaitTermination(5, TimeUnit.SECONDS), "event concurrency workers stopped");
        }
        System.out.println("ANOMALY_SCAN_CASE: event_same_source_concurrency=PASS");
    }

    private static <T> T transactional(T target, Class<T> type) {
        ProxyFactory proxy = new ProxyFactory(target); proxy.setProxyTargetClass(true);
        TransactionInterceptor interceptor = new TransactionInterceptor();
        interceptor.setTransactionManager(Objects.requireNonNull(transactions.getTransactionManager()));
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        proxy.addAdvice(interceptor);
        return type.cast(proxy.getProxy());
    }

    private static WfUserDisabledCleanupService disabledService() {
        return disabledService(sessions.getMapper(WfTaskMapper.class));
    }

    private static WfUserDisabledCleanupService disabledService(WfTaskMapper tasks) {
        IAnomalyDetectionService detector = eventService(sender);
        WfCandidateOffboardService candidates = transactional(new WfCandidateOffboardService(sessions.getMapper(WfTaskCandidateMapper.class),
                sessions.getMapper(WfTaskMapper.class), detector), WfCandidateOffboardService.class);
        return transactional(new WfUserDisabledCleanupService(tasks, sessions.getMapper(WfTaskCandidateMapper.class),
                sessions.getMapper(TaskMonitorMapper.class), detector, candidates), WfUserDisabledCleanupService.class);
    }

    private static void assigned(long tenant, long id, Long user, String status) {
        seed(tenant, id, "disabled-" + tenant, NOW.minusHours(1), "RUNNING"); task(tenant, id, status);
        jdbc.update("UPDATE wf_task SET assignee=?,assignee_name='Owned assignee' WHERE task_id=?", user, "t" + tenant + "-" + id);
        jdbc.update("INSERT INTO wf_task_monitor(tenant_id,task_id,instance_id,assignee_id,assignee_name,create_time_task) VALUES (?,?,?,?,'Owned assignee',?)",
                tenant, "t" + tenant + "-" + id, "i" + id, user, NOW);
    }

    private static void candidate(long tenant, long id, long user, boolean attached) {
        jdbc.update("INSERT INTO wf_task_candidate(candidate_id,tenant_id,task_id,instance_id,node_key,user_id,candidate_type,status) VALUES (?,?,?,?,'review',?,'USER','PENDING')",
                "c" + tenant + "-" + id + "-" + user, tenant, attached ? "t" + tenant + "-" + id : null, "i" + id, user);
    }

    private static void disabled(WfUserDisabledCleanupService cleanup, long user) {
        TenantBroker.runAs(10L, ignored -> cleanup.cleanupDisabledUserTasks(user, "owned-user-disabled-" + user));
    }

    private static void disabledUserCleanup() {
        WfUserDisabledCleanupService cleanup = disabledService();
        reset(); assigned(10, 1, 123L, "TODO");
        disabled(cleanup, 123);
        check(scalar("SELECT COUNT(*) FROM wf_task WHERE task_id='t10-1' AND assignee IS NULL AND assignee_name IS NULL") == 1,
                "actual user disabled service clears persisted assignee and name");
        check(scalar("SELECT COUNT(*) FROM wf_task_monitor WHERE task_id='t10-1' AND assignee_id IS NULL AND assignee_name IS NULL") == 1,
                "actual user disabled service clears persisted monitor owner");
        check(count("wf_anomaly_alert") == 1 && count("outbox_event") == 1, "unowned task creates one real anomaly reminder");
        long version = scalar("SELECT lock_version FROM wf_task WHERE task_id='t10-1'");
        disabled(cleanup, 123);
        check(count("outbox_event") == 1 && scalar("SELECT lock_version FROM wf_task WHERE task_id='t10-1'") == version,
                "disabled user event repeat neither rewrites task nor duplicates reminder");

        reset(); assigned(10, 1, 123L, "TODO"); candidate(10, 1, 123, true);
        jdbc.execute("CREATE TRIGGER own_disabled_message_failure BEFORE INSERT ON outbox_event FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OWNED_DISABLED_MESSAGE_FAILURE'");
        check(contains(caught(() -> disabled(cleanup, 123)), "OWNED_DISABLED_MESSAGE_FAILURE"), "real cleanup propagates reminder registration failure");
        check(scalar("SELECT assignee FROM wf_task WHERE task_id='t10-1'") == 123 && scalar("SELECT assignee_id FROM wf_task_monitor WHERE task_id='t10-1'") == 123
                && scalar("SELECT COUNT(*) FROM wf_task_candidate WHERE status='PENDING'") == 1 && count("wf_anomaly_alert") == 0 && count("outbox_event") == 0,
                "cleanup failure rolls back assignment monitor candidates alert and message together");
        jdbc.execute("DROP TRIGGER own_disabled_message_failure"); disabled(cleanup, 123);
        check(scalar("SELECT COUNT(*) FROM wf_task WHERE assignee IS NULL") == 1 && scalar("SELECT COUNT(*) FROM wf_task_candidate WHERE status='CANCELLED'") == 1
                && count("wf_anomaly_alert") == 1 && count("outbox_event") == 1, "cleanup recovery releases task and records reminder exactly once");

        reset(); assigned(10, 1, null, "TODO"); candidate(10, 1, 123, true); candidate(10, 1, 456, true);
        assigned(10, 2, null, "TODO"); candidate(10, 2, 123, true);
        assigned(10, 3, 123L, "APPROVED"); candidate(10, 3, 123, true);
        assigned(10, 4, 456L, "TODO");
        assigned(20, 5, 123L, "TODO"); candidate(20, 5, 123, true);
        candidate(10, 6, 123, false);
        disabled(cleanup, 123);
        check(scalar("SELECT COUNT(*) FROM wf_task_candidate WHERE tenant_id=10 AND user_id=123 AND status='PENDING'") == 0,
                "disabled user's pending candidates include unattached initiator selections");
        check(scalar("SELECT COUNT(*) FROM wf_task_candidate WHERE tenant_id=10 AND user_id=456 AND status='PENDING'") == 1
                && scalar("SELECT COUNT(*) FROM wf_anomaly_alert WHERE instance_id='i1'") == 0, "remaining eligible candidate prevents false no-assignee alert");
        check(count("wf_anomaly_alert") == 1 && "i2".equals(alert().getInstanceId()), "only last-candidate removal creates anomaly");
        check(scalar("SELECT COUNT(*) FROM wf_task WHERE task_id='t10-3' AND status='APPROVED' AND assignee=123") == 1
                && scalar("SELECT assignee FROM wf_task WHERE task_id='t10-4'") == 456, "completed and reassigned tasks remain unchanged");
        check(scalar("SELECT assignee FROM wf_task WHERE task_id='t20-5'") == 123
                && scalar("SELECT COUNT(*) FROM wf_task_candidate WHERE tenant_id=20 AND status='PENDING'") == 1, "explicit tenant boundaries protect foreign task and candidates");
        check(caught(() -> cleanup.cleanupDisabledUserTasks(123L, "missing-tenant")) instanceof NullPointerException,
                "disabled cleanup rejects absent tenant context");
        System.out.println("ANOMALY_SCAN_CASE: user_disabled_real_cleanup_transactions=PASS; consumer_stream=false");
    }

    private static void disabledCandidateConcurrency() throws Exception {
        reset(); assigned(10, 1, null, "TODO"); candidate(10, 1, 123, true); candidate(10, 1, 456, true);
        WfUserDisabledCleanupService cleanup = disabledService();
        CountDownLatch firstUpdated = new CountDownLatch(1), release = new CountDownLatch(1), secondStarted = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> first = executor.submit(() -> TenantBroker.runAs(10L, ignored -> transactions.executeWithoutResult(status -> {
                cleanup.cleanupDisabledUserTasks(123L, "owned-first-candidate"); firstUpdated.countDown();
                try { if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Owned candidate concurrency deadline"); }
                catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new IllegalStateException(failure); }
            })));
            check(firstUpdated.await(5, TimeUnit.SECONDS), "first disabled candidate cancellation remains uncommitted");
            Future<?> second = executor.submit(() -> { secondStarted.countDown(); disabled(cleanup, 456); });
            check(secondStarted.await(2, TimeUnit.SECONDS), "second candidate cleanup session started");
            Thread.sleep(200); check(!second.isDone(), "concurrent candidate cancellation waits for task lock");
            release.countDown(); first.get(8, TimeUnit.SECONDS); second.get(8, TimeUnit.SECONDS);
            check(scalar("SELECT COUNT(*) FROM wf_task_candidate WHERE status='CANCELLED'") == 2 && count("wf_anomaly_alert") == 1 && count("outbox_event") == 1,
                    "current read detects final candidate removal after preceding transaction commits");
        } finally {
            release.countDown(); executor.shutdownNow(); check(executor.awaitTermination(5, TimeUnit.SECONDS), "candidate concurrency workers stopped");
        }
        System.out.println("ANOMALY_SCAN_CASE: disabled_last_candidate_concurrency=PASS");
    }

    private static void disabledReassignmentRace() throws Exception {
        reset(); assigned(10, 1, 123L, "TODO");
        WfTaskMapper actual = sessions.getMapper(WfTaskMapper.class);
        CountDownLatch selected = new CountDownLatch(1), release = new CountDownLatch(1);
        AtomicBoolean pause = new AtomicBoolean(true);
        WfTaskMapper timing = (WfTaskMapper) Proxy.newProxyInstance(WfTaskMapper.class.getClassLoader(), new Class<?>[]{WfTaskMapper.class}, (proxy, method, arguments) -> {
            Object result;
            try { result = method.invoke(actual, arguments); }
            catch (InvocationTargetException failure) { throw failure.getCause(); }
            if (method.getName().equals("selectList") && pause.compareAndSet(true, false)) {
                selected.countDown();
                if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Owned assignment concurrency deadline");
            }
            return result;
        });
        WfUserDisabledCleanupService cleanup = disabledService(timing);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            Future<?> pending = executor.submit(() -> disabled(cleanup, 123));
            check(selected.await(5, TimeUnit.SECONDS), "cleanup has read old actual assignment before acquiring task lock");
            jdbc.update("UPDATE wf_task SET assignee=456,assignee_name='New assignee',status='APPROVED',lock_version=lock_version+1 WHERE task_id='t10-1'");
            release.countDown(); pending.get(8, TimeUnit.SECONDS);
            check(scalar("SELECT COUNT(*) FROM wf_task WHERE task_id='t10-1' AND assignee=456 AND assignee_name='New assignee' AND status='APPROVED'") == 1,
                    "stale cleanup cannot overwrite concurrent completion and reassignment");
            check(count("wf_anomaly_alert") == 0 && count("outbox_event") == 0, "stale assignment does not create false no-assignee alert");
        } finally {
            release.countDown(); executor.shutdownNow(); check(executor.awaitTermination(5, TimeUnit.SECONDS), "assignment race worker stopped");
        }
        System.out.println("ANOMALY_SCAN_CASE: disabled_stale_assignment_protection=PASS");
    }
    private static void disabledAnomalyMetadata() {
        WfUserDisabledCleanupService cleanup = disabledService();
        reset(); assigned(10, 1, 123L, "TODO"); disabled(cleanup, 123);
        check("disabled-10".equals(alert().getProcessDefKey()) && "Owned process".equals(alert().getProcessName()),
                "disabled reminder retains actual instance key and monitor process name");
        reset(); assigned(10, 1, 123L, "TODO");
        jdbc.update("UPDATE wf_process_instance SET title=? WHERE instance_id='i1'", "长".repeat(255));
        jdbc.update("UPDATE wf_process_monitor SET process_def_name='' WHERE instance_id='i1'");
        disabled(cleanup, 123);
        check("disabled-10".equals(alert().getProcessName()), "blank process name uses stable key without truncating long instance title");
        reset(); assigned(10, 1, 123L, "TODO"); jdbc.update("DELETE FROM wf_process_monitor WHERE instance_id='i1'");
        disabled(cleanup, 123);
        check("disabled-10".equals(alert().getProcessName()), "absent monitor uses actual instance key for reminder name");
        reset(); assigned(10, 1, 123L, "TODO"); jdbc.update("UPDATE wf_process_instance SET tenant_id=20 WHERE instance_id='i1'");
        caught(() -> disabled(cleanup, 123));
        check(scalar("SELECT assignee FROM wf_task WHERE task_id='t10-1'") == 123 && count("wf_anomaly_alert") == 0 && count("outbox_event") == 0,
                "foreign instance rejects disabled reminder and rolls back task release");
        reset(); assigned(10, 1, 123L, "TODO"); jdbc.update("DELETE FROM wf_process_instance WHERE instance_id='i1'");
        caught(() -> disabled(cleanup, 123));
        check(scalar("SELECT assignee FROM wf_task WHERE task_id='t10-1'") == 123 && count("wf_anomaly_alert") == 0 && count("outbox_event") == 0,
                "missing instance rejects disabled reminder and rolls back task release");
        System.out.println("ANOMALY_SCAN_CASE: disabled_reminder_process_identity=PASS");
    }

    private static WfEmployeeOffboardTransferService offboardService(WfTaskMapper tasks) {
        return offboardService(tasks, sessions.getMapper(TaskMonitorMapper.class));
    }

    private static WfEmployeeOffboardTransferService offboardService(WfTaskMapper tasks, TaskMonitorMapper monitors) {
        WfProcessInstanceMapper instances = sessions.getMapper(WfProcessInstanceMapper.class);
        SysUserMapper users = sessions.getMapper(SysUserMapper.class);
        // Ordinary process contract exits before H-specific dependencies; H policy remains the actual implementation.
        WorkflowHParticipantPolicy policy = new WorkflowHParticipantPolicy(instances, users, null, sessions.getMapper(WfProcessDefinitionMapper.class), null, null, null);
        return transactional(new WfEmployeeOffboardTransferService(tasks, sessions.getMapper(WfTaskDelegationMapper.class), instances,
                monitors, users, policy), WfEmployeeOffboardTransferService.class);
    }

    private static void successor(long tenant, long id, String status) {
        jdbc.update("INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name,status,deleted) VALUES (?,?,?,? ,?,0)",
                id, tenant, "owned-successor-" + id, "Owned successor", status);
    }

    private static void offboardStaleRace(boolean completed) throws Exception {
        reset(); assigned(10, 1, 123L, "TODO"); successor(10, 456, "0");
        WfTaskMapper actual = sessions.getMapper(WfTaskMapper.class);
        CountDownLatch selected = new CountDownLatch(1), release = new CountDownLatch(1);
        AtomicBoolean pause = new AtomicBoolean(true);
        WfTaskMapper timing = (WfTaskMapper) Proxy.newProxyInstance(WfTaskMapper.class.getClassLoader(), new Class<?>[]{WfTaskMapper.class}, (proxy, method, arguments) -> {
            Object result;
            try { result = method.invoke(actual, arguments); }
            catch (InvocationTargetException failure) { throw failure.getCause(); }
            if (method.getName().equals("selectList") && pause.compareAndSet(true, false)) {
                selected.countDown();
                if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Owned offboard concurrency deadline");
            }
            return result;
        });
        WfEmployeeOffboardTransferService transfer = offboardService(timing);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            Future<?> pending = executor.submit(() -> TenantBroker.runAs(10L,
                    ignored -> transfer.transferTodoTasksForEmployeeLeft(123L, "Owned original", 456L, "owned-offboard-race")));
            check(selected.await(5, TimeUnit.SECONDS), "offboard has read actual original assignment before concurrent completion");
            transactions.executeWithoutResult(status -> {
                jdbc.update("UPDATE wf_task SET assignee=789,assignee_name='Actual reviewer',status=?,lock_version=lock_version+1 WHERE task_id='t10-1'", completed ? "APPROVED" : "TODO");
                jdbc.update("UPDATE wf_task_monitor SET assignee_id=789,assignee_name='Actual reviewer',version=version+1 WHERE task_id='t10-1'");
            });
            release.countDown(); pending.get(8, TimeUnit.SECONDS);
            check(scalar("SELECT COUNT(*) FROM wf_task WHERE task_id='t10-1' AND assignee=789") == 1
                    && Objects.equals(jdbc.queryForObject("SELECT status FROM wf_task WHERE task_id='t10-1'", String.class), completed ? "APPROVED" : "TODO"),
                    "offboard cannot overwrite concurrently completed or reassigned task");
            check(count("wf_task_delegation") == 0 && scalar("SELECT assignee_id FROM wf_task_monitor WHERE task_id='t10-1'") == 789,
                    "stale offboard cannot invent transfer history or overwrite actual monitor owner");
        } finally {
            release.countDown(); executor.shutdownNow(); check(executor.awaitTermination(5, TimeUnit.SECONDS), "offboard race worker stopped");
        }
        System.out.println("ANOMALY_SCAN_CASE: offboard_stale_assignment_protection=PASS; concurrent_completion=" + completed);
    }

    private static void transfer(WfEmployeeOffboardTransferService service, Long successorId) {
        TenantBroker.runAs(10L, ignored -> service.transferTodoTasksForEmployeeLeft(123L, "Owned original", successorId, "owned-offboard"));
    }

    private static void offboardTransactions() {
        WfEmployeeOffboardTransferService service = offboardService(sessions.getMapper(WfTaskMapper.class));
        reset(); assigned(10, 1, 123L, "TODO"); assigned(10, 2, 123L, "APPROVED"); assigned(20, 3, 123L, "TODO");
        assigned(10, 4, 123L, "TODO"); jdbc.update("UPDATE wf_process_instance SET status='PASSED' WHERE instance_id='i4'");
        jdbc.update("UPDATE wf_process_instance SET start_user_id=123 WHERE instance_id IN ('i1','i3')");
        successor(10, 456, "0");
        transfer(service, 456L);
        check(scalar("SELECT COUNT(*) FROM wf_task WHERE task_id='t10-1' AND assignee=456 AND task_type='TRANSFER'") == 1 && count("wf_task_delegation") == 1,
                "real offboard transfers eligible task and registers one transfer history");
        check(scalar("SELECT COUNT(*) FROM wf_task_monitor WHERE task_id='t10-1' AND assignee_id=456 AND action='TRANSFER' AND version=1") == 1,
                "offboard monitor owner and version advance with task transfer");
        check(scalar("SELECT COUNT(*) FROM wf_task WHERE task_id IN ('t10-2','t20-3','t10-4') AND assignee=123") == 3,
                "completed tasks foreign tenants and terminal instances are not reassigned");
        check(scalar("SELECT starter_left FROM wf_process_instance WHERE instance_id='i1'") == 1
                && scalar("SELECT starter_left FROM wf_process_instance WHERE instance_id='i3'") == 0, "only own active starter instance is marked departed");
        long instanceVersion = scalar("SELECT lock_version FROM wf_process_instance WHERE instance_id='i1'");
        long taskVersion = scalar("SELECT lock_version FROM wf_task WHERE task_id='t10-1'");
        transfer(service, 456L);
        check(count("wf_task_delegation") == 1 && scalar("SELECT lock_version FROM wf_task WHERE task_id='t10-1'") == taskVersion
                && scalar("SELECT lock_version FROM wf_process_instance WHERE instance_id='i1'") == instanceVersion,
                "repeated offboard neither duplicates history nor rewrites departed instance or transferred task");
        check(caught(() -> service.transferTodoTasksForEmployeeLeft(123L, "Owned", 456L, "missing-tenant")) instanceof NullPointerException,
                "offboard rejects missing tenant before reading or modifying data");

        reset(); assigned(10, 1, 123L, "TODO"); jdbc.update("UPDATE wf_process_instance SET start_user_id=123 WHERE instance_id='i1'");
        successor(10, 456, "1"); successor(20, 789, "0");
        for (Long successorId : new Long[]{null, 123L, 456L, 789L}) transfer(service, successorId);
        check(scalar("SELECT assignee FROM wf_task WHERE task_id='t10-1'") == 123 && count("wf_task_delegation") == 0,
                "absent same-person disabled and foreign successors never receive offboard task");
        check(scalar("SELECT starter_left FROM wf_process_instance WHERE instance_id='i1'") == 1,
                "departed starter is marked even when no eligible successor exists");

        reset(); assigned(10, 1, 123L, "TODO"); assigned(10, 2, 123L, "TODO"); successor(10, 456, "0");
        jdbc.update("UPDATE wf_process_instance SET start_user_id=123");
        jdbc.execute("CREATE TRIGGER own_offboard_history_failure BEFORE INSERT ON wf_task_delegation FOR EACH ROW BEGIN IF NEW.task_id='t10-2' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OWNED_OFFBOARD_HISTORY_FAILURE'; END IF; END");
        check(contains(caught(() -> transfer(service, 456L)), "OWNED_OFFBOARD_HISTORY_FAILURE"), "second offboard history failure reaches caller");
        check(scalar("SELECT COUNT(*) FROM wf_task WHERE assignee=123") == 2 && scalar("SELECT COUNT(*) FROM wf_task_monitor WHERE assignee_id=123") == 2
                && scalar("SELECT COUNT(*) FROM wf_process_instance WHERE starter_left=0") == 2 && count("wf_task_delegation") == 0,
                "second transfer failure rolls back all task monitor starter and history changes");
        jdbc.execute("DROP TRIGGER own_offboard_history_failure"); transfer(service, 456L); transfer(service, 456L);
        check(scalar("SELECT COUNT(*) FROM wf_task WHERE assignee=456") == 2 && scalar("SELECT COUNT(*) FROM wf_task_monitor WHERE assignee_id=456") == 2
                && count("wf_task_delegation") == 2, "offboard recovery and repeat commit exactly two complete transfers");
        System.out.println("ANOMALY_SCAN_CASE: offboard_real_transactions_and_scopes=PASS; ordinary_workflow_contract=true");
    }

    private static void offboardSuccessorLock() throws Exception {
        reset(); assigned(10, 1, 123L, "TODO"); successor(10, 456, "0");
        WfTaskMapper actual = sessions.getMapper(WfTaskMapper.class);
        CountDownLatch selected = new CountDownLatch(1), release = new CountDownLatch(1), updateStarted = new CountDownLatch(1);
        AtomicBoolean pause = new AtomicBoolean(true);
        WfTaskMapper timing = (WfTaskMapper) Proxy.newProxyInstance(WfTaskMapper.class.getClassLoader(), new Class<?>[]{WfTaskMapper.class}, (proxy, method, arguments) -> {
            Object result;
            try { result = method.invoke(actual, arguments); }
            catch (InvocationTargetException failure) { throw failure.getCause(); }
            if (method.getName().equals("selectList") && pause.compareAndSet(true, false)) {
                selected.countDown(); if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Owned successor lock deadline");
            }
            return result;
        });
        WfEmployeeOffboardTransferService service = offboardService(timing);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> first = executor.submit(() -> transfer(service, 456L));
            check(selected.await(5, TimeUnit.SECONDS), "successor was checked before task reassignment");
            Future<?> second = executor.submit(() -> { updateStarted.countDown(); jdbc.update("UPDATE sys_user SET status='1',version=version+1 WHERE user_id=456"); });
            check(updateStarted.await(2, TimeUnit.SECONDS), "concurrent successor disable has started");
            Thread.sleep(200); check(!second.isDone(), "successor disable waits until transfer commits so its event can see new task");
            release.countDown(); first.get(8, TimeUnit.SECONDS); second.get(8, TimeUnit.SECONDS);
            check(scalar("SELECT assignee FROM wf_task WHERE task_id='t10-1'") == 456 && count("wf_task_delegation") == 1,
                    "task transfer is visible before later successor-disable transaction can publish");
        } finally {
            release.countDown(); executor.shutdownNow(); check(executor.awaitTermination(5, TimeUnit.SECONDS), "successor lock workers stopped");
        }
        System.out.println("ANOMALY_SCAN_CASE: offboard_successor_disable_serialization=PASS; actual_auth_event=false");
    }

    private static void offboardOpenInstances() {
        reset(); successor(10, 456, "0");
        long id = 1;
        for (String status : List.of("RUNNING", "WITHDRAWN", "TASK_BACK", "RESTARTED", "PENDING", "PAUSED", "FAILED")) {
            assigned(10, id, 123L, "TODO");
            jdbc.update("UPDATE wf_process_instance SET status=? WHERE instance_id=?", status, "i" + id);
            id++;
        }
        transfer(offboardService(sessions.getMapper(WfTaskMapper.class)), 456L);
        check(scalar("SELECT COUNT(*) FROM wf_task WHERE assignee=456") == 7 && count("wf_task_delegation") == 7,
                "all seven open process states retain offboard handover including paused and failed");
        check(scalar("SELECT COUNT(*) FROM wf_process_instance WHERE status IN ('PAUSED','FAILED')") == 2,
                "handover never resumes paused or failed process execution");
        System.out.println("ANOMALY_SCAN_CASE: offboard_open_process_states=PASS");
    }

    private static void offboardMonitorConflict() throws Exception {
        reset(); assigned(10, 1, 123L, "TODO"); successor(10, 456, "0");
        jdbc.update("UPDATE wf_process_instance SET start_user_id=123 WHERE instance_id='i1'");
        TaskMonitorMapper actual = sessions.getMapper(TaskMonitorMapper.class);
        CountDownLatch selected = new CountDownLatch(1), release = new CountDownLatch(1);
        AtomicBoolean pause = new AtomicBoolean(true);
        TaskMonitorMapper timing = (TaskMonitorMapper) Proxy.newProxyInstance(TaskMonitorMapper.class.getClassLoader(), new Class<?>[]{TaskMonitorMapper.class}, (proxy, method, arguments) -> {
            Object result;
            try { result = method.invoke(actual, arguments); }
            catch (InvocationTargetException failure) { throw failure.getCause(); }
            if (method.getName().equals("selectOne") && pause.compareAndSet(true, false)) {
                selected.countDown();
                if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Owned monitor conflict deadline");
            }
            return result;
        });
        WfEmployeeOffboardTransferService service = offboardService(sessions.getMapper(WfTaskMapper.class), timing);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            Future<RuntimeException> pending = executor.submit(() -> caught(() -> transfer(service, 456L)));
            check(selected.await(5, TimeUnit.SECONDS), "offboard reads monitor version before concurrent monitor update");
            jdbc.update("UPDATE wf_task_monitor SET assignee_id=789,assignee_name='Actual reviewer',version=version+1 WHERE task_id='t10-1'");
            release.countDown();
            check(contains(pending.get(8, TimeUnit.SECONDS), "离职任务监控已变更"), "monitor version conflict aborts actual offboard transaction");
            check(scalar("SELECT assignee FROM wf_task WHERE task_id='t10-1'") == 123 && count("wf_task_delegation") == 0
                    && scalar("SELECT starter_left FROM wf_process_instance WHERE instance_id='i1'") == 0,
                    "monitor conflict rolls back task history and departed starter marker");
            check(scalar("SELECT assignee_id FROM wf_task_monitor WHERE task_id='t10-1'") == 789
                    && scalar("SELECT version FROM wf_task_monitor WHERE task_id='t10-1'") == 1,
                    "monitor conflict preserves other committed owner and version");
        } finally {
            release.countDown(); executor.shutdownNow(); check(executor.awaitTermination(5, TimeUnit.SECONDS), "monitor conflict worker stopped");
        }
        System.out.println("ANOMALY_SCAN_CASE: offboard_monitor_version_conflict=PASS");
    }

    private static void offboardLongName() {
        for (int length : List.of(64, 65, 100)) {
            for (boolean releaseFirst : List.of(false, true)) {
                reset(); assigned(10, 1, 123L, "TODO"); successor(10, 456, "0");
                String original = "原".repeat(length - 4) + "甲乙 丙", successorName = "接".repeat(length - 4) + "丁戊 己";
                jdbc.update("UPDATE sys_user SET nick_name=? WHERE user_id=456", successorName);
                jdbc.update("UPDATE wf_task SET assignee_name=? WHERE task_id='t10-1'", original);
                if (releaseFirst) {
                    disabled(disabledService(), 123);
                    check(original.equals(jdbc.queryForObject("SELECT disabled_from_user_name FROM wf_task WHERE task_id='t10-1'", String.class)),
                            "release preserves full original name at approved boundary");
                }
                transfer(offboardService(sessions.getMapper(WfTaskMapper.class)), 456L);
                check(successorName.equals(jdbc.queryForObject("SELECT assignee_name FROM wf_task WHERE task_id='t10-1'", String.class))
                        && successorName.equals(jdbc.queryForObject("SELECT to_user_name FROM wf_task_delegation", String.class))
                        && successorName.equals(jdbc.queryForObject("SELECT assignee_name FROM wf_task_monitor WHERE task_id='t10-1'", String.class)),
                        "task history and monitor preserve exact successor name at approved boundary");
                check(original.equals(jdbc.queryForObject("SELECT from_user_name FROM wf_task_delegation", String.class)),
                        "transfer history preserves exact original name including internal space");
                assertReleaseCleared();
            }
        }
        System.out.println("ANOMALY_SCAN_CASE: offboard_long_name=PASS; boundaries=64,65,100; exact_original_successor_names=true; both_event_orders=true");
    }

    private static void offboardAfterDisable() {
        reset(); assigned(10, 1, 123L, "TODO"); successor(10, 456, "0");
        disabled(disabledService(), 123);
        check(scalar("SELECT COUNT(*) FROM wf_task WHERE task_id='t10-1' AND assignee IS NULL") == 1,
                "disabled event commits original task release before offboard event");
        check(scalar("SELECT COUNT(*) FROM wf_task WHERE task_id='t10-1' AND disabled_from_user_id=123 AND disabled_from_user_name='Owned assignee' AND disabled_release_version=lock_version AND disabled_release_event_id='owned-user-disabled-123'") == 1,
                "release commits original owner name event and exact released version");
        List<Map<String, Object>> released = jdbc.queryForList("SELECT * FROM wf_task");
        disabled(disabledService(), 123);
        check(released.equals(jdbc.queryForList("SELECT * FROM wf_task")), "repeated disable preserves exact release source");
        System.out.println("ANOMALY_SCAN_CASE: offboard_prior_disable_release=PASS; real_services_separate_transactions=true; actual_hr_http=false");
        transfer(offboardService(sessions.getMapper(WfTaskMapper.class)), 456L);
        check(scalar("SELECT COUNT(*) FROM wf_task WHERE task_id='t10-1' AND assignee=456") == 1 && count("wf_task_delegation") == 1,
                "offboard after account disable must hand over untouched released task to designated successor");
        assertReleaseCleared();
        check(scalar("SELECT COUNT(*) FROM wf_task_monitor WHERE task_id='t10-1' AND assignee_id=456 AND action='TRANSFER'") == 1,
                "released handover updates actual monitor owner");
        List<Map<String, Object>> completed = jdbc.queryForList("SELECT * FROM wf_task");
        disabled(disabledService(), 123); transfer(offboardService(sessions.getMapper(WfTaskMapper.class)), 456L);
        check(completed.equals(jdbc.queryForList("SELECT * FROM wf_task")) && count("wf_task_delegation") == 1,
                "repeated events after handover neither release successor nor duplicate transfer");
        reset(); assigned(10, 1, 123L, "TODO"); successor(10, 456, "0");
        transfer(offboardService(sessions.getMapper(WfTaskMapper.class)), 456L); disabled(disabledService(), 123);
        check(scalar("SELECT assignee FROM wf_task WHERE task_id='t10-1'") == 456 && count("wf_task_delegation") == 1,
                "offboard event arriving before disable preserves successor task");
        assertReleaseCleared();
        System.out.println("ANOMALY_SCAN_CASE: offboard_after_disable=PASS");
    }

    private static void assertReleaseCleared() {
        check(scalar("SELECT COUNT(*) FROM wf_task WHERE disabled_from_user_id IS NOT NULL OR disabled_from_user_name IS NOT NULL OR disabled_release_version IS NOT NULL OR disabled_release_event_id IS NOT NULL") == 0,
                "successful transfer clears all four private source fields");
    }

    private static void offboardFrozenHParticipants() throws Exception {
        ObjectMapper json = new ObjectMapper();
        String model = """
                {"nodes":[{"id":"start","type":"START"},{"id":"responsible","type":"APPROVAL","approverType":"VARIABLE_USER","approverValue":"responsibleApproverIds","allowDelegate":false,"allowAddSign":false},{"id":"hr","type":"APPROVAL","approverType":"VARIABLE_USER","approverValue":"hrApproverIds","allowDelegate":false,"allowAddSign":false},{"id":"end","type":"END"}],"edges":[{"source":"start","target":"responsible"},{"source":"responsible","target":"hr"},{"source":"hr","target":"end"}]}
                """;
        for (boolean released : List.of(false, true)) {
            reset(); assigned(10, 1, 123L, "TODO");
            for (long user : List.of(110L, 123L, 456L, 777L)) successor(10, user, "0");
            jdbc.update("INSERT INTO wf_process_definition(definition_id,tenant_id,process_key,process_name,version,model_json,status,is_latest,deleted) VALUES ('owned-h-definition',10,'owned-h-key','Owned H',1,?,'PUBLISHED',1,0)", model);
            WorkflowHParticipantPolicy policy = new WorkflowHParticipantPolicy(sessions.getMapper(WfProcessInstanceMapper.class), sessions.getMapper(SysUserMapper.class),
                    null, sessions.getMapper(WfProcessDefinitionMapper.class), null, null, null);
            Map<String, Object> variables = new LinkedHashMap<>();
            variables.put("businessType", "HR_OVERTIME"); variables.put("businessId", "901"); variables.put("applicantUserId", "110");
            variables.put("_hExcludedUserIds", List.of("110")); variables.put("responsibleApproverIds", List.of("123")); variables.put("hrApproverIds", List.of("777"));
            variables.put("definitionId", "owned-h-definition"); variables.put("definitionVersion", "1");
            variables.put("modelDigest", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(json.readTree(model)))));
            Map<String, Object> frozen = TenantBroker.applyAs(10L, ignored -> {
                WfProcessDefinition definition = sessions.getMapper(WfProcessDefinitionMapper.class).selectById("owned-h-definition");
                policy.assertStart(10L, 110L, variables, null);
                return policy.freezeStartDefinition(10L, 110L, variables, definition);
            });
            jdbc.update("UPDATE wf_process_instance SET definition_id='owned-h-definition',variables=? WHERE instance_id='i1'", json.writeValueAsString(frozen));
            jdbc.update("UPDATE wf_task SET node_key='responsible' WHERE task_id='t10-1'");
            RuntimeException rejection = caught(() -> TenantBroker.runAs(10L, ignored -> policy.assertParticipantChange(sessions.getMapper(WfTaskMapper.class).selectById("t10-1"), List.of(110L))));
            check(rejection instanceof WorkflowException failure && "H_PARTICIPANT_CHANGE_FORBIDDEN".equals(failure.getCode()),
                    "real persisted H model reaches frozen participant rule rather than malformed-fixture rejection");
            if (released) disabled(disabledService(), 123);
            List<Map<String, Object>> before = jdbc.queryForList("SELECT * FROM wf_task");
            List<Map<String, Object>> monitors = jdbc.queryForList("SELECT * FROM wf_task_monitor");
            WfEmployeeOffboardTransferService service = offboardService(sessions.getMapper(WfTaskMapper.class));
            for (long successor : List.of(110L, 456L)) {
                transfer(service, successor);
                check(before.equals(jdbc.queryForList("SELECT * FROM wf_task")) && monitors.equals(jdbc.queryForList("SELECT * FROM wf_task_monitor"))
                        && count("wf_task_delegation") == 0, "offboard cannot transfer frozen H task to applicant or unfrozen successor");
            }
            jdbc.update("UPDATE sys_user SET status='1' WHERE user_id=123"); transfer(service, 456L);
            check(before.equals(jdbc.queryForList("SELECT * FROM wf_task")) && count("wf_task_delegation") == 0,
                    "disabled frozen H approver remains protected from automatic substitution");
        }
        System.out.println("ANOMALY_SCAN_CASE: offboard_frozen_h_participants=PASS; real_model_freeze_and_database=true; hr_http=false");
    }

    private static void releasedHandoverScopes() {
        WfEmployeeOffboardTransferService service = offboardService(sessions.getMapper(WfTaskMapper.class));
        for (String change : List.of("claimed", "reassigned", "completed", "version", "missing-event", "blank-event", "missing-version", "other-user", "foreign-task", "foreign-instance", "ended")) {
            reset(); assigned(10, 1, 123L, "TODO"); successor(10, 456, "0"); disabled(disabledService(), 123);
            switch (change) {
                case "claimed" -> jdbc.update("UPDATE wf_task SET assignee=789 WHERE task_id='t10-1'");
                case "reassigned" -> jdbc.update("UPDATE wf_task SET assignee=789,lock_version=lock_version+1 WHERE task_id='t10-1'");
                case "completed" -> jdbc.update("UPDATE wf_task SET status='APPROVED' WHERE task_id='t10-1'");
                case "version" -> jdbc.update("UPDATE wf_task SET lock_version=lock_version+1 WHERE task_id='t10-1'");
                case "missing-event" -> jdbc.update("UPDATE wf_task SET disabled_release_event_id=NULL WHERE task_id='t10-1'");
                case "blank-event" -> jdbc.update("UPDATE wf_task SET disabled_release_event_id=' ' WHERE task_id='t10-1'");
                case "missing-version" -> jdbc.update("UPDATE wf_task SET disabled_release_version=NULL WHERE task_id='t10-1'");
                case "other-user" -> jdbc.update("UPDATE wf_task SET disabled_from_user_id=789 WHERE task_id='t10-1'");
                case "foreign-task" -> jdbc.update("UPDATE wf_task SET tenant_id=20 WHERE task_id='t10-1'");
                case "foreign-instance" -> jdbc.update("UPDATE wf_process_instance SET tenant_id=20 WHERE instance_id='i1'");
                case "ended" -> jdbc.update("UPDATE wf_process_instance SET status='PASSED' WHERE instance_id='i1'");
                default -> throw new IllegalArgumentException("Unknown scope case");
            }
            List<Map<String, Object>> before = jdbc.queryForList("SELECT * FROM wf_task");
            List<Map<String, Object>> monitor = jdbc.queryForList("SELECT * FROM wf_task_monitor");
            transfer(service, 456L);
            check(before.equals(jdbc.queryForList("SELECT * FROM wf_task")) && monitor.equals(jdbc.queryForList("SELECT * FROM wf_task_monitor"))
                    && count("wf_task_delegation") == 0, "released source cannot override current task: " + change);
        }
        for (String state : List.of("PAUSED", "FAILED")) {
            reset(); assigned(10, 1, 123L, "TODO"); successor(10, 456, "0"); disabled(disabledService(), 123);
            jdbc.update("UPDATE wf_process_instance SET status=? WHERE instance_id='i1'", state); transfer(service, 456L);
            check(scalar("SELECT assignee FROM wf_task WHERE task_id='t10-1'") == 456 && count("wf_task_delegation") == 1
                    && state.equals(jdbc.queryForObject("SELECT status FROM wf_process_instance WHERE instance_id='i1'", String.class)),
                    "open paused or failed instance handover does not resume execution");
            assertReleaseCleared();
        }
        reset(); assigned(10, 1, 123L, "TODO"); successor(10, 456, "1"); successor(20, 789, "0"); disabled(disabledService(), 123);
        List<Map<String, Object>> before = jdbc.queryForList("SELECT * FROM wf_task");
        transfer(service, null); transfer(service, 123L); transfer(service, 456L); transfer(service, 789L);
        check(before.equals(jdbc.queryForList("SELECT * FROM wf_task")) && count("wf_task_delegation") == 0,
                "released task stays available when successor absent same person disabled or foreign");
        reset(); assigned(10, 1, 123L, "TODO");
        for (String event : new String[]{null, "", " "}) {
            check(caught(() -> TenantBroker.runAs(10L, ignored -> disabledService().cleanupDisabledUserTasks(123L, event))) instanceof IllegalArgumentException,
                    "missing release event rejected before mutation");
        }
        check(scalar("SELECT assignee FROM wf_task WHERE task_id='t10-1'") == 123 && count("outbox_event") == 0,
                "missing release event preserves assignment and creates no reminder");
        assertReleaseCleared();
        System.out.println("ANOMALY_SCAN_CASE: released_handover_scope_and_version=PASS; protected_cases=11; paused_failed_preserved=true");
    }

    private static void releasedHandoverRollback() {
        reset(); assigned(10, 1, 123L, "TODO"); assigned(10, 2, 123L, "TODO"); successor(10, 456, "0"); disabled(disabledService(), 123);
        List<Map<String, Object>> tasks = jdbc.queryForList("SELECT * FROM wf_task ORDER BY task_id");
        List<Map<String, Object>> monitors = jdbc.queryForList("SELECT * FROM wf_task_monitor ORDER BY task_id");
        jdbc.execute("CREATE TRIGGER own_released_history_failure BEFORE INSERT ON wf_task_delegation FOR EACH ROW BEGIN IF NEW.task_id='t10-2' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OWNED_RELEASED_HISTORY_FAILURE'; END IF; END");
        WfEmployeeOffboardTransferService service = offboardService(sessions.getMapper(WfTaskMapper.class));
        check(contains(caught(() -> transfer(service, 456L)), "OWNED_RELEASED_HISTORY_FAILURE"), "released handover reports second history failure");
        check(tasks.equals(jdbc.queryForList("SELECT * FROM wf_task ORDER BY task_id"))
                && monitors.equals(jdbc.queryForList("SELECT * FROM wf_task_monitor ORDER BY task_id")) && count("wf_task_delegation") == 0,
                "released handover failure rolls back both source records ownership history and monitor together");
        jdbc.execute("DROP TRIGGER own_released_history_failure"); transfer(service, 456L); transfer(service, 456L);
        check(scalar("SELECT COUNT(*) FROM wf_task WHERE assignee=456") == 2 && count("wf_task_delegation") == 2,
                "released handover retry commits both transfers exactly once");
        assertReleaseCleared();
        System.out.println("ANOMALY_SCAN_CASE: released_handover_transaction_recovery=PASS");
    }

    private static void releasedHandoverRace(boolean versionOnly) throws Exception {
        reset(); assigned(10, 1, 123L, "TODO"); successor(10, 456, "0"); disabled(disabledService(), 123);
        WfTaskMapper actual = sessions.getMapper(WfTaskMapper.class);
        CountDownLatch selected = new CountDownLatch(1), release = new CountDownLatch(1);
        AtomicBoolean pause = new AtomicBoolean(true);
        WfTaskMapper timing = (WfTaskMapper) Proxy.newProxyInstance(WfTaskMapper.class.getClassLoader(), new Class<?>[]{WfTaskMapper.class}, (proxy, method, arguments) -> {
            Object result;
            try { result = method.invoke(actual, arguments); }
            catch (InvocationTargetException failure) { throw failure.getCause(); }
            if (method.getName().equals("selectList") && pause.compareAndSet(true, false)) {
                selected.countDown();
                if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Owned released handover deadline");
            }
            return result;
        });
        WfEmployeeOffboardTransferService service = offboardService(timing);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            Future<?> pending = executor.submit(() -> transfer(service, 456L));
            check(selected.await(5, TimeUnit.SECONDS), "handover selected actual released source before concurrent edit");
            jdbc.update("UPDATE wf_task SET assignee=?,lock_version=lock_version+1 WHERE task_id='t10-1'", versionOnly ? null : 789L);
            List<Map<String, Object>> edited = jdbc.queryForList("SELECT * FROM wf_task");
            release.countDown(); pending.get(8, TimeUnit.SECONDS);
            check(edited.equals(jdbc.queryForList("SELECT * FROM wf_task")) && count("wf_task_delegation") == 0,
                    "locking reread preserves concurrent release version change or claim");
        } finally {
            release.countDown(); executor.shutdownNow(); check(executor.awaitTermination(5, TimeUnit.SECONDS), "released handover race worker stopped");
        }
        System.out.println("ANOMALY_SCAN_CASE: released_handover_concurrent_change=PASS; version_only=" + versionOnly);
    }

    private static RuntimeException caught(Runnable action) { try { action.run(); } catch (RuntimeException failure) { return failure; } throw new AssertionError("Expected reported failure"); }
    private static boolean contains(Throwable failure, String text) {
        if (failure == null) return false;
        if (String.valueOf(failure.getMessage()).contains(text) || contains(failure.getCause(), text)) return true;
        for (Throwable suppressed : failure.getSuppressed()) if (contains(suppressed, text)) return true;
        return false;
    }
    private static void check(boolean passed, String detail) { checks++; if (!passed) throw new AssertionError(detail); }
}
