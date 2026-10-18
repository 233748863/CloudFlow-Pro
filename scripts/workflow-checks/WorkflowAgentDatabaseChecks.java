import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.domain.WfAgentSetting;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.dto.AgentSettingRequest;
import com.cloudflow.workflow.domain.dto.AgentTaskRequest;
import com.cloudflow.workflow.domain.vo.AgentDefinitionOptionVO;
import com.cloudflow.workflow.domain.vo.AgentSettingPreviewVO;
import com.cloudflow.workflow.domain.vo.AgentSettingVO;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.*;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.cloudflow.workflow.service.WorkflowAgentPolicy;
import com.cloudflow.workflow.service.WorkflowAgentService;
import com.cloudflow.workflow.service.WorkflowHParticipantPolicy;
import com.cloudflow.workflow.service.WorkflowImCompletionContext;
import com.cloudflow.workflow.service.WorkflowNodePolicy;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.cloudflow.workflow.service.WorkflowStatisticsService;
import com.cloudflow.workflow.service.impl.TaskStatisticsServiceImpl;
import com.cloudflow.workflow.service.impl.WorkflowP4ServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.ibatis.session.LocalCacheScope;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionTemplate;

import java.lang.reflect.Field;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

public final class WorkflowAgentDatabaseChecks implements AutoCloseable {
    private static final long TENANT = 991901L;
    private static final long OTHER_TENANT = 991902L;
    private static final AtomicInteger CHECKS = new AtomicInteger();
    private final AtomicLong identities = new AtomicLong(99190100L);
    private final HikariDataSource source = new HikariDataSource();
    private final ExecutorService workers = Executors.newFixedThreadPool(3);
    private final JdbcTemplate jdbc;
    private final SqlSessionTemplate sessions;
    private final DataSourceTransactionManager manager;
    private final TransactionTemplate transaction;
    private final WorkflowAgentService agents;
    private final WorkflowPermissionService permissions;
    private final WorkflowP4ServiceImpl enhancements;
    private final TaskStatisticsServiceImpl statistics;
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final LocalDateTime now = LocalDateTime.now().truncatedTo(ChronoUnit.SECONDS);

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 3 || !arguments[0].startsWith("jdbc:mysql://127.0.0.1:")) throw new IllegalArgumentException("Owned loopback database required");
        try (WorkflowAgentDatabaseChecks fixture = new WorkflowAgentDatabaseChecks(arguments[0], arguments[1])) {
            if ("ImCallback".equals(arguments[2])) {
                WorkflowImCompletionChecks.run();
                fixture.imCallbackCorrelation();
                fixture.imCallbackExecution();
                fixture.imTodoProjection();
                fixture.imTodoScan();
            } else if ("Snapshot".equals(arguments[2])) {
                fixture.staleModeCannotApprove();
                fixture.staleUserCannotApprove();
                fixture.staleReturnCannotRebind();
            } else if ("Mapping".equals(arguments[2])) {
                fixture.mapping();
            } else {
                fixture.mapping();
                fixture.policyBoundaries();
                fixture.settingAndTaskLifecycle();
                fixture.scopeAndIsolation();
                fixture.selectorAndPreview();
                fixture.assistAndReturn();
                fixture.assistDispositionsDenied();
                fixture.concurrentSettings();
                fixture.concurrentDispositions();
                fixture.dispositionRollback();
                fixture.statisticsAttribution();
                fixture.staleModeCannotApprove();
                fixture.staleUserCannotApprove();
                fixture.staleReturnCannotRebind();
            }
            System.out.println("AGENT_DATABASE_CHECKS: assertions=" + CHECKS.get() + "; failed=0; mysql=true; tenant_interceptor=true; transaction_proxy=true; real_task_business_segment=true; redis_locks=false; peripheral_recorders=true; production_modified=false");
        } finally {
            UserContext.clear();
            TenantContext.clear();
        }
    }

    private WorkflowAgentDatabaseChecks(String url, String ownedData) throws Exception {
        identity(TENANT, 1L);
        source.setJdbcUrl(url);
        source.setUsername("root");
        source.setPassword("");
        source.setMaximumPoolSize(8);
        source.setMinimumIdle(2);
        source.setPoolName("h1-agent-owned");
        jdbc = new JdbcTemplate(source);
        jdbc.setQueryTimeout(20);
        String actualData = jdbc.queryForObject("SELECT @@datadir", String.class);
        equal(Path.of(ownedData).toRealPath(), Path.of(actualData).toRealPath(), "owned MySQL data directory");
        equal("REPEATABLE-READ", jdbc.queryForObject("SELECT @@transaction_isolation", String.class), "production-equivalent repeatable-read isolation");
        manager = new DataSourceTransactionManager(source);
        transaction = new TransactionTemplate(manager);
        transaction.setTimeout(20);
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setCacheEnabled(false);
        configuration.setLocalCacheScope(LocalCacheScope.STATEMENT);
        configuration.setDefaultStatementTimeout(20);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig();
        global.setBanner(false);
        global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
        global.setMetaObjectHandler(new MyMetaObjectHandler());
        GlobalConfigUtils.setGlobalConfig(configuration, global);
        configuration.addMappers("com.cloudflow.workflow.mapper");
        configuration.addInterceptor(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(source);
        factory.setConfiguration(configuration);
        factory.setGlobalConfig(global);
        org.springframework.core.io.Resource[] workflowResources = new PathMatchingResourcePatternResolver().getResources("classpath*:mapper/workflow/*.xml");
        List<org.springframework.core.io.Resource> resources = new java.util.ArrayList<>(List.of(workflowResources));
        resources.add(new org.springframework.core.io.ClassPathResource("mapper/report/ReportSqlMapper.xml"));
        factory.setMapperLocations(resources.toArray(org.springframework.core.io.Resource[]::new));
        sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        equal(true, TableInfoHelper.getTableInfo(com.cloudflow.workflow.domain.system.SysUser.class).isWithLogicDelete(), "real global logical deletion metadata");
        WorkflowNodePolicy nodes = new WorkflowNodePolicy(mapper(WfProcessInstanceMapper.class), mapper(WfProcessDefinitionMapper.class), new WorkflowGraphModelResolver());
        WorkflowHParticipantPolicy participants = new WorkflowHParticipantPolicy(mapper(WfProcessInstanceMapper.class), mapper(SysUserMapper.class), nodes,
                mapper(WfProcessDefinitionMapper.class), mapper(SysRoleMapper.class), mapper(SysUserRoleMapper.class), mapper(WfTaskHistoryMapper.class));
        agents = transactional(new WorkflowAgentService(mapper(WfAgentSettingMapper.class), mapper(WfTaskMapper.class), mapper(WfTaskDelegationMapper.class),
                mapper(WfTaskHistoryMapper.class), mapper(WfProcessInstanceMapper.class), mapper(WfProcessDefinitionMapper.class), mapper(SysUserMapper.class),
                nodes, participants, new WorkflowSecurityUtils(), json));
        permissions = new WorkflowPermissionService();
        inject(permissions, "agents", agents);
        inject(permissions, "sysUserMapper", mapper(SysUserMapper.class));
        inject(permissions, "sysRoleMapper", mapper(SysRoleMapper.class));
        inject(permissions, "sysUserRoleMapper", mapper(SysUserRoleMapper.class));
        inject(permissions, "taskMapper", mapper(WfTaskMapper.class));
        inject(permissions, "taskHistoryMapper", mapper(WfTaskHistoryMapper.class));
        inject(permissions, "processCopyMapper", mapper(WfProcessCopyMapper.class));
        WorkflowP4ServiceImpl enhancementTarget = new WorkflowP4ServiceImpl();
        inject(enhancementTarget, "agents", agents);
        inject(enhancementTarget, "permissionService", permissions);
        inject(enhancementTarget, "taskMapper", mapper(WfTaskMapper.class));
        inject(enhancementTarget, "taskHistoryMapper", mapper(WfTaskHistoryMapper.class));
        inject(enhancementTarget, "taskMonitorMapper", mapper(TaskMonitorMapper.class));
        inject(enhancementTarget, "processInstanceMapper", mapper(WfProcessInstanceMapper.class));
        inject(enhancementTarget, "nodePolicy", nodes);
        inject(enhancementTarget, "hParticipantPolicy", participants);
        WorkflowDatabaseTaskFixture taskFixture = new WorkflowDatabaseTaskFixture(sessions, transaction, agents, permissions, nodes, participants, json);
        inject(enhancementTarget, "taskOperations", taskFixture.operations);
        inject(enhancementTarget, "addSignGroups", taskFixture.addSigns);
        inject(enhancementTarget, "delegationReturns", taskFixture.returns);
        inject(enhancementTarget, "taskReminders", taskFixture.reminders);
        inject(enhancementTarget, "historyState", taskFixture.histories);
        inject(enhancementTarget, "workflowEventPublisher", taskFixture.events);
        enhancements = transactional(enhancementTarget);
        statistics = new TaskStatisticsServiceImpl(mapper(WfTaskMapper.class), mapper(WfTaskHistoryMapper.class),
                mapper(WfProcessInstanceMapper.class), mapper(SysUserMapper.class), permissions);
        jdbc.update("INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name) VALUES(?,?,?),(?,?,?)", TENANT, "H1_AGENT", "H1 agent checks", OTHER_TENANT, "H1_AGENT_OTHER", "H1 other tenant");
    }

    private void mapping() throws Exception {
        AgentCase scenario = scenario();
        WfTask task = task(scenario, scenario.definition());
        jdbc.update("UPDATE wf_task SET lock_version=7 WHERE task_id=?", task.getTaskId());
        transaction.executeWithoutResult(status -> {
            equal(7, mapper(WfTaskMapper.class).selectForUpdate(TENANT, task.getTaskId()).getVersion(), "task lock maps lock_version to version");
            equal(7, mapper(WfAgentSettingMapper.class).selectPrincipalTasksForUpdate(TENANT, scenario.principal()).get(0).getVersion(), "principal task locks map lock_version to version");
        });
        equal(15, columns("wf_agent_setting"), "approved agent setting columns");
        equal(22, columns("wf_task"), "approved task columns with gateway context and disabled-user release snapshot");
        equal(16, columns("wf_task_history"), "approved history attribution columns");
        equal(17, columns("wf_task_delegation"), "approved delegation columns");
        System.out.println("PASS agent-version-mapping-and-schema");
    }

    private void policyBoundaries() {
        WfAgentSetting setting = new WfAgentSetting();
        setting.setStatus("ACTIVE");
        setting.setStartTime(now);
        setting.setEndTime(now.plusHours(1));
        equal(false, WorkflowAgentPolicy.active(setting, now.minusNanos(1)), "before start inactive");
        equal(true, WorkflowAgentPolicy.active(setting, now), "inclusive start");
        equal(true, WorkflowAgentPolicy.active(setting, now.plusHours(1).minusNanos(1)), "last instant before end active");
        equal(false, WorkflowAgentPolicy.active(setting, now.plusHours(1)), "exclusive end");
        setting.setStatus("DISABLED");
        equal(false, WorkflowAgentPolicy.active(setting, now), "disabled inactive");
        for (String mode : List.of("DELEGATE", "agent", "UNKNOWN")) {
            rejected("INVALID_REQUEST", () -> WorkflowAgentPolicy.validate(request(2L, mode, List.of(), null), 1L), "unapproved agent mode");
        }
        rejected("INVALID_REQUEST", () -> WorkflowAgentPolicy.validate(request(1L, "AGENT", List.of(), null), 1L), "self proxy rejected");
        rejected("INVALID_REQUEST", () -> WorkflowAgentPolicy.validate(request(2L, "AGENT", List.of(" x"), null), 1L), "scope identifier is exact");
        equal(List.of("a", "b"), WorkflowAgentPolicy.validate(request(2L, "AGENT", List.of("b", "a", "a"), null), 1L), "scope normalized deterministically");
        System.out.println("PASS agent-policy-time-and-input-boundaries");
    }

    private void settingAndTaskLifecycle() throws Exception {
        AgentCase scenario = scenario();
        WfTask existing = task(scenario, scenario.definition());
        AgentSettingVO saved = agents.save(null, request(scenario.agent(), "AGENT", List.of(), null));
        WfTask bound = read(existing.getTaskId());
        equal(scenario.principal(), bound.getAssignee(), "binding retains principal");
        equal(scenario.agent(), bound.getProxyUserId(), "existing task gains proxy");
        equal(saved.settingId(), bound.getAgentSettingId(), "existing task references setting");
        equal(1, bound.getVersion(), "binding increments version once");
        WfTask future = task(scenario, scenario.definition());
        equal(saved.settingId(), read(future.getTaskId()).getAgentSettingId(), "future task uses effective setting");
        equal(2L, activeRelations(saved.settingId()), "one relation per active task");
        identity(TENANT, scenario.agent());
        equal(true, agents.canAct(bound, scenario.agent()), "valid agent can act");
        permissions.checkTaskPermission(bound);
        equal(2, agents.receivedTasks().size(), "agent sees current eligible tasks");
        identity(TENANT, scenario.principal());
        agents.disable(saved.settingId(), saved.version());
        equal(null, read(existing.getTaskId()).getAgentSettingId(), "disable clears existing binding");
        equal(null, read(future.getTaskId()).getProxyUserId(), "disable clears future binding");
        equal(0L, activeRelations(saved.settingId()), "disable closes relationships");
        equal("DISABLED", mapper(WfAgentSettingMapper.class).selectById(saved.settingId()).getStatus(), "setting retained for audit");
        rejected("AGENT_SETTING_CONFLICT", () -> agents.disable(saved.settingId(), saved.version()), "stale repeated disable rejected");
        equal("TODO", read(existing.getTaskId()).getStatus(), "disable preserves pending task");
        System.out.println("PASS agent-existing-future-binding-and-disable");
    }

    private void scopeAndIsolation() throws Exception {
        AgentCase scenario = scenario();
        String anotherDefinition = definition(true);
        String forbiddenDefinition = definition(false);
        AgentSettingVO setting = agents.save(null, request(scenario.agent(), "AGENT", List.of(scenario.definition()), null));
        WfTask inScope = task(scenario, scenario.definition());
        equal(setting.settingId(), read(inScope.getTaskId()).getAgentSettingId(), "selected definition covered");
        equal(null, read(task(scenario, anotherDefinition).getTaskId()).getAgentSettingId(), "different published definition excluded");
        agents.disable(setting.settingId(), setting.version());
        agents.save(null, request(scenario.agent(), "AGENT", List.of(), null));
        equal(null, read(task(scenario, forbiddenDefinition).getTaskId()).getAgentSettingId(), "node allowAgent defaults to explicit denial");
        identity(TENANT, scenario.agent());
        rejected("AGENT_FORBIDDEN", () -> agents.disable(setting.settingId(), setting.version()), "cannot disable another person's setting");
        rejected("AGENT_FORBIDDEN", () -> agents.save(setting.settingId(), request(scenario.principal(), "AGENT", List.of(), setting.version())), "cannot edit another person's setting");
        rejected("AGENT_FORBIDDEN", () -> agents.save(setting.settingId(), request(scenario.agent(), "AGENT", List.of(), setting.version())), "ownership checked before self-proxy validation");
        identity(OTHER_TENANT, scenario.agent());
        equal(false, agents.canRead(readForTest(inScope.getTaskId()), scenario.agent()), "foreign tenant cannot read proxy task");
        equal(null, mapper(WfAgentSettingMapper.class).selectById(setting.settingId()), "real tenant interceptor hides setting");
        identity(TENANT, scenario.principal());
        long inactive = user(TENANT, "1");
        rejected("AGENT_FORBIDDEN", () -> agents.save(null, request(inactive, "AGENT", List.of(), null)), "disabled user rejected");
        long foreign = user(OTHER_TENANT, "0");
        rejected("AGENT_FORBIDDEN", () -> agents.save(null, request(foreign, "AGENT", List.of(), null)), "foreign tenant proxy rejected");
        System.out.println("PASS agent-scope-node-user-and-tenant-isolation");
    }

    private void selectorAndPreview() throws Exception {
        AgentCase scenario = scenario();
        String draft = definition(true);
        String archived = definition(true);
        String deleted = definition(true);
        String foreign = definition(true);
        String noAgent = definition(false);
        jdbc.update("UPDATE wf_process_definition SET status='DRAFT' WHERE definition_id=?", draft);
        jdbc.update("UPDATE wf_process_definition SET is_archived=1 WHERE definition_id=?", archived);
        jdbc.update("UPDATE wf_process_definition SET deleted=1 WHERE definition_id=?", deleted);
        jdbc.update("UPDATE wf_process_definition SET tenant_id=? WHERE definition_id=?", OTHER_TENANT, foreign);
        PageResult<AgentDefinitionOptionVO> options = agents.definitionOptions(1, 100);
        equal(true, options.getRows().stream().anyMatch(option -> option.definitionId().equals(scenario.definition())), "own published definition is selectable");
        equal(false, options.getRows().stream().anyMatch(option -> Set.of(draft, archived, deleted, foreign).contains(option.definitionId())), "selector excludes draft archived deleted foreign definitions");
        equal(3, json.valueToTree(options.getRows().get(0)).size(), "selector exposes only ID name and version, never model or permissions");
        equal(1, agents.definitionOptions(1, 1).getRows().size(), "selector page size honored");
        rejected("INVALID_REQUEST", () -> agents.definitionOptions(0, 20), "selector invalid page rejected");
        rejected("INVALID_REQUEST", () -> agents.definitionOptions(1, 101), "selector page limit enforced");
        WfTask allowed = task(scenario, scenario.definition());
        WfTask denied = task(scenario, noAgent);
        AgentSettingRequest proposal = request(scenario.agent(), "AGENT", List.of(), null);
        AgentSettingPreviewVO preview = agents.preview(null, proposal, 1, 20);
        equal(2L, preview.total(), "preview includes only current principal pending tasks");
        equal(true, preview.rows().stream().filter(task -> task.taskId().equals(allowed.getTaskId())).findFirst().orElseThrow().allowed(), "preview permits eligible task");
        equal("当前节点禁止代理", preview.rows().stream().filter(task -> task.taskId().equals(denied.getTaskId())).findFirst().orElseThrow().reason(), "preview explains forbidden node");
        equal(0L, agents.mine(1, 20, null).getTotal(), "preview does not create settings");
        equal(null, read(allowed.getTaskId()).getProxyUserId(), "preview does not bind tasks");
        equal(0L, historyCount(allowed.getTaskId()), "preview does not append history");
        equal(1, agents.preview(null, proposal, 2, 1).rows().size(), "preview pagination honored");
        AgentSettingRequest future = new AgentSettingRequest(scenario.agent(), "AGENT", List.of(), now.plusHours(1), now.plusHours(2), null, null);
        equal("SCHEDULED", agents.preview(null, future, 1, 20).effectiveStatus(), "future preview status");
        equal(false, agents.preview(null, future, 1, 20).rows().stream().anyMatch(task -> task.allowed()), "future preview does not claim current coverage");
        for (String invalid : List.of(draft, archived, deleted, foreign)) {
            rejected("INVALID_REQUEST", () -> agents.preview(null, request(scenario.agent(), "AGENT", List.of(invalid), null), 1, 20), "preview rejects unavailable definition");
        }
        AgentSettingVO saved = agents.save(null, proposal);
        equal(saved.settingId(), agents.detail(saved.settingId()).settingId(), "owner reads exact setting without scanning list");
        agents.preview(saved.settingId(), request(scenario.agent(), "AGENT_ASSIST", List.of(), saved.version()), 1, 20);
        equal("AGENT", agents.detail(saved.settingId()).agentMode(), "preview edit does not persist mode");
        equal(saved.version(), agents.detail(saved.settingId()).version(), "preview edit does not change version");
        identity(TENANT, scenario.agent());
        rejected("AGENT_FORBIDDEN", () -> agents.detail(saved.settingId()), "agent cannot read principal private settings");
        rejected("AGENT_FORBIDDEN", () -> agents.preview(saved.settingId(), request(scenario.principal(), "AGENT", List.of(), saved.version()), 1, 20), "preview rejects another user's setting");
        rejected("AGENT_FORBIDDEN", () -> agents.preview(saved.settingId(), request(scenario.agent(), "AGENT", List.of(), saved.version()), 1, 20), "preview ownership checked before self-proxy validation");
        identity(OTHER_TENANT, scenario.principal());
        rejected("AGENT_FORBIDDEN", () -> agents.detail(saved.settingId()), "foreign tenant cannot read setting");
        equal(false, agents.definitionOptions(1, 100).getRows().stream().anyMatch(option -> option.definitionId().equals(scenario.definition())), "selector real tenant isolation");
        identity(TENANT, scenario.principal());
        System.out.println("PASS agent-definition-selector-and-read-only-impact-preview");
    }

    private void imCallbackCorrelation() throws Exception {
        int beforeChecks = CHECKS.get();
        for (String action : List.of("APPROVE", "REJECT")) {
            AgentCase scenario = scenario();
            WfTask task = task(scenario, scenario.definition());
            int version = read(task.getTaskId()).getVersion();
            long callback = identities.incrementAndGet();
            WorkflowImCompletionContext.Command command = new WorkflowImCompletionContext.Command(TENANT, callback, task.getTaskId(), version, scenario.principal(), action);
            WorkflowImCompletionContext.Command stale = new WorkflowImCompletionContext.Command(TENANT, callback, task.getTaskId(), version + 1, scenario.principal(), action);
            rejected("IM_TASK_CONTEXT_INVALID", () -> WorkflowImCompletionContext.call(stale,
                    () -> enhancements.conditionalApprove(task.getTaskId(), scenario.principal(), "forged", action, null, null)), "stale callback cannot complete task");
            equal("TODO", read(task.getTaskId()).getStatus(), "stale callback leaves task pending");
            equal(0L, historyCount(task.getTaskId()), "stale callback creates no history");
            identity(TENANT, scenario.agent());
            rejected("IM_TASK_CONTEXT_INVALID", () -> WorkflowImCompletionContext.call(command,
                    () -> enhancements.conditionalApprove(task.getTaskId(), scenario.agent(), "forged", action, null, null)), "callback cannot borrow another identity");
            identity(TENANT, scenario.principal());
            WorkflowImCompletionContext.call(command, () -> enhancements.conditionalApprove(task.getTaskId(), scenario.principal(), "forged", action, null, null));
            WfTaskHistory history = mapper(WfTaskHistoryMapper.class).selectById(command.historyId());
            equal(task.getTaskId(), history.getTaskId(), "callback history identifies exact task");
            equal(scenario.principal(), history.getOperatorId(), "callback history identifies actual operator");
            equal(action, history.getAction(), "callback history identifies committed action");
            equal(64, history.getHistoryId().length(), "callback correlation fits existing primary key");
            equal(1L, historyCount(task.getTaskId()), "callback produces one primary task history");
        }
        AgentCase assistant = scenario();
        agents.save(null, request(assistant.agent(), "AGENT_ASSIST", List.of(), null));
        WfTask assisted = task(assistant, assistant.definition());
        identity(TENANT, assistant.agent());
        WorkflowImCompletionContext.Command denied = new WorkflowImCompletionContext.Command(TENANT, identities.incrementAndGet(), assisted.getTaskId(), read(assisted.getTaskId()).getVersion(), assistant.agent(), "APPROVE");
        rejected("AGENT_FORBIDDEN", () -> WorkflowImCompletionContext.call(denied,
                () -> enhancements.conditionalApprove(assisted.getTaskId(), assistant.agent(), "forged", "APPROVE", null, null)), "callback retains real assistant restriction");
        equal(0L, historyCount(assisted.getTaskId()), "assistant callback creates no approval history");
        AgentCase rollback = scenario();
        WfTask pending = task(rollback, rollback.definition());
        WorkflowImCompletionContext.Command rolled = new WorkflowImCompletionContext.Command(TENANT, identities.incrementAndGet(), pending.getTaskId(), read(pending.getTaskId()).getVersion(), rollback.principal(), "APPROVE");
        transaction.execute(status -> {
            WorkflowImCompletionContext.call(rolled, () -> {
                WorkflowImCompletionContext.require(read(pending.getTaskId()), "APPROVE");
                WfTaskHistory history = new WfTaskHistory();
                history.setHistoryId(UUID.randomUUID().toString()); history.setTenantId(TENANT); history.setTaskId(pending.getTaskId());
                history.setInstanceId(pending.getInstanceId()); history.setOperatorId(rollback.principal()); history.setAction("APPROVE"); history.setCreateTime(now);
                new com.cloudflow.workflow.service.WorkflowHistoryState(mapper(WfProcessInstanceMapper.class)).record(
                        mapper(WfProcessInstanceMapper.class).selectById(pending.getInstanceId()), read(pending.getTaskId()), history);
                equal(1, mapper(WfTaskHistoryMapper.class).insert(history), "callback history participates in workflow transaction");
                return null;
            });
            status.setRollbackOnly();
            return null;
        });
        equal(null, mapper(WfTaskHistoryMapper.class).selectById(rolled.historyId()), "rolled-back action has no committed event history");
        equal("TODO", read(pending.getTaskId()).getStatus(), "rollback leaves original task pending");
        WorkflowImCompletionContext.call(rolled, () -> enhancements.conditionalApprove(pending.getTaskId(), rollback.principal(), "forged", "APPROVE", null, null));
        equal(rolled.historyId(), mapper(WfTaskHistoryMapper.class).selectById(rolled.historyId()).getHistoryId(), "same event retries after rollback with deterministic history");
        System.out.println("G4_IM_WORKFLOW_CORRELATION_DATABASE: assertions=" + (CHECKS.get() - beforeChecks)
                + "; failed=0; actual_task_business=true; mysql=true; transactions=true; original_agent_policy=true; redis_locks=false; callback_processor=false; vendor_service=false");
    }

    private void imCallbackExecution() throws Exception {
        WorkflowNodePolicy nodes = new WorkflowNodePolicy(mapper(WfProcessInstanceMapper.class), mapper(WfProcessDefinitionMapper.class), new WorkflowGraphModelResolver());
        WorkflowHParticipantPolicy participants = new WorkflowHParticipantPolicy(mapper(WfProcessInstanceMapper.class), mapper(SysUserMapper.class), nodes,
                mapper(WfProcessDefinitionMapper.class), mapper(SysRoleMapper.class), mapper(SysUserRoleMapper.class), mapper(WfTaskHistoryMapper.class));
        WorkflowDatabaseTaskFixture fixture = new WorkflowDatabaseTaskFixture(sessions, transaction, agents, permissions, nodes, participants, json);
        com.cloudflow.workflow.service.WorkflowFormAccessService forms = new com.cloudflow.workflow.service.WorkflowFormAccessService(
                mapper(WfProcessInstanceMapper.class), mapper(WfProcessDefinitionMapper.class), mapper(WfFormDefinitionMapper.class), mapper(WfTaskMapper.class),
                mapper(WfTaskHistoryMapper.class), mapper(WfProcessCopyMapper.class), permissions,
                new com.cloudflow.workflow.service.WorkflowFieldPermissionCache(mapper(WfFormFieldPermissionMapper.class)),
                new WorkflowGraphModelResolver(), new com.cloudflow.workflow.service.WorkflowDraftJson(json), null, null, null);
        WorkflowImCallbackDatabaseChecks checks = new WorkflowImCallbackDatabaseChecks(jdbc, sessions, transaction, fixture.operations,
                new com.cloudflow.workflow.service.WorkflowImButtonPolicy(mapper(WfProcessInstanceMapper.class), nodes, forms));
        checks.run(() -> {
            try { AgentCase scenario = scenario(); return task(scenario, scenario.definition()); }
            catch (Exception failure) { throw new IllegalStateException(failure); }
        });
        int beforeDetails = CHECKS.get();
        AgentCase details = scenario();
        WfTask pending = task(details, details.definition());
        WfTask loaded = fixture.operations.getTodoTask(pending.getTaskId());
        equal(pending.getTaskId(), loaded.getTaskId(), "exact detail selects intended task");
        equal("Agent checks", loaded.getProcessName(), "exact detail includes original instance and node enrichment");
        identity(TENANT, details.agent());
        rejected("PERMISSION_DENIED", () -> fixture.operations.getTodoTask(pending.getTaskId()), "other recipient cannot open task detail");
        UserContext.setRoles(Set.of("ADMIN"));
        rejected("PERMISSION_DENIED", () -> fixture.operations.getTodoTask(pending.getTaskId()), "administrator role does not replace task recipient");
        identity(OTHER_TENANT, details.principal());
        rejected("PERMISSION_DENIED", () -> fixture.operations.getTodoTask(pending.getTaskId()), "cross tenant cannot read task detail");
        identity(TENANT, details.principal());
        rejected("PERMISSION_DENIED", () -> fixture.operations.getTodoTask("invalid.task"), "invalid task link rejected");
        rejected("PERMISSION_DENIED", () -> fixture.operations.getTodoTask(UUID.randomUUID().toString()), "missing task rejected");
        jdbc.update("UPDATE wf_task SET status='COMPLETED',lock_version=lock_version+1 WHERE task_id=?", pending.getTaskId());
        rejected("PERMISSION_DENIED", () -> fixture.operations.getTodoTask(pending.getTaskId()), "completed task has no pending detail");
        AgentSettingVO detailSetting = agents.save(null, request(details.agent(), "AGENT_ASSIST", List.of(), null));
        WfTask delegated = task(details, details.definition());
        identity(TENANT, details.agent());
        equal("AGENT_ASSIST", fixture.operations.getTodoTask(delegated.getTaskId()).getAgentMode(), "valid assist recipient can open original task detail");
        identity(TENANT, details.principal());
        agents.disable(detailSetting.settingId(), detailSetting.version());
        identity(TENANT, details.agent());
        rejected("PERMISSION_DENIED", () -> fixture.operations.getTodoTask(delegated.getTaskId()), "revoked agent cannot reuse detail link");
        equal(0L, historyCount(pending.getTaskId()), "reading exact task does not approve it");
        cn.dev33.satoken.annotation.SaCheckPermission endpoint = com.cloudflow.workflow.controller.WorkflowController.class
                .getMethod("getTodoTask", String.class).getAnnotation(cn.dev33.satoken.annotation.SaCheckPermission.class);
        equal(Set.of("workflow:task:todo", "workflow:process:view"), Set.of(endpoint.value()), "detail endpoint requires both existing permissions");
        equal(cn.dev33.satoken.annotation.SaMode.AND, endpoint.mode(), "detail permission combination is conjunctive");
        System.out.println("G4_IM_TODO_DETAIL_DATABASE: assertions=" + (CHECKS.get() - beforeDetails)
                + "; failed=0; actual_task_service=true; mysql=true; original_agent_policy=true; vendor_service=false");
    }

    private void imTodoProjection() {
        WorkflowNodePolicy nodes = new WorkflowNodePolicy(mapper(WfProcessInstanceMapper.class), mapper(WfProcessDefinitionMapper.class), new WorkflowGraphModelResolver());
        new WorkflowImTodoDatabaseChecks(jdbc, sessions, permissions, nodes).run(() -> {
            try { AgentCase scenario = scenario(); return task(scenario, scenario.definition()); }
            catch (Exception failure) { throw new IllegalStateException(failure); }
        });
    }

    private void imTodoScan() throws Exception {
        int before = CHECKS.get();
        AgentCase scenario = scenario();
        agents.save(null, request(scenario.agent(), "AGENT_ASSIST", List.of(), null));
        WfTask owned = task(scenario, scenario.definition());
        com.cloudflow.workflow.service.WorkflowImTodoScanService scan = new com.cloudflow.workflow.service.WorkflowImTodoScanService(
                mapper(WorkflowImTodoScanMapper.class), agents);
        java.util.ArrayList<com.cloudflow.common.security.im.ImTaskTodos.Candidate> candidates = new java.util.ArrayList<>();
        String cursor = "";
        do {
            com.cloudflow.common.security.im.ImTaskTodos.Page page = scan.scan(new com.cloudflow.common.security.im.ImTaskTodos.Scan(cursor));
            candidates.addAll(page.candidates()); cursor = page.nextTaskId();
        } while (cursor != null);
        com.cloudflow.common.security.im.ImTaskTodos.Candidate match = candidates.stream().filter(candidate -> owned.getTaskId().equals(candidate.taskId())).findFirst().orElseThrow();
        equal(TENANT, match.tenantId(), "scan preserves task tenant");
        equal(owned.getVersion(), match.assignmentVersion(), "scan maps current task lock version");
        equal(List.of(scenario.principal(), scenario.agent()), match.receivers(), "scan includes principal and current valid assist recipient");
        equal(null, UserContext.getTenantId(), "scan clears server identity afterward");
        jdbc.update("UPDATE wf_task SET status='APPROVED' WHERE task_id=?", owned.getTaskId());
        List<WfTask> pending = com.cloudflow.common.tenant.TenantBroker.applyWithoutTenant(ignored -> mapper(WorkflowImTodoScanMapper.class).pending(""));
        equal(false, pending.stream().anyMatch(candidate -> owned.getTaskId().equals(candidate.getTaskId())), "completed task excluded from pending scan");
        identity(TENANT, scenario.principal());
        System.out.println("G4_IM_TODO_SCAN_DATABASE: assertions=" + (CHECKS.get() - before) + "; failed=0; mysql=true; actual_agent_policy=true; external_calls=false");
    }

    private void assistAndReturn() throws Exception {
        AgentCase scenario = scenario();
        AgentSettingVO setting = agents.save(null, request(scenario.agent(), "AGENT_ASSIST", List.of(), null));
        WfTask task = task(scenario, scenario.definition());
        identity(TENANT, scenario.agent());
        equal(true, agents.canRead(read(task.getTaskId()), scenario.agent()), "assistant can read eligible task");
        equal(false, agents.canAct(read(task.getTaskId()), scenario.agent()), "assistant cannot act");
        rejected("AGENT_FORBIDDEN", () -> permissions.checkTaskPermission(read(task.getTaskId())), "assistant final disposition denied by real permissions");
        String historyId = agents.assist(new AgentTaskRequest(task.getTaskId(), 0, null, "需要补充附件"));
        WfTaskHistory history = mapper(WfTaskHistoryMapper.class).selectById(historyId);
        equal(scenario.agent(), history.getOperatorId(), "assistant history real actor");
        equal(scenario.principal(), history.getOnBehalfOfUserId(), "assistant history principal attribution");
        equal("AGENT_ASSIST", history.getAction(), "assistant history action");
        equal("TODO", read(task.getTaskId()).getStatus(), "assistance does not complete task");
        equal(1, read(task.getTaskId()).getVersion(), "assistance consumes task version");
        equal("RUNNING", jdbc.queryForObject("SELECT status FROM wf_process_instance WHERE instance_id=?", String.class, task.getInstanceId()), "assistance does not advance instance");
        rejected("TASK_VERSION_CONFLICT", () -> agents.assist(new AgentTaskRequest(task.getTaskId(), 0, null, "重复提交")), "same assistance version accepted once");
        WfTask returned = agents.returnTask(new AgentTaskRequest(task.getTaskId(), 1, "请本人处理", null));
        equal(task.getTaskId(), returned.getTaskId(), "return preserves exact task identifier");
        equal(null, read(task.getTaskId()).getProxyUserId(), "return clears proxy");
        equal(null, read(task.getTaskId()).getAgentSettingId(), "return clears setting");
        equal("TODO", read(task.getTaskId()).getStatus(), "return keeps principal pending task");
        equal(2, read(task.getTaskId()).getVersion(), "return increments version");
        equal(0L, activeRelations(setting.settingId()), "return closes active relation");
        rejected("TASK_VERSION_CONFLICT", () -> agents.returnTask(new AgentTaskRequest(task.getTaskId(), 1, "重复归还", null)), "repeated return rejected");
        identity(TENANT, scenario.principal());
        agents.refreshPrincipal(scenario.principal());
        equal(null, read(task.getTaskId()).getAgentSettingId(), "refresh does not reattach returned setting");
        equal(1L, jdbc.queryForObject("SELECT COUNT(*) FROM wf_task WHERE instance_id=?", Long.class, task.getInstanceId()), "return creates no duplicate task");
        System.out.println("PASS agent-assist-return-attribution-and-no-duplicate-task");
    }

    private void concurrentSettings() throws Exception {
        AgentCase scenario = scenario();
        CyclicBarrier barrier = new CyclicBarrier(2);
        Future<String> first = workers.submit(() -> competingSave(scenario, barrier));
        Future<String> second = workers.submit(() -> competingSave(scenario, barrier));
        List<String> outcomes = List.of(first.get(25, TimeUnit.SECONDS), second.get(25, TimeUnit.SECONDS));
        equal(1L, outcomes.stream().filter("SAVED"::equals).count(), "one concurrent overlapping setting saves");
        equal(1L, outcomes.stream().filter("AGENT_SETTING_CONFLICT"::equals).count(), "second overlapping setting conflicts");
        equal(1L, jdbc.queryForObject("SELECT COUNT(*) FROM wf_agent_setting WHERE principal_user_id=?", Long.class, scenario.principal()), "no duplicate setting committed");
        System.out.println("PASS agent-concurrent-first-setting-save-one-winner");
    }

    private void assistDispositionsDenied() throws Exception {
        AgentCase scenario = scenario();
        agents.save(null, request(scenario.agent(), "AGENT_ASSIST", List.of(), null));
        WfTask task = task(scenario, scenario.definition());
        identity(TENANT, scenario.agent());
        rejected("AGENT_FORBIDDEN", () -> enhancements.conditionalApprove(task.getTaskId(), scenario.agent(), "forged", "APPROVE", "approve", null), "assistant cannot approve through enhancement endpoint");
        rejected("AGENT_FORBIDDEN", () -> enhancements.conditionalApprove(task.getTaskId(), scenario.agent(), "forged", "REJECT", "reject", null), "assistant cannot reject through enhancement endpoint");
        rejected("AGENT_FORBIDDEN", () -> enhancements.delegateTask(task.getTaskId(), scenario.principal(), "forged", "transfer"), "assistant cannot transfer");
        rejected("AGENT_FORBIDDEN", () -> enhancements.delegateWithReturn(task.getTaskId(), scenario.principal(), "forged", "delegate"), "assistant cannot delegate");
        rejected("AGENT_FORBIDDEN", () -> enhancements.addSign(task.getTaskId(), List.of(scenario.principal()), List.of("forged"), "PARALLEL", "add sign"), "assistant cannot add signatures");
        rejected("AGENT_FORBIDDEN", () -> enhancements.removeSign(task.getTaskId(), List.of(scenario.principal()), "remove sign"), "assistant cannot remove signatures");
        rejected("AGENT_FORBIDDEN", () -> enhancements.setTaskPriority(task.getTaskId(), "URGENT"), "assistant cannot change task priority");
        equal(0L, historyCount(task.getTaskId()), "forged assistant final actions create no history");
        equal(0, read(task.getTaskId()).getVersion(), "forged assistant final actions do not change version");
        equal("TODO", read(task.getTaskId()).getStatus(), "forged assistant final actions do not change task state");
        System.out.println("PASS agent-assist-seven-final-disposition-paths-denied");
    }

    private void concurrentDispositions() throws Exception {
        AgentCase scenario = scenario();
        AgentSettingVO setting = agents.save(null, request(scenario.agent(), "AGENT", List.of(), null));
        WfTask task = task(scenario, scenario.definition());
        CyclicBarrier barrier = new CyclicBarrier(2);
        Future<String> principal = workers.submit(() -> competingDisposition(scenario.principal(), task.getTaskId(), barrier));
        Future<String> agent = workers.submit(() -> competingDisposition(scenario.agent(), task.getTaskId(), barrier));
        List<String> outcomes = List.of(principal.get(25, TimeUnit.SECONDS), agent.get(25, TimeUnit.SECONDS));
        equal(1L, outcomes.stream().filter("COMPLETED"::equals).count(), "principal and agent disposition has one winner");
        equal(1L, outcomes.stream().filter(result -> Set.of("AGENT_FORBIDDEN", "TASK_VERSION_CONFLICT").contains(result)).count(), "second disposition is rejected");
        equal(1L, historyCount(task.getTaskId()), "one committed disposition history");
        equal(null, read(task.getTaskId()), "one task consumed");
        equal(0L, activeRelations(setting.settingId()), "winning disposition completes proxy relation");
        System.out.println("PASS agent-enhancement-principal-agent-mysql-competition-one-disposition");
    }

    private String competingDisposition(long actor, String taskId, CyclicBarrier barrier) throws Exception {
        identity(TENANT, actor);
        try {
            barrier.await(10, TimeUnit.SECONDS);
            enhancements.conditionalApprove(taskId, actor, "untrusted name", "APPROVE", "decision", null);
            return "COMPLETED";
        } catch (WorkflowException conflict) {
            return conflict.getCode();
        } finally {
            UserContext.clear();
            TenantContext.clear();
        }
    }

    private void dispositionRollback() throws Exception {
        AgentCase scenario = scenario();
        AgentSettingVO setting = agents.save(null, request(scenario.agent(), "AGENT", List.of(), null));
        WfTask task = task(scenario, scenario.definition());
        jdbc.update("UPDATE wf_task SET node_name='h1-fail-delete' WHERE task_id=?", task.getTaskId());
        jdbc.execute("CREATE TRIGGER h1_delete_failure BEFORE DELETE ON wf_task FOR EACH ROW BEGIN IF OLD.node_name='h1-fail-delete' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='h1_injected_failure'; END IF; END");
        identity(TENANT, scenario.agent());
        boolean failed = false;
        try {
            enhancements.conditionalApprove(task.getTaskId(), scenario.agent(), "forged", "APPROVE", "rollback", null);
        } catch (DataAccessException expected) {
            failed = true;
        } finally {
            jdbc.execute("DROP TRIGGER h1_delete_failure");
        }
        equal(true, failed, "actual database delete failure reaches caller");
        equal("TODO", read(task.getTaskId()).getStatus(), "database failure restores pending task");
        equal(0L, historyCount(task.getTaskId()), "database failure rolls back inserted history");
        equal(1L, activeRelations(setting.settingId()), "database failure rolls back relation completion");
        System.out.println("PASS agent-real-database-failure-rolls-back-task-history-and-relation");
    }

    private void statisticsAttribution() throws Exception {
        AgentCase scenario = scenario();
        agents.save(null, request(scenario.agent(), "AGENT", List.of(), null));
        WfTask task = task(scenario, scenario.definition());
        identity(TENANT, scenario.agent());
        enhancements.conditionalApprove(task.getTaskId(), scenario.agent(), "forged", "APPROVE", "approved", null);
        WfTaskHistory history = mapper(WfTaskHistoryMapper.class).selectOne(new LambdaQueryWrapper<WfTaskHistory>().eq(WfTaskHistory::getTaskId, task.getTaskId()));
        equal(scenario.agent(), history.getOperatorId(), "approval history retains real agent");
        equal("Agent " + scenario.agent(), history.getOperatorName(), "approval history ignores caller supplied name");
        equal(scenario.principal(), history.getOnBehalfOfUserId(), "approval history attributes principal");
        equal(0, statistics.getTasksCount(scenario.agent()).get("completed"), "agent receives no duplicate workload");
        equal(1, statistics.getTasksCount(scenario.principal()).get("completed"), "principal receives approval workload");
        for (String action : List.of("AGENT_ASSIST", "AGENT_RETURN")) {
            history.setHistoryId(UUID.randomUUID().toString());
            history.setAction(action);
            mapper(WfTaskHistoryMapper.class).insert(history);
        }
        equal(1, statistics.getTasksCount(scenario.principal()).get("completed"), "assistance and return do not increase completion count");
        equal(0, statistics.getTasksCount(scenario.agent()).get("completed"), "assistance and return do not inflate agent workload");
        identity(TENANT, scenario.principal());
        Map<?, ?> status = (Map<?, ?>) statistics.getTaskStatistics(scenario.principal(), null, null).values().get("status");
        equal(1L, status.get("done"), "personal statistics share attribution rule");
        WorkflowStatisticsService dashboard = new WorkflowStatisticsService();
        inject(dashboard, "taskHistoryMapper", mapper(WfTaskHistoryMapper.class));
        inject(dashboard, "processInstanceMapper", mapper(WfProcessInstanceMapper.class));
        inject(dashboard, "processDefinitionMapper", mapper(WfProcessDefinitionMapper.class));
        List<?> ranks = (List<?>) dashboard.getStatisticsAnalysis().get("workloadRank");
        Map<?, ?> principalRank = ranks.stream().map(row -> (Map<?, ?>) row).filter(row -> Objects.equals(row.get("operatorId"), scenario.principal())).findFirst().orElseThrow();
        equal(1L, principalRank.get("taskCount"), "workload ranking counts one principal completion");
        equal(false, ranks.stream().map(row -> (Map<?, ?>) row).anyMatch(row -> Objects.equals(row.get("operatorId"), scenario.agent())), "workload ranking does not double-count agent");
        System.out.println("PASS agent-history-workload-and-dashboard-attribution");
    }

    private String competingSave(AgentCase scenario, CyclicBarrier barrier) throws Exception {
        identity(TENANT, scenario.principal());
        try {
            barrier.await(10, TimeUnit.SECONDS);
            agents.save(null, request(scenario.agent(), "AGENT", List.of(), null));
            return "SAVED";
        } catch (WorkflowException conflict) {
            return conflict.getCode();
        } finally {
            UserContext.clear();
            TenantContext.clear();
        }
    }

    private void staleModeCannotApprove() throws Exception {
        AgentCase scenario = scenario();
        AgentSettingVO saved = agents.save(null, request(scenario.agent(), "AGENT", List.of(), null));
        WfTask task = task(scenario, scenario.definition());
        CountDownLatch snapshotReady = new CountDownLatch(1);
        CountDownLatch updateCommitted = new CountDownLatch(1);
        Future<Boolean> oldSnapshot = workers.submit(() -> {
            identity(TENANT, scenario.agent());
            try {
                TransactionTemplate repeatableRead = new TransactionTemplate(manager);
                repeatableRead.setTimeout(20);
                repeatableRead.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
                return repeatableRead.execute(status -> {
                    equal("AGENT", mapper(WfAgentSettingMapper.class).selectById(saved.settingId()).getAgentMode(), "old repeatable-read snapshot sees agent mode");
                    mapper(WfTaskDelegationMapper.class).selectList(null);
                    mapper(WfTaskMapper.class).selectById(task.getTaskId());
                    snapshotReady.countDown();
                    await(updateCommitted);
                    WfTask locked = agents.lockTask(task.getTaskId());
                    equal(1, locked.getVersion(), "locked task reads committed changed version");
                    return agents.canAct(locked, scenario.agent());
                });
            } finally {
                UserContext.clear();
                TenantContext.clear();
            }
        });
        await(snapshotReady);
        try {
            agents.save(saved.settingId(), request(scenario.agent(), "AGENT_ASSIST", List.of(), saved.version()));
        } finally {
            updateCommitted.countDown();
        }
        equal(false, oldSnapshot.get(25, TimeUnit.SECONDS), "current mode must reject approval despite older transaction snapshot");
        equal("AGENT_ASSIST", mapper(WfAgentSettingMapper.class).selectById(saved.settingId()).getAgentMode(), "mode change committed");
        equal("TODO", read(task.getTaskId()).getStatus(), "stale authorization leaves pending task unchanged");
        System.out.println("PASS agent-repeatable-read-mode-change-does-not-retain-write-permission");
    }

    private void staleUserCannotApprove() throws Exception {
        AgentCase scenario = scenario();
        agents.save(null, request(scenario.agent(), "AGENT", List.of(), null));
        WfTask task = task(scenario, scenario.definition());
        CountDownLatch snapshotReady = new CountDownLatch(1);
        CountDownLatch disableCommitted = new CountDownLatch(1);
        Future<Boolean> oldSnapshot = workers.submit(() -> {
            identity(TENANT, scenario.agent());
            try {
                return transaction.execute(status -> {
                    equal("0", mapper(SysUserMapper.class).selectById(scenario.agent()).getStatus(), "old transaction sees enabled proxy user");
                    snapshotReady.countDown();
                    await(disableCommitted);
                    return agents.canAct(agents.lockTask(task.getTaskId()), scenario.agent());
                });
            } finally {
                UserContext.clear();
                TenantContext.clear();
            }
        });
        await(snapshotReady);
        try {
            jdbc.update("UPDATE sys_user SET status='1' WHERE user_id=?", scenario.agent());
        } finally {
            disableCommitted.countDown();
        }
        equal(false, oldSnapshot.get(25, TimeUnit.SECONDS), "disabled proxy must lose authority despite old transaction snapshot");
        equal("TODO", read(task.getTaskId()).getStatus(), "disabled proxy leaves pending task unchanged");
        System.out.println("PASS agent-repeatable-read-disabled-user-cannot-retain-permission");
    }

    private void staleReturnCannotRebind() throws Exception {
        AgentCase scenario = scenario();
        AgentSettingVO saved = agents.save(null, request(scenario.agent(), "AGENT", List.of(), null));
        WfTask task = task(scenario, scenario.definition());
        CountDownLatch snapshotReady = new CountDownLatch(1);
        CountDownLatch returnCommitted = new CountDownLatch(1);
        Future<Long> oldSnapshot = workers.submit(() -> {
            identity(TENANT, scenario.principal());
            try {
                return transaction.execute(status -> {
                    equal(0, mapper(WfTaskHistoryMapper.class).selectList(new LambdaQueryWrapper<WfTaskHistory>()
                            .eq(WfTaskHistory::getTaskId, task.getTaskId())).size(), "old transaction sees no return history");
                    snapshotReady.countDown();
                    await(returnCommitted);
                    agents.refreshPrincipal(scenario.principal());
                    return mapper(WfTaskMapper.class).selectForUpdate(TENANT, task.getTaskId()).getProxyUserId();
                });
            } finally {
                UserContext.clear();
                TenantContext.clear();
            }
        });
        await(snapshotReady);
        try {
            identity(TENANT, scenario.agent());
            agents.returnTask(new AgentTaskRequest(task.getTaskId(), 0, "交还本人", null));
        } finally {
            returnCommitted.countDown();
        }
        equal(null, oldSnapshot.get(25, TimeUnit.SECONDS), "returned task must not be rebound despite older transaction snapshot");
        equal(0L, activeRelations(saved.settingId()), "returned setting has no active relation after stale refresh");
        System.out.println("PASS agent-repeatable-read-returned-task-cannot-be-rebound");
    }

    private AgentCase scenario() throws Exception {
        long principal = user(TENANT, "0");
        long agent = user(TENANT, "0");
        identity(TENANT, principal);
        return new AgentCase(principal, agent, definition(true));
    }

    private long user(long tenant, String status) {
        long identifier = identities.incrementAndGet();
        jdbc.update("INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name,status,deleted) VALUES(?,?,?,?,?,0)", identifier, tenant, "agent_" + identifier, "Agent " + identifier, status);
        return identifier;
    }

    private String definition(boolean allowed) throws Exception {
        String definition = UUID.randomUUID().toString();
        String model = json.writeValueAsString(Map.of("nodes", List.of(Map.of("id", "start", "type", "START", "title", "start"),
                        Map.of("id", "review", "type", "APPROVAL", "title", "review", "allowAgent", allowed), Map.of("id", "end", "type", "END", "title", "end")),
                "edges", List.of(Map.of("id", "start-review", "source", "start", "target", "review"), Map.of("id", "review-end", "source", "review", "target", "end"))));
        jdbc.update("INSERT INTO wf_process_definition(definition_id,tenant_id,process_name,process_key,model_json,status) VALUES(?,?,?,?,?,'PUBLISHED')", definition, TENANT, "Agent checks", definition, model);
        return definition;
    }

    private WfTask task(AgentCase scenario, String definition) {
        identity(TENANT, scenario.principal());
        String instance = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO wf_process_instance(instance_id,tenant_id,process_def_key,definition_id,business_key,start_user_id,status,variables) VALUES(?,?,?,?,?,?,'RUNNING','{}')", instance, TENANT, definition, definition, instance, scenario.principal());
        WfTask task = new WfTask();
        task.setTaskId(UUID.randomUUID().toString());
        task.setTenantId(TENANT);
        task.setInstanceId(instance);
        task.setNodeKey("review");
        task.setNodeName("review");
        task.setAssignee(scenario.principal());
        task.setAssigneeName("Agent " + scenario.principal());
        task.setStatus("TODO");
        task.setCreateTime(now);
        agents.createTask(task);
        return task;
    }

    private AgentSettingRequest request(Long agent, String mode, List<String> scope, Integer version) {
        return new AgentSettingRequest(agent, mode, scope, now.minusHours(1), now.plusHours(1), "H1 verification", version);
    }

    private WfTask read(String taskId) { return mapper(WfTaskMapper.class).selectById(taskId); }

    private WfTask readForTest(String taskId) {
        WfTask task = new WfTask();
        Map<String, Object> row = jdbc.queryForMap("SELECT tenant_id,assignee,proxy_user_id,agent_setting_id FROM wf_task WHERE task_id=?", taskId);
        task.setTaskId(taskId);
        task.setTenantId(((Number) row.get("tenant_id")).longValue());
        task.setAssignee(((Number) row.get("assignee")).longValue());
        task.setProxyUserId(((Number) row.get("proxy_user_id")).longValue());
        task.setAgentSettingId((String) row.get("agent_setting_id"));
        return task;
    }

    private long activeRelations(String settingId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM wf_task_delegation WHERE setting_id=? AND status='ACTIVE'", Long.class, settingId);
    }

    private long historyCount(String taskId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM wf_task_history WHERE task_id=?", Long.class, taskId);
    }

    private int columns(String table) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?", Integer.class, table);
    }

    private <Type> Type mapper(Class<Type> type) { return sessions.getMapper(type); }

    @SuppressWarnings("unchecked")
    private <Type> Type transactional(Type target) {
        ProxyFactory factory = new ProxyFactory(target);
        factory.setProxyTargetClass(true);
        factory.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));
        return (Type) factory.getProxy();
    }

    private static void inject(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static void identity(long tenant, long user) {
        TenantContext.setTenantId(tenant);
        UserContext.setTenantId(tenant);
        UserContext.setUserId(user);
        UserContext.setUserName("Agent " + user);
        UserContext.setRoles(Set.of("EMPLOYEE"));
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(15, TimeUnit.SECONDS)) throw new AssertionError("Concurrency coordination timed out");
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new AssertionError("Concurrency check interrupted", interrupted);
        }
    }

    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + "; actual=" + actual);
        CHECKS.incrementAndGet();
    }

    private static void rejected(String code, Runnable operation, String label) {
        try { operation.run(); }
        catch (WorkflowException failure) { equal(code, failure.getCode(), label); return; }
        throw new AssertionError(label + ": expected rejection " + code);
    }

    @Override
    public void close() {
        workers.shutdownNow();
        source.close();
    }

    private record AgentCase(long principal, long agent, String definition) { }
}
