import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.ProcessStartResult;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.dto.VersionComparisonDTO;
import com.cloudflow.workflow.domain.system.SysDept;
import com.cloudflow.workflow.domain.system.SysRole;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.domain.vo.WorkflowUrgeTiming;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfGatewayActivationMapper;
import com.cloudflow.workflow.mapper.WfNodeRecordMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.mapper.WfUrgeEffectMapper;
import com.cloudflow.workflow.mapper.system.SysDeptMapper;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.cloudflow.workflow.service.WorkflowGatewayService;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.cloudflow.workflow.service.WorkflowStartPermissions;
import com.cloudflow.workflow.service.WorkflowTriggerSecrets;
import com.cloudflow.workflow.service.impl.VersionComparisonServiceImpl;
import com.cloudflow.workflow.service.impl.WfInstanceServiceImpl;
import com.cloudflow.workflow.strategy.impl.DeptManagerAssignStrategy;
import com.cloudflow.workflow.strategy.AssigneeResolutionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.BoundSql;

/** 真实服务方法；人员和库表输入受控，不启动服务或连接数据库。 */
public final class WorkflowQualityChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        for (Class<?> entity : List.of(SysUserRole.class, SysRole.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "quality-check"), entity);
        }
        UserContext.setTenantId(100L);
        UserContext.setUserId(10L);
        TenantContext.setTenantId(100L);
        try {
            startResult();
            permissionProtocol();
            permissionRequestReuse();
            departmentLeaders();
            versionTitles();
            traceUrgeTimings();
            mapperSql();
            System.out.println("PASS: Workflow quality checks=" + checks + "; actual_database=false");
        } finally {
            UserContext.clear();
            TenantContext.clear();
        }
    }

    private static void startResult() {
        ProcessStartResult result = new ProcessStartResult("instance-1", "WF-20261103-00001");
        equal("instance-1", result.requireInstanceId(), "typed startup retains the instance identity");
        Set<String> fields = new HashSet<>();
        new ObjectMapper().valueToTree(result).fieldNames().forEachRemaining(fields::add);
        equal(Set.of("instanceId", "processNo"), fields, "startup transport has one instance identity");
        equal("a".repeat(64), new ProcessStartResult("a".repeat(64), null).requireInstanceId(), "internal bind does not require a process number");
        equal(" original ", new ProcessStartResult(" original ", null).requireInstanceId(), "valid response identity is never rewritten");
        rejects(IllegalStateException.class, () -> new ProcessStartResult(null, null).requireInstanceId(), "missing instance identity rejected");
        for (String invalid : List.of("", "  ", "a".repeat(65), "abc\n", "abc\u007f")) {
            rejects(IllegalStateException.class, () -> new ProcessStartResult(invalid, "number").requireInstanceId(), "invalid instance identity rejected");
        }
    }

    private static void permissionProtocol() {
        equal(Set.of(9007199254740993L, Long.MAX_VALUE), WorkflowStartPermissions.identifiers("[\"9007199254740993\",\"9223372036854775807\"]"), "permission IDs retain full integer precision");
        for (String invalid : List.of("[1]", "[\"manager\"]", "[\"01\"]", "[\"-1\"]", "[null]", "[\"1\",\"1\"]", "[\"9223372036854775808\"]", "{}", "[\"1\"] []", "1,2")) {
            rejects(WorkflowException.class, () -> WorkflowStartPermissions.identifiers(invalid), "ambiguous or invalid permission identity rejected");
        }
        WfProcessDefinition definition = new WfProcessDefinition();
        rejects(WorkflowException.class, () -> WorkflowStartPermissions.validate(definition), "permission type must be explicit");
        definition.setStartPermissionType("ALL");
        WorkflowStartPermissions.validate(definition);
        equal("", definition.getStartPermissionValue(), "public permission stores an empty target value");
        definition.setStartPermissionValue("[\"1\"]");
        rejects(WorkflowException.class, () -> WorkflowStartPermissions.validate(definition), "public permission cannot hide restricted targets");
        definition.setStartPermissionType("ROLE");
        WorkflowStartPermissions.validate(definition);
        definition.setStartPermissionValue("[]");
        rejects(WorkflowException.class, () -> WorkflowStartPermissions.validate(definition), "restricted permission requires a target");
    }

    private static void permissionRequestReuse() throws Exception {
        WorkflowPermissionService service = new WorkflowPermissionService();
        SysUser user = user(10L, 100L, 11L);
        SysRole role = new SysRole();
        role.setRoleId(21L);
        List<SysRole> roles = new ArrayList<>(List.of(role));
        int[] reads = {0, 0, 0};
        inject(service, "sysUserMapper", proxy(SysUserMapper.class, (target, method, arguments) -> { reads[0]++; return user; }));
        inject(service, "sysUserRoleMapper", proxy(SysUserRoleMapper.class, (target, method, arguments) -> {
            reads[1]++;
            tenantQuery(arguments[0]);
            SysUserRole relation = new SysUserRole();
            relation.setRoleId(21L);
            return List.of(relation);
        }));
        inject(service, "sysRoleMapper", proxy(SysRoleMapper.class, (target, method, arguments) -> {
            reads[2]++;
            tenantQuery(arguments[0]);
            return List.copyOf(roles);
        }));
        WorkflowPermissionService.StartPermissionCheck first = service.startPermissionCheck(10L);
        for (int index = 0; index < 4; index++) {
            equal(true, first.allows("DEPT", "[\"11\"]"), "request sees the department");
            equal(true, first.allows("ROLE", "[\"21\"]"), "request sees the role");
        }
        equal(List.of(1, 1, 1), List.of(reads[0], reads[1], reads[2]), "catalog identity facts read once per request");
        user.setDeptId(12L);
        roles.clear();
        WorkflowPermissionService.StartPermissionCheck next = service.startPermissionCheck(10L);
        equal(false, next.allows("DEPT", "[\"11\"]"), "next request sees department changes");
        equal(false, next.allows("ROLE", "[\"21\"]"), "next request sees role removal");
        equal(List.of(2, 2, 2), List.of(reads[0], reads[1], reads[2]), "new request reloads identity facts");
        user.setTenantId(200L);
        equal(false, service.canStartProcess(10L, "DEPT", "[\"12\"]"), "foreign department membership cannot authorize launch");
        equal(false, service.canStartProcess(null, "ALL", ""), "missing user cannot launch");
        equal(false, service.canStartProcess(10L, "USER", "[10]"), "invalid stored protocol denies launch");
    }

    private static void tenantQuery(Object value) {
        LambdaQueryWrapper<?> query = (LambdaQueryWrapper<?>) value;
        equal(true, query.getSqlSegment().contains("tenant_id") && query.getParamNameValuePairs().containsValue(100L), "identity query carries the exact tenant");
    }

    private static void departmentLeaders() throws Exception {
        SysUser starter = user(10L, 100L, 11L);
        SysUser inactive = user(20L, 100L, 12L);
        inactive.setStatus("1");
        SysUser parentLeader = user(30L, 100L, 13L);
        SysDept own = department(11L, 12L, null);
        SysDept middle = department(12L, 13L, 20L);
        SysDept top = department(13L, 0L, 30L);
        Map<Long, SysDept> departments = Map.of(11L, own, 12L, middle, 13L, top);
        Map<Long, SysUser> users = Map.of(10L, starter, 20L, inactive, 30L, parentLeader);
        int[] reads = {0};
        DeptManagerAssignStrategy strategy = new DeptManagerAssignStrategy();
        inject(strategy, "sysDeptMapper", proxy(SysDeptMapper.class, (target, method, arguments) -> { reads[0]++; return departments.get(arguments[0]); }));
        inject(strategy, "sysUserMapper", proxy(SysUserMapper.class, (target, method, arguments) -> {
            equal("selectById", method.getName(), "leader selection never scans arbitrary managers");
            return users.get(arguments[0]);
        }));
        WfProcessInstance instance = new WfProcessInstance();
        instance.setTenantId(100L);
        instance.setStartUserId(10L);
        WfNodeConfig node = new WfNodeConfig();
        equal(30L, strategy.resolve(node, instance), "missing and inactive leaders advance to valid parent");
        inactive.setStatus("0");
        inactive.setTenantId(200L);
        equal(30L, strategy.resolve(node, instance), "foreign leader cannot claim the department");
        middle.setStatus("1");
        equal(30L, strategy.resolve(node, instance), "inactive department is skipped while following its parent");
        parentLeader.setDeleted(1);
        rejects(AssigneeResolutionException.class, () -> strategy.resolve(node, instance), "no effective leader blocks launch");
        top.setParentId(11L);
        int beforeCycle = reads[0];
        rejects(AssigneeResolutionException.class, () -> strategy.resolve(node, instance), "department cycle terminates with an explicit error");
        equal(3, reads[0] - beforeCycle, "cyclic chain reads each department once");
        parentLeader.setDeleted(0);
        middle.setTenantId(200L);
        rejects(AssigneeResolutionException.class, () -> strategy.resolve(node, instance), "department chain cannot cross tenants");
        starter.setStatus("1");
        int beforeInactive = reads[0];
        rejects(AssigneeResolutionException.class, () -> strategy.resolve(node, instance), "inactive starter cannot launch");
        equal(beforeInactive, reads[0], "inactive starter is rejected before reading department chain");
    }

    private static void versionTitles() throws Exception {
        ObjectMapper json = new ObjectMapper();
        VersionComparisonServiceImpl service = new VersionComparisonServiceImpl();
        inject(service, "objectMapper", json);
        inject(service, "triggerSecrets", new WorkflowTriggerSecrets("", json));
        VersionComparisonDTO result = service.compareDefinitions(
                "{\"nodes\":[{\"id\":\"same\",\"type\":\"APPROVAL\",\"title\":\"旧标题\",\"name\":\"错误别名\"},{\"id\":\"removed\",\"title\":\"删除标题\"}],\"edges\":[]}",
                "{\"nodes\":[{\"id\":\"same\",\"type\":\"APPROVAL\",\"title\":\"新标题\",\"name\":\"错误别名\"},{\"id\":\"added\",\"title\":\"新增标题\"}],\"edges\":[]}");
        equal("新标题", result.getModifiedNodes().get(0).getNodeName(), "modified node uses the current title");
        equal("新增标题", result.getAddedNodes().get(0).getNodeName(), "added node uses title");
        equal("删除标题", result.getRemovedNodes().get(0).getNodeName(), "removed node uses its historical title");
    }

    private static void traceUrgeTimings() throws Exception {
        WfInstanceServiceImpl service = new WfInstanceServiceImpl();
        WfProcessInstance instance = new WfProcessInstance();
        instance.setTenantId(100L); instance.setInstanceId("instance"); instance.setDefinitionId("definition"); instance.setStatus("RUNNING");
        WfProcessDefinition definition = new WfProcessDefinition(); definition.setTenantId(100L);
        List<WfTaskHistory> histories = new ArrayList<>();
        for (String id : List.of("reminded", "not-reminded")) {
            WfTaskHistory history = new WfTaskHistory();
            history.setHistoryId(id); history.setTaskId(id); history.setNodeKey(id); history.setAction("APPROVE"); history.setOperatorId(10L);
            history.setCreateTime(LocalDateTime.of(2026, 11, 3, 9, 0));
            histories.add(history);
        }
        boolean[] allowed = {true};
        int[] timingReads = {0};
        inject(service, "processInstanceMapper", proxy(WfProcessInstanceMapper.class, (target, method, arguments) -> instance));
        inject(service, "processDefinitionMapper", proxy(WfProcessDefinitionMapper.class, (target, method, arguments) -> definition));
        inject(service, "permissionService", new WorkflowPermissionService() {
            @Override public void checkViewInstancePermission(WfProcessInstance current) { if (!allowed[0]) throw new PermissionDeniedException("denied"); }
        });
        inject(service, "taskHistoryMapper", proxy(WfTaskHistoryMapper.class, (target, method, arguments) -> histories));
        inject(service, "taskMapper", proxy(WfTaskMapper.class, (target, method, arguments) -> List.of()));
        inject(service, "nodeRecordMapper", proxy(WfNodeRecordMapper.class, (target, method, arguments) -> List.of()));
        inject(service, "gateways", new WorkflowGatewayService(proxy(WfGatewayActivationMapper.class, (target, method, arguments) -> List.of()), null, new ObjectMapper(), null));
        inject(service, "urgeEffectMapper", proxy(WfUrgeEffectMapper.class, (target, method, arguments) -> {
            timingReads[0]++;
            equal(100L, arguments[0], "timing read uses the authorized instance tenant");
            equal(List.of("reminded", "not-reminded"), arguments[1], "timing read batches all history identities");
            WorkflowUrgeTiming timing = new WorkflowUrgeTiming(); timing.setHistoryId("reminded");
            timing.setUrgeTime(histories.get(0).getCreateTime()); timing.setElapsedSeconds(0L);
            return List.of(timing);
        }));
        JsonNode detail = new ObjectMapper().findAndRegisterModules().valueToTree(service.getProcessTrace("instance")).get("historyDetails");
        equal(0L, detail.get(0).get("urgeElapsedSeconds").asLong(), "zero-second completion is preserved in transport");
        equal(true, detail.get(0).hasNonNull("lastUrgeTime"), "trace includes the real reminder time");
        equal(false, detail.get(1).has("urgeElapsedSeconds"), "task without reminder has no fabricated timing");
        equal(1, timingReads[0], "one batch read enriches the trace");
        allowed[0] = false;
        rejects(PermissionDeniedException.class, () -> service.getProcessTrace("instance"), "unauthorized trace is rejected");
        equal(1, timingReads[0], "unauthorized trace cannot read reminder timings");
        allowed[0] = true; histories.clear();
        service.getProcessTrace("instance");
        equal(1, timingReads[0], "empty history skips the timing query");
    }

    private static void mapperSql() throws Exception {
        MybatisConfiguration configuration = new MybatisConfiguration();
        for (String mapper : List.of("WfUrgeEffectMapper", "WfTaskUrgeMapper")) {
            String resource = "mapper/workflow/" + mapper + ".xml";
            try (InputStream stream = WorkflowQualityChecks.class.getClassLoader().getResourceAsStream(resource)) {
                if (stream == null) throw new AssertionError("Mapper resource missing: " + resource);
                new XMLMapperBuilder(stream, configuration, resource, configuration.getSqlFragments()).parse();
            }
        }
        WfTaskHistory history = new WfTaskHistory(); history.setHistoryId("completed"); history.setTenantId(100L);
        Map<String, Map<String, Object>> inputs = Map.of(
                "WfUrgeEffectMapper.recordCompletion", Map.of("history", history),
                "WfUrgeEffectMapper.selectTimings", Map.of("tenantId", 100L, "historyIds", List.of("completed")),
                "WfTaskUrgeMapper.recordReminder", Map.of("tenantId", 100L, "taskId", "task", "recipientId", 10L, "sourceKey", "stable-reminder", "reason", "到期提醒"));
        for (Map.Entry<String, Map<String, Object>> input : inputs.entrySet()) {
            BoundSql sql = configuration.getMappedStatement("com.cloudflow.workflow.mapper." + input.getKey()).getBoundSql(input.getValue());
            equal(true, CCJSqlParserUtil.parse(sql.getSql()) != null, "bound reminder SQL parses using the production SQL parser");
        }
    }

    private static SysUser user(Long id, Long tenant, Long department) {
        SysUser result = new SysUser(); result.setUserId(id); result.setTenantId(tenant); result.setDeptId(department); result.setStatus("0"); result.setDeleted(0); return result;
    }

    private static SysDept department(Long id, Long parent, Long leader) {
        SysDept result = new SysDept(); result.setDeptId(id); result.setParentId(parent); result.setLeaderUserId(leader); result.setTenantId(100L); result.setStatus("0"); result.setDeleted(0); return result;
    }

    private static void inject(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name); field.setAccessible(true); field.set(target, value);
    }

    private static <T> T proxy(Class<T> type, InvocationHandler handler) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler));
    }

    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + ", actual=" + actual);
        checks++;
    }

    private static void rejects(Class<? extends RuntimeException> type, Runnable action, String label) {
        try { action.run(); }
        catch (RuntimeException failure) { if (!type.isInstance(failure)) throw failure; checks++; return; }
        throw new AssertionError(label);
    }
}
