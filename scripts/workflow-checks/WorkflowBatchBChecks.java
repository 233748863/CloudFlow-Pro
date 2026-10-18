import com.baomidou.mybatisplus.core.conditions.AbstractWrapper;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.workflow.config.properties.WorkflowProperties;
import com.cloudflow.workflow.domain.WfCallbackDeadLetter;
import com.cloudflow.workflow.domain.WfCountersignTask;
import com.cloudflow.workflow.domain.WfCountersignVote;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.WfTransactionMessage;
import com.cloudflow.workflow.domain.enums.WfTaskType;
import com.cloudflow.workflow.handler.impl.ScriptNodeHandler;
import com.cloudflow.workflow.handler.impl.TimerNodeHandler;
import com.cloudflow.workflow.job.TaskTimeoutJob;
import com.cloudflow.workflow.job.TimerScanJob;
import com.cloudflow.workflow.service.CountersignWeightService;
import com.cloudflow.workflow.service.HttpClientService;
import com.cloudflow.workflow.service.INodeExecutionService;
import com.cloudflow.workflow.service.ScriptExecutionPolicy;
import com.cloudflow.workflow.service.ScriptExecutionService;
import com.cloudflow.workflow.service.TaskSemanticContext;
import com.cloudflow.workflow.service.TimerSchedulerService;
import com.cloudflow.workflow.service.WorkflowTriggerExecutor;
import com.cloudflow.workflow.service.WorkflowTriggerSecrets;
import com.cloudflow.workflow.service.WorkflowTriggerService;
import com.cloudflow.workflow.service.impl.CountersignServiceImpl;
import com.cloudflow.workflow.service.impl.WfDefinitionServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTaskCandidate;
import com.cloudflow.workflow.domain.system.SysDept;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.mapper.WfTaskCandidateMapper;
import com.cloudflow.workflow.mapper.system.SysDeptMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.service.InitiatorSelectionService;
import com.cloudflow.workflow.service.WorkflowRejectPolicy;
import com.cloudflow.workflow.service.WorkflowNodePolicy;
import com.cloudflow.workflow.service.SelfApprovalPolicy;
import com.cloudflow.workflow.service.WorkflowCompletionContext;
import com.cloudflow.workflow.service.WorkflowProcessStateService;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.ProcessMonitorMapper;
import com.cloudflow.workflow.model.WorkflowRuntimeGraph;
import com.cloudflow.workflow.strategy.AssignUserStrategy;
import com.cloudflow.workflow.strategy.AssignUserStrategyFactory;
import com.cloudflow.workflow.strategy.impl.*;

import com.sun.net.httpserver.HttpServer;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.HashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BiFunction;

import java.util.Map;
import java.util.Objects;
import org.redisson.api.RLock;
import org.springframework.transaction.PlatformTransactionManager;

public final class WorkflowBatchBChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        checkTaskSemantics();
        checkAssignments();
        checkVariableUserCollections();
        checkRejectPolicies();
        checkNodePolicies();
        checkProcessStates();
        checkWeights();
        checkTimers();
        checkTriggers();
        checks += WorkflowBatchBConfigChecks.run();
        checks += WorkflowMonitorMappingChecks.run();
        checks += WorkflowGatewayModelChecks.run();
        checks += WorkflowNodeEventOrderingChecks.run();
        System.out.println("PASS: " + checks + " workflow batch B checks");
    }

    private static void checkVariableUserCollections() {
        VariableUserAssignStrategy strategy = new VariableUserAssignStrategy(new ObjectMapper());
        WfNodeConfig node = new WfNodeConfig(); node.setApproverType("VARIABLE_USER"); node.setApproverValue("approverIds");
        WfProcessInstance instance = new WfProcessInstance();
        instance.setVariables("{\"approverIds\":12}"); equal(12L, strategy.resolve(node, instance), "scalar variable approval remains supported");
        instance.setVariables("{\"approverIds\":\"13\"}"); equal(List.of(13L), strategy.resolveMultiple(node, instance), "string variable approval remains supported");
        instance.setVariables("{\"approverIds\":[12,\"13\",12]}"); equal(List.of(12L, 13L), strategy.resolveMultiple(node, instance), "project managers deduplicated without dropping reviewers");
        rejects(() -> strategy.resolve(node, instance), "multiple reviewers require countersign instead of first-user approval");
        for (String invalid : List.of("[12,\"invalid\"]", "[12,0]", "[12,-1]", "[12,1.5]", "[12,null]", "[12,9223372036854775808]")) {
            instance.setVariables("{\"approverIds\":" + invalid + "}"); rejects(() -> strategy.resolveMultiple(node, instance), "invalid reviewer fails entire approval list");
        }
        instance.setVariables("{}"); equal(List.of(), strategy.resolveMultiple(node, instance), "missing variable has no fallback reviewer");
    }

    private static void checkTaskSemantics() throws Exception {
        equal(18, WfTaskType.values().length, "task type count");
        ObjectMapper mapper = new ObjectMapper();
        for (WfTaskType taskType : WfTaskType.values()) {
            WfTask task = new WfTask();
            task.setTaskType(taskType.name());
            equal(taskType.name(), mapper.readTree(mapper.writeValueAsString(task)).get("taskType").asText(),
                    "task serialization " + taskType);
            WfTaskHistory history = new WfTaskHistory();
            history.setTaskType(taskType.name());
            equal(taskType.name(), mapper.readTree(mapper.writeValueAsString(history)).get("taskType").asText(),
                    "history serialization " + taskType);
        }
        equal("APPROVAL", new WfTask().getTaskType(), "legacy task default");
        equal("APPROVAL", new WfTaskHistory().getTaskType(), "legacy history default");
        equal("CC", WfTaskType.forNode("COPY", null), "copy semantics");
        equal("MANUAL", WfTaskType.forNode("MANUAL", null), "manual semantics");
        for (Map.Entry<String, String> sign : Map.of("ALL", "COUNTERSIGN", "ANY", "OR_SIGN",
                "PERCENT", "PERCENT_SIGN", "SEQUENTIAL", "SEQUENTIAL_SIGN", "WEIGHT", "WEIGHT_SIGN").entrySet()) {
            equal(sign.getValue(), WfTaskType.forSignType(sign.getKey()), "sign semantics " + sign.getKey());
        }
        equal("AUTO_PASS", WfTaskType.forAction("APPROVE", "AUTO_PASS"), "automatic pass");
        equal("AUTO_REJECT", WfTaskType.forAction("REJECT", "AUTO_REJECT"), "automatic reject");
        WfNodeConfig legacyNode = mapper.readValue("{\"id\":\"approval\",\"type\":\"APPROVAL\"}", WfNodeConfig.class);
        equal("APPROVAL", WfTaskType.forNode(legacyNode), "legacy node semantics");
        TaskSemanticContext.withType("REJECT_JUMP", () -> {
            equal("REJECT_JUMP", TaskSemanticContext.resolve("APPROVAL"), "scoped task type");
            try {
                TaskSemanticContext.withType("AUTO_SKIP", () -> {
                    equal("AUTO_SKIP", TaskSemanticContext.resolve("APPROVAL"), "nested task type");
                    throw new IllegalStateException("expected");
                });
            } catch (IllegalStateException expected) {
                equal("REJECT_JUMP", TaskSemanticContext.resolve("APPROVAL"), "nested cleanup");
            }
        });
        equal("APPROVAL", TaskSemanticContext.resolve("APPROVAL"), "thread scope cleanup");
    }

    private static void checkAssignments() throws Exception {
        List<AssignUserStrategy> legacyStrategies = List.of(new UserAssignStrategy(), new UsersAssignStrategy(),
                new RoleAssignStrategy(), new DeptAssignStrategy(), new DeptManagerAssignStrategy(),
                new InitiatorAssignStrategy(), new VariableUserAssignStrategy(new ObjectMapper()));
        AssignUserStrategyFactory factory = new AssignUserStrategyFactory();
        inject(factory, "strategies", legacyStrategies);
        for (String source : List.of("USER", "USERS", "USER_LIST", "ROLE", "DEPT", "DEPT_MANAGER",
                "DIRECT_LEADER", "INITIATOR", "VARIABLE_USER")) {
            equal(true, factory.getStrategy(source) != null, "legacy source registered " + source);
        }
        Map<Long, SysUser> users = new HashMap<>();
        for (long identifier : List.of(1L, 2L, 3L)) {
            SysUser user = new SysUser();
            user.setUserId(identifier);
            user.setTenantId(100000L);
            user.setStatus("0");
            user.setDeptId(10L);
            users.put(identifier, user);
        }
        SysUserMapper userMapper = proxy(SysUserMapper.class, (method, arguments) -> users.get(arguments[0]));
        Map<Long, SysDept> departments = new HashMap<>();
        for (long identifier : List.of(10L, 20L)) {
            SysDept dept = new SysDept();
            dept.setDeptId(identifier);
            dept.setTenantId(100000L);
            dept.setParentId(identifier == 10 ? 20L : 0L);
            dept.setLeader(identifier == 10 ? "2" : "3");
            departments.put(identifier, dept);
        }
        DeptManagerAssignStrategy deptStrategy = new DeptManagerAssignStrategy();
        inject(deptStrategy, "sysUserMapper", userMapper);
        MultiLevelManagerAssignStrategy strategy = new MultiLevelManagerAssignStrategy(userMapper,
                proxy(SysDeptMapper.class, (method, arguments) -> departments.get(arguments[0])), deptStrategy);
        WfProcessInstance instance = new WfProcessInstance();
        instance.setInstanceId("instance");
        instance.setTenantId(100000L);
        instance.setStartUserId(1L);
        WfNodeConfig node = new WfNodeConfig();
        node.setApproverType("MULTI_LEVEL_MANAGER");
        equal(2L, strategy.resolve(node, instance), "default direct manager");
        node.setDirectorLevel(2);
        equal(3L, strategy.resolve(node, instance), "second manager");
        node.setDirectorLevel(3);
        equal(3L, strategy.resolve(node, instance), "highest fallback");
        node.setDirectorFallback("SKIP");
        equal(null, strategy.resolve(node, instance), "skip fallback");
        node.setDirectorFallback("FAIL");
        inject(factory, "strategies", List.of(strategy));
        rejects(() -> factory.resolve(node, instance), "factory propagates explicit failure");
        departments.get(20L).setParentId(10L);
        node.setDirectorFallback("TOP_LEVEL");
        equal(3L, strategy.resolve(node, instance), "department cycle bounded");
        node.setDirectorLevel(11);
        rejects(() -> strategy.resolve(node, instance), "manager depth limit");

        WorkflowGraphModelResolver resolver = new WorkflowGraphModelResolver();
        String model = """
                {"nodes":[{"id":"start","type":"START"},{"id":"approval","type":"APPROVAL",
                "approverType":"INITIATOR_SELECTED","selectableScope":{"deptIds":[10]}},
                {"id":"end","type":"END"}],"edges":[{"source":"start","target":"approval"},
                {"source":"approval","target":"end"}]}
                """;
        List<WfTaskCandidate> saved = new ArrayList<>();
        WfTaskCandidateMapper candidates = proxy(WfTaskCandidateMapper.class, (method, arguments) -> {
            if ("insert".equals(method)) {
                saved.add((WfTaskCandidate) arguments[0]);
                return 1;
            }
            return saved;
        });
        InitiatorSelectionService selectionService = new InitiatorSelectionService(candidates, userMapper,
                proxy(SysUserRoleMapper.class, (method, arguments) -> 0L), resolver);
        rejects(() -> selectionService.saveSelections(instance, model, null), "missing selected approver");
        rejects(() -> selectionService.saveSelections(instance, model, Map.of("approval", List.of(1L, 2L))), "single selection limit");
        rejects(() -> selectionService.saveSelections(instance, model, Map.of("approval", List.of(1L), "end", List.of(2L))), "unknown selected node");
        equal(0, saved.size(), "selection validation before insertion");
        selectionService.saveSelections(instance, model, Map.of("approval", List.of(2L)));
        equal(null, saved.get(0).getTaskId(), "snapshot is not claimable task");
        equal("approval", saved.get(0).getNodeKey(), "snapshot node association");
        equal("INITIATOR_SELECTED", saved.get(0).getSource(), "snapshot source");
        equal(List.of(2L), new InitiatorSelectedAssignStrategy(candidates).resolveMultiple(
                resolver.parseRuntimeGraph(model).getNode("approval"), instance), "selected approver readback");
        users.get(3L).setTenantId(200000L);
        rejects(() -> selectionService.saveSelections(instance, model, Map.of("approval", List.of(3L))), "cross tenant selection");
        users.get(2L).setDeptId(20L);
        rejects(() -> selectionService.saveSelections(instance, model, Map.of("approval", List.of(2L))), "department selection scope");
    }

    private static void checkRejectPolicies() {
        WfNodeConfig node = new WfNodeConfig();
        equal(null, WorkflowRejectPolicy.resolve(null, node), "legacy rejection routing retained");
        equal("TO_INITIATOR", WorkflowRejectPolicy.resolve(null, node, null), "unspecified rejection returns to initiator");
        equal("TO_INITIATOR", WorkflowRejectPolicy.resolve(null, node, "  "), "blank rejection target uses initiator default");
        equal("TO_INITIATOR", WorkflowRejectPolicy.resolve(null, null, null), "missing node configuration uses initiator default");
        equal(null, WorkflowRejectPolicy.resolve(null, node, "previous"), "explicit legacy rejection target retains old routing");
        equal(5, WorkflowRejectPolicy.STRATEGIES.size(), "rejection strategy count");
        for (String strategy : WorkflowRejectPolicy.STRATEGIES) {
            node.setRejectStrategy(strategy);
            equal(strategy, WorkflowRejectPolicy.resolve(null, node), "configured rejection " + strategy);
            equal(strategy, WorkflowRejectPolicy.resolve(null, node, null), "configured rejection overrides initiator default " + strategy);
        }
        equal("TERMINATE", WorkflowRejectPolicy.resolve("TERMINATE", node), "request rejection override");
        equal("TERMINATE", WorkflowRejectPolicy.resolve("TERMINATE", node, null), "explicit request overrides configured rejection and default");
        rejects(() -> WorkflowRejectPolicy.resolve("UNKNOWN", node, null), "unknown rejection never falls back to initiator");
        rejects(() -> WorkflowRejectPolicy.resolve("UNKNOWN", node), "unknown rejection strategy");
        WorkflowGraphModelResolver resolver = new WorkflowGraphModelResolver();
        String model = """
                {"nodes":[{"id":"start","type":"START"},{"id":"first","type":"APPROVAL"},
                {"id":"second","type":"APPROVAL","rejectStrategy":"TO_SPECIFIED_NODE","rejectToNodeKey":"first"},
                {"id":"end","type":"END"}],"edges":[{"source":"start","target":"first"},
                {"source":"first","target":"second"},{"source":"second","target":"end"}]}
                """;
        WorkflowRuntimeGraph graph = resolver.parseRuntimeGraph(model);
        WorkflowRejectPolicy.assertUpstream(graph, "second", "first");
        equal("TO_SPECIFIED_NODE", graph.getNode("second").getRejectStrategy(), "rejection config retained in runtime graph");
        rejects(() -> WorkflowRejectPolicy.assertUpstream(graph, "second", "second"), "reject current node");
        rejects(() -> WorkflowRejectPolicy.assertUpstream(graph, "second", "end"), "reject downstream node");
        rejects(() -> WorkflowRejectPolicy.assertUpstream(graph, "second", "missing"), "reject missing node");
        rejects(() -> resolver.parseRuntimeGraph(model.replace("\"rejectToNodeKey\":\"first\"", "\"rejectToNodeKey\":\"end\"")),
                "invalid rejection rejected at definition parsing");
        WorkflowRuntimeGraph branches = new WorkflowRuntimeGraph("start", "first", Map.of("start", node,
                "first", node, "second", node), Map.of(), Map.of("first", List.of(
                new WorkflowRuntimeGraph.EdgeLink("first-edge", "start", "first", null, false)), "second", List.of(
                new WorkflowRuntimeGraph.EdgeLink("second-edge", "start", "second", null, false))));
        rejects(() -> WorkflowRejectPolicy.assertUpstream(branches, "first", "second"), "reject sibling branch");
    }

    private static void checkNodePolicies() throws Exception {
        WfNodeConfig legacy = new WfNodeConfig();
        for (String action : List.of("allowAddSign", "allowReduceSign", "allowDelegate", "allowUrge",
                "allowRollback", "allowCc", "allowSelection")) {
            equal(true, WorkflowNodePolicy.allows(null, action), "missing node allows " + action);
            equal(true, WorkflowNodePolicy.allows(legacy, action), "legacy node allows " + action);
            Field field = WfNodeConfig.class.getDeclaredField(action);
            field.setAccessible(true);
            field.set(legacy, false);
            rejects(() -> WorkflowNodePolicy.assertAllowed(legacy, action), "explicit false rejects " + action);
            field.set(legacy, true);
            equal(true, WorkflowNodePolicy.allows(legacy, action), "explicit true allows " + action);
        }
        equal("AUTO_PASS", WorkflowNodePolicy.timeoutAction(new WfNodeConfig()), "legacy timeout pass");
        legacy.setSlaAction("AUTO_REJECT");
        equal("AUTO_REJECT", WorkflowNodePolicy.timeoutAction(legacy), "configured timeout reject");
        legacy.setSlaAction("INVALID");
        rejects(() -> WorkflowNodePolicy.timeoutAction(legacy), "unknown timeout action");
        WfProcessInstance instance = new WfProcessInstance();
        instance.setStartUserId(1L);
        SelfApprovalPolicy policy = new SelfApprovalPolicy(new DeptManagerAssignStrategy() {
            @Override
            public Long resolve(WfNodeConfig node, WfProcessInstance process) {
                return 2L;
            }
        });
        WfNodeConfig node = new WfNodeConfig();
        equal(1L, policy.resolve(1L, node, instance).assignee(), "legacy self approval");
        node.setApproveSelf("AUTO_SKIP");
        equal(true, policy.resolve(1L, node, instance).skipped(), "self skip");
        equal(3L, policy.resolve(3L, node, instance).assignee(), "other approver untouched");
        for (String selfPolicy : List.of("TO_DIRECT_LEADER", "TO_DEPT_MANAGER")) {
            node.setApproveSelf(selfPolicy);
            equal(2L, policy.resolve(1L, node, instance).assignee(), "self redirection " + selfPolicy);
        }
        SelfApprovalPolicy cyclic = new SelfApprovalPolicy(new DeptManagerAssignStrategy() {
            @Override
            public Long resolve(WfNodeConfig config, WfProcessInstance process) {
                return 1L;
            }
        });
        equal(1L, cyclic.resolve(1L, node, instance).assignee(), "self redirection loop fallback");
        equal("APPROVE_SELF_REDIRECT_FAILED_DEGRADE_TO_ALLOW", cyclic.resolve(1L, node, instance).note(), "self fallback audit");
        equal("AUTO_REJECT", TaskSemanticContext.callWithType("AUTO_REJECT",
                () -> TaskSemanticContext.resolve("REJECT_JUMP")), "automatic rejection preserves source semantics");
        equal("APPROVAL", TaskSemanticContext.resolve("APPROVAL"), "automatic rejection scope cleanup");
    }

    private static void checkProcessStates() {
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(
                new org.apache.ibatis.builder.MapperBuilderAssistant(new com.baomidou.mybatisplus.core.MybatisConfiguration(), "checks"),
                com.cloudflow.workflow.domain.monitor.ProcessMonitor.class);
        equal(14, WfProcessStatus.values().length, "process state count");
        equal(6, WfTaskStatus.values().length, "task states remain unchanged");
        equal("COMPLETED", WfTaskStatus.COMPLETED.getCode(), "task completion is not process completion");
        for (WfProcessStatus source : WfProcessStatus.values()) {
            equal(true, source.canTransitionTo(source), "idempotent process state " + source);
            for (WfProcessStatus target : WfProcessStatus.values()) {
                if (source.isTerminal() && target != source) {
                    equal(false, source.canTransitionTo(target), "terminal state immutable " + source + " to " + target);
                }
            }
        }
        equal(true, WfProcessStatus.isActive("WITHDRAWN"), "withdrawal waits for approval");
        equal(true, WfProcessStatus.isActive("TASK_BACK"), "backward rejection waits for approval");
        equal(true, WfProcessStatus.isSuccess("AUTO_PASSED"), "automatic success group");
        rejects(() -> WfProcessStatus.fromCode("COMPLETED"), "old process state is not accepted");
        List<String> updates = new ArrayList<>();
        WorkflowProcessStateService service = new WorkflowProcessStateService(
                proxy(WfProcessInstanceMapper.class, (method, arguments) -> {
                    updates.add(((WfProcessInstance) arguments[0]).getStatus());
                    return 1;
                }), proxy(ProcessMonitorMapper.class, (method, arguments) -> 1),
                new com.cloudflow.workflow.service.TimerSchedulerService(null, null, null, null) {
                    @Override
                    public void cancelAfterCommit(String instanceId) {
                    }
                }, proxy(com.cloudflow.workflow.mapper.WfGatewayActivationMapper.class, (method, arguments) -> 0),
                new com.cloudflow.workflow.service.WorkflowTerminalTaskService(
                        proxy(WfProcessInstanceMapper.class, (method, arguments) -> new WfProcessInstance()),
                        proxy(com.cloudflow.workflow.mapper.WfTaskMapper.class, (method, arguments) -> List.of()),
                        proxy(com.cloudflow.workflow.mapper.WfTaskAddSignMapper.class, (method, arguments) -> List.of()),
                        null, null, null, null, null, null), new com.cloudflow.workflow.service.WorkflowMeetingLifecyclePublisher(null, new ObjectMapper()), new com.cloudflow.workflow.service.WorkflowSettlementLifecyclePublisher(null, new ObjectMapper()));
        WfProcessInstance instance = new WfProcessInstance();
        instance.setStatus("RUNNING");
        instance.setInstanceId("state-check");
        instance.setTenantId(100000L);
        for (WfProcessStatus target : List.of(WfProcessStatus.TASK_BACK, WfProcessStatus.RESTARTED,
                WfProcessStatus.RUNNING, WfProcessStatus.PAUSED, WfProcessStatus.RUNNING,
                WfProcessStatus.WITHDRAWN, WfProcessStatus.RUNNING, WfProcessStatus.AUTO_PASSED)) {
            service.transition(instance, target);
            equal(target.getCode(), instance.getStatus(), "process action state " + target);
            equal(target.isTerminal(), instance.getEndTime() != null, "terminal time " + target);
        }
        equal(8, updates.size(), "process state writes");
        rejects(() -> service.transition(instance, WfProcessStatus.RUNNING), "service rejects terminal resurrection");
        equal(true, WorkflowCompletionContext.automatically(WorkflowCompletionContext::isAutomatic), "automatic completion context");
        equal("APPROVAL", WorkflowCompletionContext.automatically(() -> TaskSemanticContext.resolve("APPROVAL")),
                "automatic completion does not relabel next manual task");
        equal(false, WorkflowCompletionContext.isAutomatic(), "automatic context cleanup");
    }

    private static void checkWeights() throws Exception {
        WfProcessInstance instance = new WfProcessInstance();
        instance.setInstanceId("weighted-instance");
        instance.setTenantId(100000L);
        WfNodeConfig node = new WfNodeConfig();
        node.setId("weighted-approval");
        node.setSignType("WEIGHT");
        node.setPassWeight(new java.math.BigDecimal("5.00"));
        node.setWeightSource("BY_CONFIG");
        node.setAssigneeWeights(List.of(Map.of("userId", 1L, "weight", "3.00"),
                Map.of("userId", 2L, "weight", "2.00"), Map.of("userId", 3L, "weight", "0.00")));
        List<com.cloudflow.workflow.domain.monitor.AnomalyAlert> alerts = new ArrayList<>();
        CountersignWeightService weightService = new com.cloudflow.workflow.service.CountersignWeightService(
                proxy(com.cloudflow.workflow.service.remote.RemoteHrApprovalService.class, (method, arguments) -> {
                    throw new IllegalStateException("HR unavailable");
                }), proxy(com.cloudflow.workflow.mapper.AnomalyAlertMapper.class, (method, arguments) -> {
                    alerts.add((com.cloudflow.workflow.domain.monitor.AnomalyAlert) arguments[0]);
                    return 1;
                }), proxy(com.cloudflow.workflow.service.monitor.IAnomalyDetectionService.class, (method, arguments) -> null));
        Map<Long, BigDecimal> resolved = weightService.resolve(node, instance, List.of(1L, 2L, 3L));
        equal(new java.math.BigDecimal("5.00"), com.cloudflow.workflow.service.CountersignWeightService.total(
                resolved, node.getPassWeight()), "decimal total and zero-weight participant");
        rejects(() -> com.cloudflow.workflow.service.CountersignWeightService.total(
                Map.of(1L, java.math.BigDecimal.ZERO), node.getPassWeight()), "zero total rejected");
        rejects(() -> com.cloudflow.workflow.service.CountersignWeightService.total(
                Map.of(1L, java.math.BigDecimal.ONE), node.getPassWeight()), "unreachable threshold rejected");
        for (String invalid : List.of("-1", "10000", "0.001")) {
            node.setAssigneeWeights(List.of(Map.of("userId", 1L, "weight", invalid)));
            rejects(() -> com.cloudflow.workflow.service.CountersignWeightService.validate(node), "invalid weight " + invalid);
        }
        node.setAssigneeWeights(List.of(Map.of("userId", 1L, "weight", "1"), Map.of("userId", 1L, "weight", "2")));
        rejects(() -> com.cloudflow.workflow.service.CountersignWeightService.validate(node), "duplicate weight configuration");
        node.setWeightSource("BY_JOB_LEVEL");
        node.setAssigneeWeights(List.of(Map.of("jobLevelId", 9L, "weight", "3")));
        equal(Map.of(1L, java.math.BigDecimal.ONE), weightService.resolve(node, instance, List.of(1L)), "HR fallback equal weight");
        equal(1, alerts.size(), "HR fallback persisted warning");
        equal(100000L, alerts.get(0).getTenantId(), "HR fallback tenant isolation");
        CountersignWeightService availableHr = new com.cloudflow.workflow.service.CountersignWeightService(
                proxy(com.cloudflow.workflow.service.remote.RemoteHrApprovalService.class, (method, arguments) ->
                        com.cloudflow.common.core.domain.R.ok(List.of(Map.of("tenantId", 100000L, "userId", 1L, "jobLevelId", 9L)))),
                null, null);
        equal(new java.math.BigDecimal("3.00"), availableHr.resolve(node, instance, List.of(1L)).get(1L), "HR level maps to configured weight");

        CountersignServiceImpl countersignService = new com.cloudflow.workflow.service.impl.CountersignServiceImpl();
        Method evaluate = countersignService.getClass().getDeclaredMethod("evaluateCountersignResult",
                com.cloudflow.workflow.domain.WfCountersignTask.class);
        evaluate.setAccessible(true);
        WfCountersignTask countersign = new com.cloudflow.workflow.domain.WfCountersignTask();
        countersign.setTotalCount(3);
        countersign.setVotedCount(1);
        countersign.setApproveCount(1);
        countersign.setRejectCount(0);
        countersign.setPassPercent(50);
        for (Map.Entry<String, String> legacy : Map.of("ALL", "VOTING", "ANY", "PASSED", "PERCENT", "VOTING", "SEQUENTIAL", "VOTING").entrySet()) {
            countersign.setSignType(legacy.getKey());
            equal(legacy.getValue(), evaluate.invoke(countersignService, countersign), "legacy countersign " + legacy.getKey());
        }
        countersign.setSignType("WEIGHT");
        countersign.setPassWeight(new java.math.BigDecimal("5.00"));
        countersign.setTotalWeight(new java.math.BigDecimal("6.00"));
        countersign.setApproveWeight(new java.math.BigDecimal("3.00"));
        countersign.setRejectWeight(java.math.BigDecimal.ZERO);
        equal("VOTING", evaluate.invoke(countersignService, countersign), "weight awaiting threshold");
        countersign.setApproveWeight(new java.math.BigDecimal("5.00"));
        equal("PASSED", evaluate.invoke(countersignService, countersign), "three plus two passes");
        countersign.setApproveWeight(java.math.BigDecimal.ZERO);
        countersign.setRejectWeight(new java.math.BigDecimal("1.00"));
        equal("VOTING", evaluate.invoke(countersignService, countersign), "rejection boundary remains reachable");
        countersign.setRejectWeight(new java.math.BigDecimal("1.01"));
        equal("REJECTED", evaluate.invoke(countersignService, countersign), "rejection just above boundary");

        node.setWeightSource("BY_CONFIG");
        node.setAssigneeWeights(List.of(Map.of("userId", 1L, "weight", "3.00"),
                Map.of("userId", 2L, "weight", "2.00"), Map.of("userId", 3L, "weight", "0.00")));
        checkWeightSnapshots(countersignService, weightService, node, instance);
    }

    private static void checkWeightSnapshots(com.cloudflow.workflow.service.impl.CountersignServiceImpl service,
            com.cloudflow.workflow.service.CountersignWeightService weights, WfNodeConfig node,
            WfProcessInstance instance) throws Exception {
        for (Class<?> entity : List.of(com.cloudflow.workflow.domain.WfCountersignVote.class, WfTask.class)) {
            com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(new org.apache.ibatis.builder.MapperBuilderAssistant(
                    new com.baomidou.mybatisplus.core.MybatisConfiguration(), "weight-checks"), entity);
        }
        Map<String, WfTask> tasks = new HashMap<>();
        Map<String, com.cloudflow.workflow.domain.WfCountersignVote> votes = new HashMap<>();
        inject(service, "agents", taskAgents(tasks));
        inject(service, "permissionService", new com.cloudflow.workflow.service.WorkflowPermissionService());
        com.cloudflow.common.core.context.UserContext.setTenantId(instance.getTenantId());
        com.cloudflow.common.core.context.UserContext.setUserId(1L);
        Map<String, com.cloudflow.workflow.domain.WfCountersignTask> countersigns = new HashMap<>();
        List<WfTaskHistory> histories = new ArrayList<>();
        inject(service, "weightService", weights);
        WfProcessInstanceMapper instances = proxy(WfProcessInstanceMapper.class, (method, arguments) -> instance);
        inject(service, "processInstanceMapper", instances);
        inject(service, "hParticipantPolicy", new com.cloudflow.workflow.service.WorkflowHParticipantPolicy(
                instances, null, null, null, null, null, null));
        inject(service, "sysUserMapper", proxy(SysUserMapper.class, (method, arguments) -> null));
        inject(service, "processMonitorService", proxy(com.cloudflow.workflow.service.monitor.IProcessMonitorService.class,
                (method, arguments) -> null));
        inject(service, "taskMonitorMapper", proxy(com.cloudflow.workflow.mapper.TaskMonitorMapper.class,
                (method, arguments) -> method.startsWith("select") ? null : 1));
        inject(service, "nodeRecordMapper", proxy(com.cloudflow.workflow.mapper.WfNodeRecordMapper.class, (method, arguments) -> 1));
        inject(service, "taskHistoryMapper", proxy(com.cloudflow.workflow.mapper.WfTaskHistoryMapper.class, (method, arguments) -> {
            histories.add((WfTaskHistory) arguments[0]);
            return 1;
        }));
        inject(service, "taskReminderJob", new com.cloudflow.workflow.job.TaskReminderJob() {
            @Override
            public void cancelReminders(String taskId) {
            }
        });
        inject(service, "workflowProperties", new com.cloudflow.workflow.config.properties.WorkflowProperties());
        RLock lock = proxy(org.redisson.api.RLock.class, (method, arguments) -> method.equals("unlock") ? null : true);
        org.redisson.api.RedissonClient lockClient = proxy(org.redisson.api.RedissonClient.class, (method, arguments) -> lock);
        inject(service, "redissonClient", lockClient);
        inject(service, "businessLocks", com.cloudflow.workflow.service.WorkflowBusinessLockFixture.create(lockClient));
        inject(service, "countersignTaskMapper", proxy(com.cloudflow.workflow.mapper.WfCountersignTaskMapper.class,
                (method, arguments) -> {
                    if (method.equals("selectById")) return countersigns.get(arguments[0]);
                    if (method.equals("selectForUpdate")) return countersigns.get(arguments[1]);
                    WfCountersignTask record = (com.cloudflow.workflow.domain.WfCountersignTask) arguments[0];
                    countersigns.put(record.getCountersignId(), record);
                    return 1;
                }));
        inject(service, "taskMapper", proxy(com.cloudflow.workflow.mapper.WfTaskMapper.class, (method, arguments) -> {
            if (method.equals("selectById")) return tasks.get(arguments[0]);
            if (method.equals("selectList")) return new ArrayList<>(tasks.values());
            if (method.equals("deleteById")) return tasks.remove(arguments[0]) == null ? 0 : 1;
            WfTask record = (WfTask) arguments[0];
            tasks.put(record.getTaskId(), record);
            return 1;
        }));
        inject(service, "countersignVoteMapper", proxy(com.cloudflow.workflow.mapper.WfCountersignVoteMapper.class,
                (method, arguments) -> {
                    if (method.equals("insert")) {
                        WfCountersignVote vote = (com.cloudflow.workflow.domain.WfCountersignVote) arguments[0];
                        votes.put(vote.getVoteId(), vote);
                        return 1;
                    }
                    if (method.equals("update") && arguments[0] != null) {
                        WfCountersignVote vote = (com.cloudflow.workflow.domain.WfCountersignVote) arguments[0];
                        votes.put(vote.getVoteId(), vote);
                        return 1;
                    }
                    AbstractWrapper<?, ?, ? extends AbstractWrapper<?, ?, ?>> wrapper = (com.baomidou.mybatisplus.core.conditions.AbstractWrapper<?, ?, ?>)
                            arguments[method.equals("update") ? 1 : 0];
                    wrapper.getSqlSegment();
                    Collection<Object> parameters = wrapper.getParamNameValuePairs().values();
                    if (method.equals("selectCount")) {
                        return votes.values().stream().filter(vote -> parameters.contains(vote.getVoterId())
                                && List.of("APPROVE", "REJECT").contains(vote.getVoteResult())).count();
                    }
                    if (method.equals("selectOne")) {
                        WfCountersignVote found = votes.values().stream().filter(vote -> parameters.contains(vote.getTaskId())
                                && "PENDING".equals(vote.getVoteResult())).findFirst().orElse(null);
                        if (found == null) return null;
                        WfCountersignVote copy = new com.cloudflow.workflow.domain.WfCountersignVote();
                        org.springframework.beans.BeanUtils.copyProperties(found, copy);
                        return copy;
                    }
                    return 1;
                }));
        String countersignId = service.createCountersignTask(instance.getInstanceId(), node.getId(), "票签", "WEIGHT", null,
                List.of(1L, 2L, 3L), node);
        equal(3, votes.size(), "weights snapshotted at task creation");
        equal(true, votes.values().stream().allMatch(vote -> "PENDING".equals(vote.getVoteResult()) && vote.getVoteTime() == null),
                "snapshots are not votes");
        equal(false, service.hasUserVoted(countersignId, 1L), "pending snapshot not counted as vote");
        node.setAssigneeWeights(List.of(Map.of("userId", 1L, "weight", "999.00")));
        WfTask first = tasks.values().stream().filter(task -> task.getAssignee().equals(1L)).findFirst().orElseThrow();
        equal("VOTING", service.vote(first.getTaskId(), 1L, "一", "APPROVE", "同意"), "first fixed-weight vote");
        equal(new java.math.BigDecimal("3.00"), countersigns.get(countersignId).getApproveWeight(), "configuration changes do not alter snapshot");
        equal(true, service.hasUserVoted(countersignId, 1L), "real vote counted");
        WfTask second = tasks.values().stream().filter(task -> task.getAssignee().equals(2L)).findFirst().orElseThrow();
        com.cloudflow.common.core.context.UserContext.setUserId(2L);
        equal("PASSED", service.vote(second.getTaskId(), 2L, "二", "APPROVE", "同意"), "weighted early completion");
        equal(0, tasks.size(), "remaining tasks cleaned atomically");
        equal(1, histories.size(), "unvoted task has automatic history");
        equal("AUTO_PASS", histories.get(0).getTaskType(), "early completion semantics");
        com.cloudflow.common.core.context.UserContext.clear();
    }

    private static void checkTimers() throws Exception {
        LocalDateTime friday = java.time.LocalDateTime.of(2026, 9, 4, 9, 30);
        HolidayCalendarService calendar = proxy(com.cloudflow.common.holiday.api.HolidayCalendarService.class, (method, arguments) -> {
            if (method.equals("resolveCalendarId")) return 7L;
            java.time.LocalDate cursor = (java.time.LocalDate) arguments[1];
            int remaining = (Integer) arguments[2];
            while (remaining > 0) {
                cursor = cursor.plusDays(1);
                if (cursor.getDayOfWeek().getValue() < 6 && !cursor.equals(java.time.LocalDate.of(2026, 9, 7))) remaining--;
            }
            return cursor;
        });
        TimerNodeHandler handler = new com.cloudflow.workflow.handler.impl.TimerNodeHandler(null, calendar, null, null);
        WfProcessInstance instance = new WfProcessInstance();
        instance.setInstanceId("timer-check");
        long expectedHour = friday.plusHours(1).atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
        equal(expectedHour, handler.calculateExpiry(Map.of("delayMinutes", 60), instance, Map.of(), friday), "legacy minute delay");
        equal(expectedHour, handler.calculateExpiry(Map.of("delayMinutes", "60"), instance, Map.of(), friday), "legacy textual delay");
        equal(expectedHour, handler.calculateExpiry(Map.of("delayValue", 1, "delayUnit", "HOUR"), instance, Map.of(), friday), "new hour delay");
        equal(null, handler.calculateExpiry(Map.of("delayMinutes", 0), instance, Map.of(), friday), "legacy zero delay bypass");
        equal(null, handler.calculateExpiry(Map.of("timerType", "SCHEDULE", "scheduleTime", "invalid"), instance, Map.of(), friday), "legacy malformed schedule bypass");
        equal(expectedHour, handler.calculateExpiry(Map.of("timerType", "SCHEDULE", "scheduleTime", "2026-09-04 10:30:00"),
                instance, Map.of(), friday), "legacy scheduled time");
        equal(java.time.LocalDateTime.of(2026, 9, 8, 9, 30).atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli(),
                handler.calculateExpiry(Map.of("delayValue", 1, "delayUnit", "WORKDAY", "calendarId", 7), instance, Map.of(), friday),
                "workday delay crosses weekend and holiday");
        equal(expectedHour, handler.calculateExpiry(Map.of("timerType", "FIXED_TIME", "fixedTime", "${appointment}",
                        "allowedVariables", List.of("appointment")), instance, Map.of("appointment", "2026-09-04T10:30:00"), friday),
                "fixed-time safe substitution");
        equal(expectedHour, handler.calculateExpiry(Map.of("timerType", "CRON_ONCE", "cronExpression", "0 30 10 * * *"),
                instance, Map.of(), friday), "cron triggers once");
        rejects(() -> com.cloudflow.workflow.service.WorkflowVariableSubstitution.replace("${other}", Map.of("other", 1),
                List.of("appointment")), "unlisted substitution rejected");
        rejects(() -> com.cloudflow.workflow.service.WorkflowVariableSubstitution.replace("${T(java.lang.Runtime)}", Map.of(), null),
                "substitution never evaluates expressions");
        rejects(() -> com.cloudflow.workflow.service.WorkflowVariableSubstitution.replace("${_internal}", Map.of("_internal", 1), null),
                "internal variables excluded by default");
        WfNodeConfig timer = new WfNodeConfig();
        timer.setId("timer");
        timer.setType("TIMER");
        equal(true, handler.handle(timer, instance, Map.of()), "legacy unconfigured timer bypass");
        timer.setProps(Map.of("delayValue", 1));
        for (Object skip : List.of(true, 1, "true", "1")) {
            equal(true, handler.handle(timer, instance, Map.of("_skipTimers", skip)), "legacy skip flag " + skip);
        }
        timer.setProps(Map.of("timerAction", "UNKNOWN"));
        rejects(() -> com.cloudflow.workflow.handler.impl.TimerNodeHandler.validate(timer), "unknown timer action rejected");
        timer.setProps(Map.of("delayValue", -1));
        rejects(() -> com.cloudflow.workflow.handler.impl.TimerNodeHandler.validate(timer), "negative timer delay rejected");

        WorkflowBatchBChecks.MemoryRedis redis = new MemoryRedis();
        com.cloudflow.workflow.service.WorkflowWaitState.Pending pending = com.cloudflow.workflow.service.WorkflowWaitState.register(
                instance, Map.of(), "generation-1", "TIMER", "timer", Map.of("expireAt", 1L));
        String key = com.cloudflow.workflow.service.TimerSchedulerService.timerKey(instance.getInstanceId(), pending);
        Map<String, Object> timerData = new java.util.HashMap<>();
        timerData.put("instanceId", instance.getInstanceId());
        timerData.put("nodeKey", "timer");
        timerData.put("waitId", pending.waitId());
        timerData.put("executionContext", pending.executionContext());
        redis.values.put(key, timerData);
        redis.scores.put(key, 1.0);
        TimerScanJob scan = new com.cloudflow.workflow.job.TimerScanJob();
        inject(scan, "redisCache", redis);
        inject(scan, "processInstanceMapper", proxy(WfProcessInstanceMapper.class, (method, arguments) -> instance));
        Method expire = scan.getClass().getDeclaredMethod("handleExpiredTimer", String.class);
        expire.setAccessible(true);
        TaskTimeoutJob timeout = new com.cloudflow.workflow.job.TaskTimeoutJob();
        inject(timeout, "processInstanceMapper", proxy(WfProcessInstanceMapper.class, (method, arguments) -> instance));
        Method timeoutHandle = timeout.getClass().getDeclaredMethod("doHandleTimeoutTask", WfTask.class);
        timeoutHandle.setAccessible(true);
        WfTask task = new WfTask();
        task.setInstanceId(instance.getInstanceId());
        for (String state : List.of("PAUSED", "FAILED")) {
            instance.setStatus(state);
            equal("RETRY_SCHEDULED", expire.invoke(scan, key).toString(), "timer retained for " + state);
            equal("DEFERRED", timeoutHandle.invoke(timeout, task).toString(), "SLA retained without consuming retries for " + state);
        }
        instance.setStatus("CANCELLED");
        equal("STALE", expire.invoke(scan, key).toString(), "terminal timer no longer fires");
        TimerSchedulerService scheduler = new com.cloudflow.workflow.service.TimerSchedulerService(redis, null, null, null);
        com.cloudflow.workflow.service.WorkflowWaitState.Pending older = new com.cloudflow.workflow.service.WorkflowWaitState.Pending(
                "older-generation", "TIMER", "timer", pending.executionContext(), Map.of("expireAt", 1L));
        scheduler.completeAfterCommit(instance.getInstanceId(), older);
        equal(true, redis.scores.containsKey(key), "old callback cannot delete new timer generation");
        scheduler.completeAfterCommit(instance.getInstanceId(), pending);
        equal(false, redis.scores.containsKey(key), "notification-only timer leaves scan queue");
        equal(true, com.cloudflow.workflow.service.WorkflowWaitState.find(instance, pending.waitId()) != null,
                "notification-only durable wait remains for manual finish");
        equal(false, redis.values.containsKey(key), "completed timer payload cleaned");
        redis.scores.put("sys:wf:timer:timer-check-2:timer", 1.0);
        redis.scores.put(key, 1.0);
        scheduler.cancelTimersForInstance(instance.getInstanceId());
        equal(true, redis.scores.containsKey("sys:wf:timer:timer-check-2:timer"), "instance prefix collision preserved");
        equal(false, redis.scores.containsKey(key), "terminated instance timer removed");
    }

    private static void checkTriggers() throws Exception {
        AtomicReference<String> allowlist = new java.util.concurrent.atomic.AtomicReference<>("");
        com.cloudflow.common.redis.core.SysConfigHelper configuration = new com.cloudflow.common.redis.core.SysConfigHelper() {
            @Override
            public String getConfigValue(String key, String fallback) { return allowlist.get(); }
        };
        HttpClientService http = new com.cloudflow.workflow.service.HttpClientService(configuration);
        try {
            rejects(() -> http.assertUrlAllowed("https://8.8.8.8/path"), "empty whitelist rejects public targets too");
            allowlist.set("8.8.8.8");
            http.assertUrlAllowed("https://8.8.8.8/path");
            checks++;
            for (String forbidden : List.of("http://127.0.0.1", "http://10.0.0.1", "http://172.16.0.1", "http://172.31.255.255",
                    "http://192.168.1.1", "http://[::1]", "http://[fd00::1]", "http://[fc00::1]", "http://127.1", "http://2130706433",
                    "file:///etc/passwd", "gopher://127.0.0.1", "http://user:password@8.8.8.8", "http://8.8.8.8:0")) {
                rejects(() -> http.assertUrlAllowed(forbidden), "SSRF blocks " + forbidden);
            }
            allowlist.set("0.0.0.0/0,::/0,metadata.google.internal");
            for (String metadata : List.of("http://169.254.169.254", "http://169.254.170.2", "http://100.100.100.200",
                    "http://metadata.google.internal", "http://[fd00:ec2::254]", "http://[::ffff:169.254.169.254]", "http://[fe80::1]")) {
                rejects(() -> http.assertUrlAllowed(metadata), "metadata forbidden even when whitelisted " + metadata);
            }
            allowlist.set("10.2.0.0/16,fd00::/8,127.0.0.1");
            for (String internal : List.of("http://10.2.3.4:8080", "http://[fd00::123]", "http://127.0.0.1")) {
                http.assertUrlAllowed(internal);
                checks++;
            }
            rejects(() -> http.assertUrlAllowed("http://10.3.0.1"), "CIDR boundary enforced");
            allowlist.set("8.8.8.8");
            com.cloudflow.workflow.service.HttpClientService mixed = new com.cloudflow.workflow.service.HttpClientService(configuration) {
                @Override
                protected java.net.InetAddress[] resolveAddresses(String host) throws java.net.UnknownHostException {
                    return new java.net.InetAddress[]{java.net.InetAddress.getByName("8.8.8.8"), java.net.InetAddress.getByName("127.0.0.1")};
                }
            };
            try { rejects(() -> mixed.assertUrlAllowed("http://mixed.example"), "all resolved addresses must be allowed"); }
            finally { mixed.close(); }
            allowlist.set("127.0.0.1");
            HttpServer server = com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
            AtomicInteger targetRequests = new java.util.concurrent.atomic.AtomicInteger();
            server.createContext("/redirect", exchange -> {
                exchange.getResponseHeaders().set("Location", "/target");
                exchange.sendResponseHeaders(302, -1);
                exchange.close();
            });
            server.createContext("/target", exchange -> {
                targetRequests.incrementAndGet();
                exchange.sendResponseHeaders(200, -1);
                exchange.close();
            });
            server.createContext("/slow", exchange -> {
                try { Thread.sleep(1500); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
                try { exchange.sendResponseHeaders(200, -1); } finally { exchange.close(); }
            });
            server.start();
            try {
                String base = "http://127.0.0.1:" + server.getAddress().getPort();
                equal(302, http.executeRequest(base + "/redirect", "GET", Map.of(), null).getStatusCode(), "redirect returned without following");
                equal(0, targetRequests.get(), "redirect target never contacted");
                java.lang.reflect.Method transport = HttpClientService.class.getDeclaredMethod("send", String.class, String.class,
                        Map.class, Map.class, long.class, java.util.concurrent.atomic.AtomicReference.class, java.util.concurrent.atomic.AtomicBoolean.class);
                transport.setAccessible(true);
                java.util.concurrent.atomic.AtomicBoolean uncancelled = new java.util.concurrent.atomic.AtomicBoolean(false);
                HttpClientService.ApiResponse transportTimeout = (HttpClientService.ApiResponse) transport.invoke(http, base + "/slow",
                        "GET", Map.of(), null, 250L, new java.util.concurrent.atomic.AtomicReference<org.apache.hc.client5.http.classic.methods.HttpUriRequestBase>(), uncancelled);
                equal(504, transportTimeout.getStatusCode(), "transport timeout before outer cancellation stays a timeout");
                equal(false, uncancelled.get(), "transport timeout does not depend on outer deadline cancellation");
                long started = System.nanoTime();
                equal(504, http.executeRequest(base + "/slow", "GET", Map.of(), null, 250L).getStatusCode(), "HTTP total timeout enforced");
                equal(true, java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 1200, "timeout does not wait for slow server");
            } finally { server.stop(0); }
        } finally { http.close(); }

        ObjectMapper mapper = new ObjectMapper();
        WorkflowTriggerSecrets secrets = new com.cloudflow.workflow.service.WorkflowTriggerSecrets("0123456789abcdef0123456789abcdef", mapper);
        String model = "{\"nodes\":[{\"id\":\"http\",\"type\":\"SCRIPT\",\"props\":{\"actionHeaders\":{\"Authorization\":\"Bearer private-1234\",\"Content-Type\":\"application/json\"}}}]}";
        String protectedModel = secrets.protectModel(model, null);
        equal(false, protectedModel.contains("private-1234"), "header secret not stored in plaintext");
        equal(true, protectedModel.contains("action_headers_cipher"), "header uses cipher storage key");
        String visible = secrets.maskModel(protectedModel);
        equal(false, visible.contains("action_headers_cipher"), "cipher is not returned to designer");
        equal(true, visible.contains("****1234"), "only last four secret characters returned");
        String savedAgain = secrets.protectModel(visible, protectedModel);
        Map<String, Object> props = mapper.convertValue(mapper.readTree(savedAgain).path("nodes").get(0).path("props"),
                new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
        equal("Bearer private-1234", secrets.headers(props, "actionHeaders").get("Authorization"), "unchanged mask preserves secret");
        rejects(() -> secrets.protectModel(visible, null), "mask without stored original rejected");
        String encrypted = secrets.seal("private-request");
        equal("private-request", secrets.open(encrypted), "encrypted replay request roundtrip");
        byte[] altered = java.util.Base64.getDecoder().decode(encrypted);
        altered[13] ^= 1;
        rejects(() -> secrets.open(java.util.Base64.getEncoder().encodeToString(altered)), "cipher tampering rejected");
        rejects(() -> new com.cloudflow.workflow.service.WorkflowTriggerSecrets("", mapper).seal("secret"), "missing key fails closed");
        String legacyModel = mapper.writeValueAsString(Map.of("nodes", List.of(Map.of("id", "legacy", "type", "SCRIPT",
                "props", Map.of("scriptType", "API", "apiHeaders", mapper.writeValueAsString(Map.of(
                        "Authorization", "Bearer legacy&<>\"1234", "X-Trace", "keep"))))), "edges", List.of()));
        String protectedLegacy = secrets.protectModel(legacyModel, null);
        equal(false, protectedLegacy.contains("legacy&"), "JSON-string API headers encrypted before storage");
        Map<String, Object> legacyProps = mapper.convertValue(mapper.readTree(protectedLegacy).path("nodes").get(0).path("props"), Map.class);
        equal("Bearer legacy&<>\"1234", secrets.headers(legacyProps, "apiHeaders").get("Authorization"), "JSON-string header credential roundtrip");
        String legacyVisible = secrets.maskModel(protectedLegacy);
        equal(false, legacyVisible.contains("api_headers_cipher"), "legacy header cipher never returned");
        String legacyResaved = secrets.protectModel(legacyVisible, protectedLegacy);
        Map<String, Object> legacyResavedProps = mapper.convertValue(mapper.readTree(legacyResaved).path("nodes").get(0).path("props"), Map.class);
        equal("Bearer legacy&<>\"1234", secrets.headers(legacyResavedProps, "apiHeaders").get("Authorization"), "masked legacy header survives resave");
        checkTriggerFailureStrategies(secrets, mapper);
        checkTriggerExecutionPaths(secrets, mapper);
    }

    private static void checkTriggerExecutionPaths(com.cloudflow.workflow.service.WorkflowTriggerSecrets secrets, ObjectMapper mapper) throws Exception {
        WfDefinitionServiceImpl definitions = new com.cloudflow.workflow.service.impl.WfDefinitionServiceImpl();
        inject(definitions, "securityUtils", new com.cloudflow.workflow.security.WorkflowSecurityUtils());
        Method sanitize = definitions.getClass().getDeclaredMethod("sanitizeModelJson", String.class);
        sanitize.setAccessible(true);
        String credential = "Bearer keep-&<>\"";
        String rawModel = mapper.writeValueAsString(Map.of("nodes", List.of(Map.of("id", "http", "type", "SCRIPT", "props",
                Map.of("actionHeaders", Map.of("Authorization", credential), "actionBody", "{\"text\":\"${value} & literal&amp;\"}",
                        "actionUrl", "https://api.example/check?first=1&second=2")))));
        String stored = (String) sanitize.invoke(definitions, secrets.protectModel(rawModel, null));
        Map<String, Object> props = mapper.convertValue(mapper.readTree(stored).path("nodes").get(0).path("props"),
                new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
        equal(credential, secrets.headers(props, "actionHeaders").get("Authorization"), "XSS filter cannot rewrite encrypted secret");
        String saved = (String) sanitize.invoke(definitions, secrets.protectModel(secrets.maskModel(stored), stored));
        Map<String, Object> savedProps = mapper.convertValue(mapper.readTree(saved).path("nodes").get(0).path("props"),
                new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
        equal(credential, secrets.headers(savedProps, "actionHeaders").get("Authorization"), "escaped secret suffix survives masked edit");
        equal(props.get("actionUrl"), savedProps.get("actionUrl"), "editing does not double encode action URL");
        equal(props.get("actionBody"), savedProps.get("actionBody"), "editing does not double encode action JSON");
        List<Map<String, Object>> calls = new ArrayList<>();
        AtomicInteger responseStatus = new java.util.concurrent.atomic.AtomicInteger(200);
        com.cloudflow.workflow.service.HttpClientService http = new com.cloudflow.workflow.service.HttpClientService(null) {
            @Override
            public ApiResponse executeRequest(String url, String method, Map<String, String> headers, Map<String, Object> body, long timeout) {
                calls.add(Map.of("url", url, "headers", new HashMap<>(headers), "body", body == null ? Map.of() : body));
                return new ApiResponse(responseStatus.get(), "{}", responseStatus.get() == 200);
            }
        };
        Long previousTenant = com.cloudflow.common.tenant.TenantContext.getTenantId();
        try {
            com.cloudflow.common.tenant.TenantContext.setTenantId(100000L);
            WfProcessInstance instance = new WfProcessInstance();
            instance.setInstanceId("async-check"); instance.setTenantId(100000L); instance.setDefinitionId("definition");
            instance.setStatus("RUNNING"); instance.setStartUserId(1L);
            WfNodeConfig node = new WfNodeConfig(); node.setId("http"); node.setType("SCRIPT"); node.setProps(props);
            List<com.cloudflow.common.message.api.MessageSendRequest> sent = new ArrayList<>();
            WorkflowTriggerExecutor execution = new com.cloudflow.workflow.service.WorkflowTriggerExecutor(http, secrets, sent::add,
                    proxy(SysUserMapper.class, (method, arguments) -> {
                        SysUser user = new SysUser(); user.setUserId((Long) arguments[0]);
                        user.setTenantId(Long.valueOf(2).equals(arguments[0]) ? 200000L : 100000L); user.setStatus("0"); return user;
                    }), mapper);
            Map<String, Object> request = execution.prepare(node, instance, Map.of("value", "kept"));
            equal("https://api.example/check?first=1&second=2", request.get("url"), "saved URL entity decoded before request");
            equal("kept & literal&amp;", ((Map<?, ?>) request.get("body")).get("text"), "saved JSON decoded once before substitution");
            execution.execute(request, "stable-id", 1000);
            equal("stable-id", ((Map<?, ?>) calls.get(0).get("headers")).get("X-Workflow-Trigger-Id"), "HTTP request carries idempotency identifier");
            node.setProps(Map.of("triggerType", "MESSAGE", "actionBody", Map.of("recipientIds", List.of(1L), "title", "通知", "content", "${value}")));
            equal(true, execution.execute(execution.prepare(node, instance, Map.of("value", "正文")), "message-id", 1000).isSuccess(), "MESSAGE uses batch A sender");
            equal(1, sent.size(), "MESSAGE queued once");
            node.setProps(Map.of("triggerType", "MESSAGE", "actionBody", Map.of("recipientIds", List.of(2L), "title", "通知", "content", "正文")));
            rejects(() -> execution.execute(execution.prepare(node, instance, Map.of()), "wrong-tenant", 1000), "MESSAGE cross-tenant recipient rejected");
            equal(1, sent.size(), "invalid MESSAGE sends nothing");

            WorkflowProperties properties = new com.cloudflow.workflow.config.properties.WorkflowProperties();
            ScriptExecutionPolicy policy = new com.cloudflow.workflow.service.ScriptExecutionPolicy(properties, mapper);
            ScriptExecutionService scripts = new com.cloudflow.workflow.service.ScriptExecutionService(policy, new com.cloudflow.workflow.config.GroovySandboxConfig(properties));
            ScriptNodeHandler legacy = new com.cloudflow.workflow.handler.impl.ScriptNodeHandler(scripts, policy, http, null, secrets);
            node.setProps(Map.of("scriptType", "API", "apiUrl", "http://intranet.example/call", "apiBody", "{&quot;value&quot;:&quot;${value}&quot;}"));
            equal(true, legacy.handle(node, instance, new HashMap<>(Map.of("value", "legacy"))), "legacy API stays synchronous and decodes body");
            equal("legacy", ((Map<?, ?>) calls.get(calls.size() - 1).get("body")).get("value"), "legacy API keeps variable replacement");
            properties.getScript().setEnabled(true);
            node.setProps(Map.of("scriptType", "GROOVY", "scriptContent", "return 1 + 2"));
            Map<String, Object> variables = new HashMap<>();
            equal(true, legacy.handle(node, instance, variables), "legacy GROOVY remains available when enabled");
            equal(3, variables.get("_scriptResult_http"), "legacy GROOVY result preserved");
            properties.getScript().setEnabled(false);
            rejects(() -> legacy.handle(node, instance, new HashMap<>()), "legacy GROOVY disabled policy unchanged");

            Map<String, com.cloudflow.workflow.domain.WfTransactionMessage> queued = new HashMap<>();
            com.cloudflow.workflow.service.TransactionConsistencyService consistency = new com.cloudflow.workflow.service.TransactionConsistencyService() {
                @Override
                public String recordMessage(String type, String businessId, String content) {
                    WfTransactionMessage message = new com.cloudflow.workflow.domain.WfTransactionMessage();
                    message.setMessageId("message-" + queued.size()); message.setBusinessType(type); message.setBusinessId(businessId);
                    message.setContent(content); message.setStatus("PENDING"); message.setRetryCount(0);
                    queued.put(message.getMessageId(), message); return message.getMessageId();
                }
                @Override
                public void retryMessage(com.cloudflow.workflow.domain.WfTransactionMessage message) { }
            };
            WorkflowProcessStateService states = new WorkflowProcessStateService(null, null, null, null, null, null, null) {
                @Override
                public void transition(WfProcessInstance process, WfProcessStatus status) { process.setStatus(status.getCode()); }
            };
            RLock lock = proxy(org.redisson.api.RLock.class, (method, arguments) -> "tryLock".equals(method) || "isHeldByCurrentThread".equals(method));
            PlatformTransactionManager transactionManager = proxy(org.springframework.transaction.PlatformTransactionManager.class,
                    (method, arguments) -> "getTransaction".equals(method) ? new org.springframework.transaction.support.SimpleTransactionStatus() : null);
            WfProcessDefinition definition = new com.cloudflow.workflow.domain.WfProcessDefinition(); definition.setTenantId(100000L);
            List<Object> events = new ArrayList<>();
            AtomicInteger advanced = new java.util.concurrent.atomic.AtomicInteger();
            INodeExecutionService engine = proxy(com.cloudflow.workflow.service.INodeExecutionService.class, (method, arguments) -> {
                if ("findNode".equals(method)) return node;
                if ("advanceAfterNode".equals(method)) advanced.incrementAndGet();
                return null;
            });
            Map<Long, com.cloudflow.workflow.domain.WfCallbackDeadLetter> deadLetters = new HashMap<>();
            WorkflowTriggerService service = new com.cloudflow.workflow.service.WorkflowTriggerService(execution, secrets, consistency,
                    proxy(com.cloudflow.workflow.mapper.WfTransactionMessageMapper.class,
                            (method, arguments) -> "selectById".equals(method) ? queued.get(arguments[0]) : 1),
                    proxy(com.cloudflow.workflow.mapper.WfCallbackDeadLetterMapper.class,
                            (method, arguments) -> "selectById".equals(method) ? deadLetters.get(arguments[0]) : 1),
                    proxy(WfProcessInstanceMapper.class, (method, arguments) -> instance),
                    proxy(com.cloudflow.workflow.mapper.WfProcessDefinitionMapper.class, (method, arguments) -> definition),
                    null, null, null, states, proxy(org.springframework.beans.factory.ObjectProvider.class, (method, arguments) -> engine),
                    new WorkflowGraphModelResolver() {
                        @Override
                        public WfNodeConfig parseRuntimeRoot(String json) { return node; }
                    }, new com.cloudflow.workflow.event.WorkflowEventPublisher(events::add), mapper,
                    proxy(org.redisson.api.RedissonClient.class, (method, arguments) -> lock),
                    new org.springframework.transaction.support.TransactionTemplate(transactionManager),
                    new com.cloudflow.workflow.service.WorkflowGatewayService(null, null, mapper, null),
                    new com.cloudflow.workflow.service.monitor.impl.PerformanceStatsRefreshService(null, null, null) {
                        @Override
                        public void refreshForAnomalyAlert(com.cloudflow.workflow.domain.monitor.AnomalyAlert alert) { }
                    });
            inject(service, "businessLocks", com.cloudflow.workflow.service.WorkflowBusinessLockFixture.create(
                    proxy(org.redisson.api.RedissonClient.class, (method, arguments) -> lock)));
            node.setProps(Map.of("triggerType", "HTTP_CALLBACK", "actionUrl", "http://intranet.example/call", "actionHeaders", Map.of("Authorization", "private-token")));
            equal(false, service.handle(node, instance, new HashMap<>()), "new trigger defaults to asynchronous waiting");
            equal("PENDING", instance.getStatus(), "async trigger persists pending state");
            WfTransactionMessage message = queued.get("message-0");
            equal(false, message.getContent().contains("private-token"), "transaction message stores encrypted credentials");
            service.processAsync(message);
            equal("SUCCESS", message.getStatus(), "async success marks transaction message complete");
            equal("RUNNING", instance.getStatus(), "async success resumes instance");
            equal(1, advanced.get(), "async success advances exactly once");
            equal(1, events.size(), "async success emits node event");
            int callCount = calls.size(); service.processAsync(message);
            equal(callCount, calls.size(), "duplicate async delivery makes no external call");
            equal(1, advanced.get(), "duplicate async delivery does not advance twice");
            service.handle(node, instance, new HashMap<>());
            WfTransactionMessage paused = queued.get("message-1"); instance.setStatus("PAUSED"); service.processAsync(paused);
            equal(0, paused.getRetryCount(), "pause consumes no async attempt");
            equal("PENDING", paused.getStatus(), "pause preserves transaction message");
            instance.setStatus("RUNNING"); service.processAsync(paused);
            equal(2, advanced.get(), "resume consumes preserved async work");

            WfCallbackDeadLetter deadLetter = new com.cloudflow.workflow.domain.WfCallbackDeadLetter();
            deadLetter.setId(1L); deadLetter.setTenantId(100000L); deadLetter.setStatus("PENDING");
            deadLetter.setPayloadJson(message.getContent()); deadLetters.put(1L, deadLetter);
            responseStatus.set(503);
            rejects(() -> service.replay(deadLetter), "failed dead-letter replay remains actionable");
            equal("PENDING", deadLetter.getStatus(), "failed dead-letter is not marked replayed");
            responseStatus.set(200); service.replay(deadLetter);
            equal("REPLAYED", deadLetter.getStatus(), "successful dead-letter replay marked complete");
            equal(2, deadLetter.getRetryCount(), "dead-letter replay attempts counted");
        } finally {
            com.cloudflow.common.tenant.TenantContext.setTenantId(previousTenant);
            http.close();
        }
    }

    private static void checkTriggerFailureStrategies(com.cloudflow.workflow.service.WorkflowTriggerSecrets secrets, ObjectMapper mapper) throws Exception {
        List<com.cloudflow.workflow.domain.WfCallbackDeadLetter> deadLetters = new ArrayList<>();
        List<com.cloudflow.workflow.domain.monitor.AnomalyAlert> alerts = new ArrayList<>();
        List<com.cloudflow.workflow.domain.WfNodeRecord> records = new ArrayList<>();
        com.cloudflow.workflow.service.HttpClientService failingHttp = new com.cloudflow.workflow.service.HttpClientService(null) {
            @Override
            public ApiResponse executeRequest(String url, String method, Map<String, String> headers, Map<String, Object> body, long timeout) {
                return new ApiResponse(503, "unavailable", false);
            }
        };
        try {
            WorkflowTriggerExecutor execution = new com.cloudflow.workflow.service.WorkflowTriggerExecutor(failingHttp, secrets, null, null, mapper);
            com.cloudflow.workflow.service.WorkflowProcessStateService states = new com.cloudflow.workflow.service.WorkflowProcessStateService(null, null, null, null, null, null, null) {
                @Override
                public void transition(WfProcessInstance instance, WfProcessStatus state) { instance.setStatus(state.getCode()); }
            };
            WorkflowTriggerService service = new com.cloudflow.workflow.service.WorkflowTriggerService(execution, secrets, null, null,
                    proxy(com.cloudflow.workflow.mapper.WfCallbackDeadLetterMapper.class, (method, arguments) -> {
                        deadLetters.add((com.cloudflow.workflow.domain.WfCallbackDeadLetter) arguments[0]); return 1;
                    }), null, proxy(com.cloudflow.workflow.mapper.WfProcessDefinitionMapper.class, (method, arguments) -> {
                        WfProcessDefinition definition = new WfProcessDefinition();
                        definition.setDefinitionId("definition"); definition.setTenantId(100000L); definition.setProcessName("真实触发流程");
                        return definition;
                    }), proxy(com.cloudflow.workflow.mapper.WfNodeRecordMapper.class, (method, arguments) -> {
                        records.add((com.cloudflow.workflow.domain.WfNodeRecord) arguments[0]); return 1;
                    }), proxy(com.cloudflow.workflow.mapper.AnomalyAlertMapper.class, (method, arguments) -> {
                        alerts.add((com.cloudflow.workflow.domain.monitor.AnomalyAlert) arguments[0]); return 1;
                    }), proxy(com.cloudflow.workflow.service.monitor.IAnomalyDetectionService.class, (method, arguments) -> null),
                    states, null, null, null, mapper, null, null, null,
                    new com.cloudflow.workflow.service.monitor.impl.PerformanceStatsRefreshService(null, null, null) {
                        @Override
                        public void refreshForAnomalyAlert(com.cloudflow.workflow.domain.monitor.AnomalyAlert alert) { }
                    });
            WfNodeConfig node = new WfNodeConfig();
            node.setId("http"); node.setType("SCRIPT"); node.setTitle("触发检查");
            for (String strategy : List.of("BLOCK", "SKIP", "TO_DLQ")) {
                WfProcessInstance instance = new WfProcessInstance();
                instance.setInstanceId("trigger-" + strategy); instance.setStatus("RUNNING"); instance.setTenantId(100000L);
                instance.setDefinitionId("definition");
                instance.setProcessDefKey("trigger-definition"); instance.setTitle("长".repeat(200));
                node.setProps(Map.of("triggerType", "HTTP_CALLBACK", "callAsync", false, "failStrategy", strategy,
                        "actionUrl", "http://private.example", "actionHeaders", Map.of("Authorization", "private-token")));
                boolean proceed = service.handle(node, instance, new HashMap<>());
                equal(!"BLOCK".equals(strategy), proceed, "trigger failure strategy " + strategy);
                equal("BLOCK".equals(strategy) ? "FAILED" : "RUNNING", instance.getStatus(), "trigger failure status " + strategy);
            }
            equal(1, alerts.size(), "blocked trigger raises persisted alert");
            equal("真实触发流程", alerts.get(0).getProcessName(), "trigger alert uses definition name and preserves independent instance title");
            equal(1, deadLetters.size(), "TO_DLQ reuses callback dead-letter table");
            equal(false, deadLetters.get(0).getPayloadJson().contains("private-token"), "DLQ has no plaintext credentials");
            equal(false, deadLetters.get(0).getPayloadJson().contains("private.example"), "DLQ request encrypted");
            equal(3, records.size(), "all failure strategies leave node records");
            equal("AUTO_SKIP", records.get(1).getEventType(), "skip semantic recorded");
        } finally { failingHttp.close(); }
    }

    static com.cloudflow.workflow.service.WorkflowAgentService taskAgents(Map<String, WfTask> tasks) {
        return new com.cloudflow.workflow.service.WorkflowAgentService(null, null, null, null, null, null, null, null, null, null, null) {
            @Override
            public void createTask(WfTask task) {
                if (task.getVersion() == null) task.setVersion(0);
                tasks.put(task.getTaskId(), task);
            }

            @Override
            public WfTask lockTask(String taskId) {
                WfTask task = tasks.get(taskId);
                if (task == null) throw com.cloudflow.workflow.exception.WorkflowException.taskNotFound(taskId);
                if (!"TODO".equals(task.getStatus())) throw com.cloudflow.workflow.exception.WorkflowException.invalidState("Task is not pending");
                return task;
            }

            @Override
            public void completeRelations(WfTask task) { }

            @Override
            public void annotateHistory(WfTaskHistory history, WfTask task, Long operatorId) { }
        };
    }

    private static final class MemoryRedis extends com.cloudflow.common.redis.core.RedisCache {
        final Map<String, Object> values = new HashMap<>();
        final Map<String, Double> scores = new HashMap<>();

        @Override
        @SuppressWarnings("unchecked")
        public <ValueType> ValueType getCacheObject(String key) {
            return (ValueType) values.get(key);
        }

        @Override
        public boolean deleteObject(String key) {
            return values.remove(key) != null;
        }

        @Override
        public java.util.Collection<String> keys(String pattern) {
            return values.keySet().stream().filter(key -> key.startsWith(pattern.replace("*", ""))).toList();
        }

        @Override
        public java.util.Set<Object> getCacheZSetByScoreRange(String key, double minimum, double maximum) {
            return new java.util.HashSet<>(scores.keySet());
        }

        @Override
        public long removeCacheZSet(String key, Object... members) {
            long removed = 0;
            for (Object member : members) if (scores.remove(String.valueOf(member)) != null) removed++;
            return removed;
        }
    }

    private static void inject(Object target, String fieldName, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(target, value);
    }

    @SuppressWarnings("unchecked")
    private static <MapperType> MapperType proxy(Class<MapperType> type, BiFunction<String, Object[], Object> handler) {
        return (MapperType) Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type},
                (target, method, arguments) -> handler.apply(method.getName(), arguments));
    }

    private static void rejects(Runnable operation, String label) {
        try {
            operation.run();
        } catch (com.cloudflow.workflow.exception.WorkflowException expected) {
            checks++;
            return;
        }
        throw new AssertionError(label + ": expected workflow rejection");
    }

    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) {
            throw new AssertionError(label + ": expected=" + expected + ", actual=" + actual);
        }
        checks++;
    }
}
