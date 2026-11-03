import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.AbstractWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.workflow.domain.WfDeployNotification;
import com.cloudflow.workflow.domain.WfDeployRecord;
import com.cloudflow.workflow.domain.WfDeployRollbackHistory;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.WfTaskRead;
import com.cloudflow.workflow.domain.dto.NotificationConfigDTO;
import com.cloudflow.workflow.domain.dto.SafetyCheckResultDTO;
import com.cloudflow.workflow.domain.system.SysDept;
import com.cloudflow.workflow.domain.system.SysRole;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.handler.impl.NotificationNodeHandler;
import com.cloudflow.workflow.mapper.WfDeployNotificationMapper;
import com.cloudflow.workflow.mapper.WfDeployRecordMapper;
import com.cloudflow.workflow.mapper.WfDeployRollbackHistoryMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.mapper.WfTaskReadMapper;
import com.cloudflow.workflow.mapper.system.SysDeptMapper;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.service.INodeExecutionService;
import com.cloudflow.workflow.service.WorkflowAgentService;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.cloudflow.workflow.service.impl.DeployEnhancementServiceImpl;
import com.cloudflow.workflow.service.impl.WfTaskServiceImpl;
import com.cloudflow.workflow.util.SafetyChecker;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.BoundSql;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;

/** 按审计改动补齐正常代表流程；实际服务方法配受控 Mapper，不模拟整站运行。 */
public final class WorkflowBatchReadChecks {
    private static int checks;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String MODEL = """
            {"nodes":[{"id":"start","type":"START","title":"开始"},
                       {"id":"approve","type":"APPROVAL","title":"审批","props":{"approverType":"USER","approverValue":"10"}},
                       {"id":"end","type":"END","title":"结束"}],
             "edges":[{"id":"a","source":"start","target":"approve"},{"id":"b","source":"approve","target":"end"}]}
            """;

    public static void main(String[] arguments) throws Exception {
        for (Class<?> type : List.of(WfProcessDefinition.class, WfProcessInstance.class, WfTask.class,
                WfTaskHistory.class, WfTaskRead.class, WfDeployRecord.class, SysUser.class, SysUserRole.class,
                SysRole.class, SysDept.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "batch-read"), type);
        }
        UserContext.setTenantId(100L);
        UserContext.setUserId(10L);
        UserContext.setUserName("检查员");
        try {
            List<String> groups = arguments.length == 0 ? List.of("tasks", "safety", "notifications", "deploy") : List.of(arguments);
            for (String group : groups) {
                int before = checks;
                switch (group) {
                    case "tasks" -> taskPages();
                    case "safety" -> batchSafety();
                    case "notifications" -> notifications();
                    case "deploy" -> deployReadViews();
                    default -> throw new IllegalArgumentException("Unknown check group: " + group);
                }
                System.out.println("PASS: Workflow batch group=" + group + "; checks=" + (checks - before));
            }
            System.out.println("PASS: Workflow batch read checks=" + checks + "; actual_database=false");
        } finally {
            UserContext.clear();
        }
    }

    private static void taskPages() throws Exception {
        WfTaskServiceImpl service = new WfTaskServiceImpl();
        WfProcessDefinition definition = definition("definition-1", 100L);
        definition.setModelJson(MODEL);
        WfProcessInstance instance = new WfProcessInstance();
        instance.setInstanceId("instance-1");
        instance.setDefinitionId("definition-1");
        instance.setTenantId(100L);
        instance.setStatus("RUNNING");
        instance.setStartUserId(10L);
        instance.setStartUserName("申请人");
        instance.setTitle("同实例任务");
        instance.setVariables("{\"amount\":60}");
        List<WfTask> tasks = new ArrayList<>();
        List<WfTaskHistory> histories = new ArrayList<>();
        for (int index = 1; index <= 2; index++) {
            WfTask task = new WfTask();
            task.setTaskId("task-" + index);
            task.setTenantId(100L);
            task.setInstanceId("instance-1");
            task.setNodeKey("approve");
            task.setAssignee(10L);
            tasks.add(task);
            WfTaskHistory history = new WfTaskHistory();
            history.setHistoryId("history-" + index);
            history.setTenantId(100L);
            history.setTaskId(task.getTaskId());
            history.setInstanceId("instance-1");
            history.setNodeKey("approve");
            history.setAction(index == 1 ? "APPROVE" : "REJECT");
            history.setOperatorId(10L);
            history.setCreateTime(LocalDateTime.of(2026, 11, 3, 10, index));
            history.setVariablesChanged("{\"_wf_execution\":{\"sequence\":" + index + ",\"executionContext\":null}}");
            histories.add(history);
        }
        int[] reads = new int[5];
        inject(service, "processInstanceMapper", proxy(WfProcessInstanceMapper.class, (target, method, values) -> {
            equal("selectBatchIds", method.getName(), "task page loads instances in one batch");
            reads[0]++;
            equal(List.of("instance-1"), values[0], "repeated instance identity is deduplicated");
            return List.of(instance);
        }));
        inject(service, "processDefinitionMapper", proxy(WfProcessDefinitionMapper.class, (target, method, values) -> {
            equal("selectBatchIds", method.getName(), "task page loads locked definitions in one batch");
            reads[1]++;
            return List.of(definition);
        }));
        inject(service, "objectMapper", new ObjectMapper() {
            @Override public <T> T readValue(String value, TypeReference<T> type) throws JsonProcessingException {
                if (value.equals(instance.getVariables())) reads[2]++;
                return super.readValue(value, type);
            }
        });
        inject(service, "workflowGraphModelResolver", new WorkflowGraphModelResolver() {
            @Override public WfNodeConfig parseRuntimeRoot(String model) {
                reads[3]++;
                return super.parseRuntimeRoot(model);
            }
        });
        WfNodeConfig approval = new WfNodeConfig();
        approval.setId("approve");
        approval.setAllowRollback(true);
        approval.setAllowEdit(false);
        inject(service, "nodeExecutionService", proxy(INodeExecutionService.class, (target, method, values) -> switch (method.getName()) {
            case "extractApprovalSteps" -> { reads[4]++; yield List.of(Map.of("nodeKey", "approve", "nodeTitle", "审批")); }
            case "findNode" -> approval;
            case "extractNodeButtons" -> List.of("APPROVE", "REJECT");
            case "buildAllStepsDetail" -> List.of();
            default -> throw new AssertionError("unexpected node operation " + method.getName());
        }));
        inject(service, "permissionService", new WorkflowPermissionService() {
            @Override public boolean canReadTask(WfTask task) { return Objects.equals(100L, task.getTenantId()); }
        });
        inject(service, "agents", new WorkflowAgentService(null, null, null, null, null, null, null, null, null, null, JSON) {
            @Override public List<WfTask> receivedTasks() { return List.of(); }
        });
        inject(service, "taskMapper", proxy(WfTaskMapper.class, (target, method, values) -> {
            tenantQuery(values[1]);
            Page<WfTask> page = new Page<>(1, 10, 2);
            page.setRecords(tasks);
            return page;
        }));
        inject(service, "taskReadMapper", proxy(WfTaskReadMapper.class, (target, method, values) -> List.of()));
        inject(service, "sysUserMapper", proxy(SysUserMapper.class, (target, method, values) -> List.of(user(10L, 20L))));
        inject(service, "taskHistoryMapper", proxy(WfTaskHistoryMapper.class, (target, method, values) -> {
            if (method.getName().equals("selectList")) return histories;
            equal("selectPage", method.getName(), "completed tasks use history page");
            tenantQuery(values[1]);
            Page<WfTaskHistory> page = new Page<>(1, 10, 2);
            page.setRecords(histories);
            return page;
        }));
        PageResult<WfTask> todo = service.getTodoTasks(10L, new PageQuery());
        equal(2, todo.getRows().size(), "both pending tasks are returned");
        equal(60, todo.getRows().get(0).getVariables().get("amount"), "pending task has real instance values");
        equal(true, todo.getRows().get(0).getVariables() == todo.getRows().get(1).getVariables(), "pending tasks share parsed instance values");
        equal(List.of(1, 1, 1, 1, 1), counts(reads), "pending page loads and parses each shared input once");
        equal(List.of("APPROVE", "REJECT"), todo.getRows().get(1).getButtonPermissions(), "cached node still fills buttons");
        PageResult<WfTask> done = service.getDoneTasks(10L, new PageQuery());
        equal(2, done.getRows().size(), "both completed histories are returned");
        equal(true, done.getRows().get(0).getCanWithdraw(), "effective approval history allows withdrawal");
        equal(false, done.getRows().get(1).getCanWithdraw(), "rejection history cannot borrow another history's withdrawal permission");
        equal(1, done.getRows().get(1).getCurrentStepIndex(), "completed task receives shared step information");
        equal(true, done.getRows().get(0).getVariables() == done.getRows().get(1).getVariables(), "completed tasks share parsed instance values");
        equal(List.of(2, 2, 2, 2, 2), counts(reads), "completed page independently loads and parses each shared input once");
    }

    private static void batchSafety() throws Exception {
        SafetyChecker checker = new SafetyChecker();
        WfProcessDefinition first = definition("first", 100L);
        WfProcessDefinition second = definition("second", 100L);
        int[] reads = new int[2];
        List<Map<String, Object>> running = new ArrayList<>();
        List<WfProcessDefinition> dependents = new ArrayList<>();
        inject(checker, "definitionMapper", proxy(WfProcessDefinitionMapper.class, (target, method, values) -> {
            if (method.getName().equals("selectBatchIds")) { reads[0]++; return List.of(first, second); }
            if (method.getName().equals("selectList")) return dependents;
            throw new AssertionError("safety cannot reread individual definitions: " + method.getName());
        }));
        inject(checker, "instanceMapper", proxy(WfProcessInstanceMapper.class, (target, method, values) -> {
            equal("selectMaps", method.getName(), "active instances use grouped aggregate");
            QueryWrapper<?> query = (QueryWrapper<?>) values[0];
            equal(true, query.getSqlSegment().contains("GROUP BY definition_id"), "active aggregate groups by definition");
            equal(true, query.getParamNameValuePairs().containsValue("PAUSED"), "paused processes remain protected");
            reads[1]++;
            return running;
        }));
        inject(checker, "permissionService", new WorkflowPermissionService() {
            @Override public boolean isAdmin(Long userId) { return false; }
        });
        equal(true, checker.checkSafety(List.of("first", "second")).getSafe(), "two owned inactive definitions pass safety");
        equal(List.of(1, 1), List.of(reads[0], reads[1]), "all safety phases reuse one definition batch and one running aggregate");
        running.add(Map.of("definitionId", "first", "runningCount", 2L));
        dependents.add(definition("outside-reference", 100L));
        second.setTenantId(200L);
        SafetyCheckResultDTO blocked = checker.checkSafety(List.of("first", "second", "missing"));
        equal(false, blocked.getSafe(), "running missing or foreign definitions cannot be removed");
        equal(List.of("first"), blocked.getWorkflowsWithRunningInstances(), "running count is assigned to its definition");
        equal(List.of("second"), blocked.getWorkflowsWithoutPermission(), "tenant protection survives batched reads");
        equal(true, blocked.getDetails().containsKey("missing"), "missing definition remains explicit");
        equal(List.of("first", "second"), blocked.getWorkflowsWithDependencies(), "dependency warning is preserved");
    }

    private static void notifications() throws Exception {
        DeployEnhancementServiceImpl service = new DeployEnhancementServiceImpl();
        WfDeployRecord record = new WfDeployRecord();
        record.setId(50L);
        record.setTenantId(100L);
        List<MessageSendRequest> sent = new ArrayList<>();
        MessageSender sender = sent::add;
        int[] reads = new int[2];
        SysUserRoleMapper memberships = proxy(SysUserRoleMapper.class, (target, method, values) -> {
            tenantQuery(values[0]);
            reads[0]++;
            return List.of(member(1L, 11L), member(1L, 12L), member(2L, 11L), member(2L, 99L));
        });
        SysUserMapper users = proxy(SysUserMapper.class, (target, method, values) -> {
            equal("selectList", method.getName(), "notification recipients are batch checked");
            tenantQuery(values[0]);
            AbstractWrapper<?, ?, ?> query = (AbstractWrapper<?, ?, ?>) values[0];
            equal(true, query.getSqlSegment().contains("status") && query.getSqlSegment().contains("deleted"), "recipient query requires active undeleted users");
            reads[1]++;
            return List.of(user(11L, 20L), user(12L, 30L));
        });
        inject(service, "sysNoticeService", sender);
        inject(service, "sysUserRoleMapper", memberships);
        inject(service, "sysUserMapper", users);
        inject(service, "objectMapper", JSON);
        inject(service, "deployRecordMapper", proxy(WfDeployRecordMapper.class, (target, method, values) -> record));
        inject(service, "deployNotificationMapper", proxy(WfDeployNotificationMapper.class, (target, method, values) -> {
            if (method.getName().equals("insert")) ((WfDeployNotification) values[0]).setId(60L);
            return 1;
        }));
        NotificationConfigDTO config = new NotificationConfigDTO();
        config.setNotificationType("WEBSOCKET");
        config.setRecipientType("ROLE");
        config.setRecipientIds(List.of(1L, 2L, 1L));
        config.setNotificationTitle("发布通知");
        config.setNotificationContent("审批流程已发布");
        service.sendDeployNotification(50L, List.of(config));
        equal(List.of(11L, 12L), recipientIds(sent), "role duplicates and inactive users do not duplicate delivery");
        equal(List.of(1, 1), List.of(reads[0], reads[1]), "publish notification performs one membership and one user query");
        sent.clear();
        config.setRecipientType("DEPT");
        config.setRecipientIds(List.of(30L, 20L));
        service.sendDeployNotification(50L, List.of(config));
        equal(List.of(12L, 11L), recipientIds(sent), "department delivery preserves configured department order");
        equal(List.of(1, 2), List.of(reads[0], reads[1]), "department publication queries its users only once");
        sent.clear();
        record.setTenantId(200L);
        rejects(() -> service.sendDeployNotification(50L, List.of(config)), "cross tenant publication is blocked");
        equal(List.of(), sent, "cross tenant rejection sends nothing");

        SysRole role = new SysRole();
        role.setRoleId(1L);
        SysRoleMapper roles = proxy(SysRoleMapper.class, (target, method, values) -> { tenantQuery(values[0]); return role; });
        SysDeptMapper departments = proxy(SysDeptMapper.class, (target, method, values) -> { throw new AssertionError("role notification should not query departments"); });
        NotificationNodeHandler nodeHandler = new NotificationNodeHandler(sender, roles, memberships, users, departments);
        WfNodeConfig node = new WfNodeConfig();
        node.setId("notice");
        node.setTitle("节点通知");
        node.setProps(Map.of("recipientType", "ROLE", "recipientValue", "reviewer"));
        WfProcessInstance instance = new WfProcessInstance();
        instance.setTenantId(100L);
        equal(true, nodeHandler.handle(node, instance, Map.of()), "role notification node continues after send");
        equal(List.of(11L, 12L), recipientIds(sent), "notification node deduplicates and filters active recipients");
        equal(List.of(2, 3), List.of(reads[0], reads[1]), "role node performs one membership and one active user query");
    }

    private static void deployReadViews() throws Exception {
        DeployEnhancementServiceImpl service = new DeployEnhancementServiceImpl();
        WfProcessDefinition definition = definition("definition-1", 100L);
        int[] reads = new int[4];
        inject(service, "processDefinitionMapper", proxy(WfProcessDefinitionMapper.class, (target, method, values) -> {
            if (method.getName().equals("selectById")) { reads[0]++; return definition; }
            equal("selectMaps", method.getName(), "versions use count and maximum aggregate");
            QueryWrapper<?> query = (QueryWrapper<?>) values[0];
            tenantQuery(query);
            equal(true, query.getSqlSelect().contains("MAX(version)") && !query.getSqlSelect().contains("model_json"), "version aggregate avoids loading models");
            reads[1]++;
            return List.of(Map.of("snapshotCount", 4L, "latestVersion", 6));
        }));
        inject(service, "deployRecordMapper", proxy(WfDeployRecordMapper.class, (target, method, values) -> {
            equal("selectMaps", method.getName(), "deployment statistics use one aggregate");
            QueryWrapper<?> query = (QueryWrapper<?>) values[0];
            tenantQuery(query);
            equal(true, query.getSqlSelect().contains("COUNT(rollback_time)"), "rollback count uses actual rollback events");
            reads[2]++;
            return List.of(Map.of("totalDeploys", 5L, "successCount", 4L, "rollbackCount", 1L));
        }));
        WfDeployRollbackHistory history = new WfDeployRollbackHistory();
        history.setId(70L);
        history.setRollbackByName("当时操作人");
        inject(service, "rollbackHistoryMapper", proxy(WfDeployRollbackHistoryMapper.class, (target, method, values) -> {
            equal("listByProcessDefinition", method.getName(), "history is fetched by one joined query");
            equal(List.of("definition-1", 100L), List.of(values), "history query carries both definition and tenant");
            reads[3]++;
            return List.of(history);
        }));
        equal(Map.of("totalDeploys", 5L, "successCount", 4L, "rollbackCount", 1L, "snapshotCount", 4L, "latestVersion", 6),
                service.getDeployStatistics("definition-1").getData().values(), "published statistics preserve all result fields");
        equal(List.of(1, 1, 1, 0), counts(reads), "statistics need one definition and two aggregates");
        equal("当时操作人", service.listRollbackHistory("definition-1").getData().get(0).getRollbackByName(), "history preserves operation-time name");
        equal(List.of(2, 1, 1, 1), counts(reads), "rollback history needs one definition and one joined query");
        definition.setTenantId(200L);
        rejects(() -> service.getDeployStatistics("definition-1"), "foreign statistics are denied");
        rejects(() -> service.listRollbackHistory("definition-1"), "foreign history is denied");
        equal(List.of(4, 1, 1, 1), counts(reads), "foreign requests stop before aggregates or history lookup");
        MybatisConfiguration configuration = new MybatisConfiguration();
        String resource = "mapper/workflow/WfDeployRollbackHistoryMapper.xml";
        try (InputStream input = WorkflowBatchReadChecks.class.getClassLoader().getResourceAsStream(resource)) {
            if (input == null) throw new AssertionError("Missing Mapper resource: " + resource);
            new XMLMapperBuilder(input, configuration, resource, configuration.getSqlFragments()).parse();
        }
        BoundSql sql = configuration.getMappedStatement(WfDeployRollbackHistoryMapper.class.getName() + ".listByProcessDefinition")
                .getBoundSql(Map.of("definitionId", "definition-1", "tenantId", 100L));
        equal(true, CCJSqlParserUtil.parse(sql.getSql()) != null, "history joined SQL binds and parses");
        equal(List.of("definitionId", "tenantId", "tenantId"), sql.getParameterMappings().stream().map(mapping -> mapping.getProperty()).toList(), "both joined tables retain explicit tenant binding");
        equal(true, sql.getSql().contains("deployment.tenant_id = history.tenant_id"), "join itself enforces matching tenants");
        equal(true, sql.getSql().contains("ORDER BY history.rollback_time DESC, history.id DESC"), "history sorting remains deterministic at equal times");
    }

    private static WfProcessDefinition definition(String id, Long tenantId) {
        WfProcessDefinition definition = new WfProcessDefinition();
        definition.setDefinitionId(id);
        definition.setProcessKey(id);
        definition.setProcessName(id);
        definition.setTenantId(tenantId);
        definition.setCreateBy("10");
        return definition;
    }

    private static SysUser user(Long userId, Long deptId) {
        SysUser user = new SysUser();
        user.setUserId(userId);
        user.setDeptId(deptId);
        user.setTenantId(100L);
        user.setUserName("user-" + userId);
        return user;
    }

    private static SysUserRole member(Long roleId, Long userId) {
        SysUserRole member = new SysUserRole();
        member.setRoleId(roleId);
        member.setUserId(userId);
        member.setTenantId(100L);
        return member;
    }

    private static List<Long> recipientIds(List<MessageSendRequest> sent) {
        return sent.stream().map(message -> message.getReceivers().get(0).getReceiverId()).toList();
    }

    private static List<Integer> counts(int[] values) {
        return java.util.Arrays.stream(values).boxed().toList();
    }

    private static void tenantQuery(Object value) {
        AbstractWrapper<?, ?, ?> query = (AbstractWrapper<?, ?, ?>) value;
        equal(true, query.getSqlSegment().contains("tenant_id") && query.getParamNameValuePairs().containsValue(100L), "query includes actual current tenant");
    }

    private static void inject(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static <T> T proxy(Class<T> type, InvocationHandler handler) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler));
    }

    private static void equal(Object expected, Object actual, String message) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(message + ": expected=" + expected + ", actual=" + actual);
        checks++;
    }

    private static void rejects(Runnable action, String message) {
        try { action.run(); } catch (WorkflowException rejected) { checks++; return; }
        throw new AssertionError(message);
    }
}
