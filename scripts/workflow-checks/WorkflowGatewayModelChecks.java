import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfGatewayActivation;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.dto.SimulationNodeDetail;
import com.cloudflow.workflow.domain.dto.SimulationRequest;
import com.cloudflow.workflow.domain.dto.SimulationResult;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.model.WorkflowGatewayTopology;
import com.cloudflow.workflow.model.WorkflowGatewayRewindPlan;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.model.WorkflowRuntimeGraph;
import com.cloudflow.workflow.service.WorkflowExecutionContext;
import com.cloudflow.workflow.service.WorkflowWaitState;
import com.cloudflow.workflow.service.WorkflowHistoryState;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.service.TimerSchedulerService;
import com.cloudflow.workflow.service.IWfDefinitionService;
import com.cloudflow.workflow.service.impl.NodeExecutionServiceImpl;
import com.cloudflow.workflow.service.impl.SimulationServiceImpl;
import com.cloudflow.workflow.expression.ConditionExpressionEngine;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.cloudflow.workflow.job.TaskReminderJob;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.workflow.service.impl.WfDefinitionServiceImpl;
import com.fasterxml.jackson.databind.JsonNode;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.math.BigDecimal;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public final class WorkflowGatewayModelChecks {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final WorkflowGraphModelResolver GRAPHS = new WorkflowGraphModelResolver();
    private static int assertions;

    public static int run() throws Exception {
        assertions = 0;
        for (String type : List.of("INCLUSIVE", "PARALLEL")) {
            ObjectNode model = model(type);
            WorkflowRuntimeGraph graph = GRAPHS.parseRuntimeGraph(model.toString());
            WorkflowGatewayTopology.Split split = WorkflowGatewayTopology.split(graph, graph.getNode("split"));
            equal("join", split.joinNodeKey(), "explicit or structural paired join");
            equal(3, split.branches().size(), "parallel join pointer is not an executable branch");
            equal(List.of("split-first", "split-second", "split-third"), split.branches().stream().map(WorkflowRuntimeGraph.EdgeLink::getId).toList(), "stable branch edge identities");
            equal(true, WorkflowGatewayTopology.isJoin(graph, "join"), "paired join discovered");
            ObjectNode noJoin = model.deepCopy();
            node(noJoin, "split").remove("joinNodeKey");
            if (type.equals("INCLUSIVE")) rejects(noJoin, "inclusive join mandatory");
            ObjectNode crosses = model.deepCopy();
            edge(crosses, "first-join").put("target", "second");
            rejects(crosses, "sibling branch intersection rejected");
            ObjectNode escapes = model.deepCopy();
            edge(escapes, "first-join").put("target", "end");
            rejects(escapes, "branch escape to end rejected");
            ObjectNode noExit = model.deepCopy();
            removeEdge(noExit, "first-join");
            rejects(noExit, "branch cannot silently finish before joining");
            ObjectNode bypass = model.deepCopy();
            ((ArrayNode) bypass.get("edges")).add(edge("start-join", "start", "join", true));
            rejects(bypass, "outside join arrival rejected");
            ObjectNode duplicate = model.deepCopy();
            edge(duplicate, "split-third").put("id", "split-first");
            rejects(duplicate, "duplicate edge identifiers rejected");
            ObjectNode longId = model.deepCopy();
            edge(longId, "split-first").put("id", "x".repeat(65));
            rejects(longId, "edge identity fits approved database column");
        }
        ObjectNode defaults = model("INCLUSIVE");
        ObjectNode dedicatedJoin = model("INCLUSIVE");
        node(dedicatedJoin, "join").put("type", "GATEWAY");
        GRAPHS.parseRuntimeGraph(dedicatedJoin.toString()); assertions++;
        node(dedicatedJoin, "split").put("type", "ROUTE").remove("joinNodeKey");
        rejects(dedicatedJoin, "single-edge gateway is only allowed as a declared paired join");
        ObjectNode singleBranch = model("INCLUSIVE");
        removeEdge(singleBranch, "split-second"); removeEdge(singleBranch, "second-join");
        removeEdge(singleBranch, "split-third"); removeEdge(singleBranch, "third-join");
        for (int index = singleBranch.get("nodes").size() - 1; index >= 0; index--) {
            if (List.of("second", "third").contains(singleBranch.get("nodes").get(index).get("id").asText())) {
                ((ArrayNode) singleBranch.get("nodes")).remove(index);
            }
        }
        equal(1, WorkflowGatewayTopology.split(GRAPHS.parseRuntimeGraph(singleBranch.toString()),
                GRAPHS.parseRuntimeGraph(singleBranch.toString()).getNode("split")).branches().size(), "one remaining configured branch preserves gateway semantics");
        edge(defaults, "split-third").put("isDefault", true);
        GRAPHS.parseRuntimeGraph(defaults.toString()); assertions++;
        edge(defaults, "split-second").put("isDefault", true);
        rejects(defaults, "multiple inclusive defaults rejected");
        ObjectNode loop = model("INCLUSIVE");
        ((ArrayNode) loop.get("nodes")).add(JSON.createObjectNode().put("id", "route").put("type", "ROUTE").put("title", "再次审批"));
        edge(loop, "join-end").put("target", "route");
        ((ArrayNode) loop.get("edges")).add(edge("route-split", "route", "split", false).put("condition", "#round < 2"));
        ((ArrayNode) loop.get("edges")).add(edge("route-end", "route", "end", true));
        GRAPHS.parseRuntimeGraph(loop.toString()); assertions++;
        ObjectNode nested = model("INCLUSIVE");
        node(nested, "first").put("type", "PARALLEL").put("joinNodeKey", "innerJoin");
        ArrayNode nestedNodes = (ArrayNode) nested.get("nodes");
        nestedNodes.add(JSON.createObjectNode().put("id", "innerFirst").put("type", "APPROVAL").put("title", "内层一"));
        nestedNodes.add(JSON.createObjectNode().put("id", "innerSecond").put("type", "APPROVAL").put("title", "内层二"));
        nestedNodes.add(JSON.createObjectNode().put("id", "innerJoin").put("type", "APPROVAL").put("title", "内层汇聚"));
        removeEdge(nested, "first-join");
        ArrayNode nestedEdges = (ArrayNode) nested.get("edges");
        nestedEdges.add(edge("first-innerFirst", "first", "innerFirst", false));
        nestedEdges.add(edge("first-innerSecond", "first", "innerSecond", false));
        nestedEdges.add(edge("innerFirst-innerJoin", "innerFirst", "innerJoin", false));
        nestedEdges.add(edge("innerSecond-innerJoin", "innerSecond", "innerJoin", false));
        nestedEdges.add(edge("innerJoin-join", "innerJoin", "join", false));
        GRAPHS.parseRuntimeGraph(nested.toString()); assertions++;
        SimulationResult nestedSimulation = simulate(nested, Map.of(), false);
        equal(true, nestedSimulation.isSuccess(), "nested simulation succeeds");
        equal(5L, nestedSimulation.getPaths().stream().filter(path -> "JOINED".equals(path.getTerminationType())).count(), "each activated inner and outer branch reaches its own join");
        equal(1L, nestedSimulation.getPaths().stream().filter(path -> "COMPLETED".equals(path.getTerminationType())).count(), "nested simulation has one completed continuation");
        equal(true, detail(nestedSimulation, "innerJoin").isReached(), "nested join reached after both inner branches");
        node(nested, "first").put("joinNodeKey", "join");
        rejects(nested, "nested gateway cannot share parent join");
        ObjectNode generated = model("INCLUSIVE");
        generated.get("edges").forEach(raw -> ((ObjectNode) raw).remove("id"));
        equal(GRAPHS.parseRuntimeGraph(generated.toString()).getOutgoingEdges("split").stream().map(WorkflowRuntimeGraph.EdgeLink::getId).toList(),
                GRAPHS.parseRuntimeGraph(generated.toString()).getOutgoingEdges("split").stream().map(WorkflowRuntimeGraph.EdgeLink::getId).toList(), "optional edge ids resolve identically after reload");
        contextBoundaries();
        conditionBoundaries();
        conditionPersistence();
        waitBoundaries();
        historyBoundaries();
        reminderTransactionBoundaries();
        rewindBoundaries();
        definitionWaitConfiguration();
        simulationBoundaries();
        System.out.println("GATEWAY_MODEL_CHECKS: assertions=" + assertions + "; failed=0; paired_paths=true; contexts_server_owned=true");
        return assertions;
    }

    private static void reminderTransactionBoundaries() throws Exception {
        Map<String, Map<Object, Double>> indexes = new LinkedHashMap<>();
        RedisCache cache = new RedisCache() {
            @Override
            public boolean setCacheZSet(String key, Object value, double score) {
                indexes.computeIfAbsent(key, ignored -> new LinkedHashMap<>()).put(value, score);
                return true;
            }
            @Override
            public long removeCacheZSet(String key, Object... values) {
                long removed = 0;
                for (Object value : values) if (indexes.getOrDefault(key, Map.of()).remove(value) != null) removed++;
                return removed;
            }
        };
        TaskReminderJob reminders = new TaskReminderJob();
        Field dependency = TaskReminderJob.class.getDeclaredField("redisCache");
        dependency.setAccessible(true); dependency.set(reminders, cache);
        for (boolean commit : List.of(false, true)) {
            TransactionSynchronizationManager.initSynchronization();
            try {
                reminders.registerAfterCommit("reminder-task", 2);
                equal(true, indexes.isEmpty(), "uncommitted tasks have no timeout or reminder index");
                if (commit) for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) synchronization.afterCommit();
                else for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
            } finally { TransactionSynchronizationManager.clearSynchronization(); }
            equal(!commit, indexes.isEmpty(), "only committed task assignments create reminder indexes");
        }
        equal(3, indexes.get(TaskReminderJob.REMINDER_ZSET_KEY).size(), "all three reminder times registered after commit");
        equal(1, indexes.get("sys:task:timeouts").size(), "timeout registered after commit");
        for (boolean commit : List.of(false, true)) {
            TransactionSynchronizationManager.initSynchronization();
            try {
                reminders.cancelAfterCommit("reminder-task");
                equal(3, indexes.get(TaskReminderJob.REMINDER_ZSET_KEY).size(), "rollback candidate keeps reminders until commit");
                equal(1, indexes.get("sys:task:timeouts").size(), "rollback candidate keeps timeout until commit");
                if (commit) for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) synchronization.afterCommit();
                else for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
            } finally { TransactionSynchronizationManager.clearSynchronization(); }
            equal(commit ? 0 : 3, indexes.get(TaskReminderJob.REMINDER_ZSET_KEY).size(), "rollback preserves all reminder scores while commit cancels them");
            equal(commit ? 0 : 1, indexes.get("sys:task:timeouts").size(), "rollback preserves timeout while commit cancels it");
        }
    }

    private static void contextBoundaries() throws Exception {
        WorkflowExecutionContext.Frame parent = new WorkflowExecutionContext.Frame("parent", "parent-branch", null);
        WorkflowExecutionContext.Frame child = new WorkflowExecutionContext.Frame("child", "child-branch", parent);
        equal(child, WorkflowExecutionContext.parse(WorkflowExecutionContext.encode(child)), "nested context round trip");
        WorkflowExecutionContext.run(parent, () -> {
            equal(parent, WorkflowExecutionContext.current(), "outer context set");
            try {
                WorkflowExecutionContext.run(child, () -> { throw new IllegalStateException("injected"); });
            } catch (IllegalStateException expected) {
                equal(parent, WorkflowExecutionContext.current(), "failure restores parent context");
            }
        });
        equal(null, WorkflowExecutionContext.current(), "thread context always cleared");
        WfTask task = new WfTask(); task.setExecutionContext(WorkflowExecutionContext.encode(child));
        equal(false, JSON.readTree(JSON.writeValueAsString(task)).has("executionContext"), "private context hidden in responses");
        equal(null, JSON.readValue("{\"executionContext\":\"forged\"}", WfTask.class).getExecutionContext(), "client cannot deserialize execution context");
        task.setDisabledFromUserId(123L); task.setDisabledFromUserName("保留的原姓名");
        task.setDisabledReleaseVersion(7); task.setDisabledReleaseEventId("private-release-event");
        JsonNode response = JSON.readTree(JSON.writeValueAsString(task));
        for (String field : List.of("disabledFromUserId", "disabledFromUserName", "disabledReleaseVersion", "disabledReleaseEventId")) {
            equal(false, response.has(field), "release source hidden in response: " + field);
        }
        WfTask forged = JSON.readValue("{\"disabledFromUserId\":123,\"disabledFromUserName\":\"forged\",\"disabledReleaseVersion\":7,\"disabledReleaseEventId\":\"forged\"}", WfTask.class);
        equal(null, forged.getDisabledFromUserId(), "client cannot set release source user");
        equal(null, forged.getDisabledFromUserName(), "client cannot set release source name");
        equal(null, forged.getDisabledReleaseVersion(), "client cannot set release source version");
        equal(null, forged.getDisabledReleaseEventId(), "client cannot set release source event");
        try {
            WorkflowExecutionContext.assertNoOverrides(Map.of("_wf_execution_context", "forged"));
            throw new AssertionError("client context injection must be rejected");
        } catch (WorkflowException expected) {
            assertions++;
        }
        Map<String, Object> source = new LinkedHashMap<>(Map.of("rows", new ArrayList<>(List.of(new LinkedHashMap<>(Map.of("amount", new BigDecimal("0.10")))))));
        Map<String, Object> copied = WorkflowExecutionContext.copyVariables(source);
        ((List<?>) copied.get("rows")).clear();
        equal(1, ((List<?>) source.get("rows")).size(), "nested branch variables are independent");
    }

    private static void conditionBoundaries() throws Exception {
        NodeExecutionServiceImpl engine = new NodeExecutionServiceImpl();
        for (Map.Entry<String, Object> dependency : Map.<String, Object>of("securityUtils", new WorkflowSecurityUtils(),
                "conditionExpressionEngine", new ConditionExpressionEngine()).entrySet()) {
            Field field = NodeExecutionServiceImpl.class.getDeclaredField(dependency.getKey());
            field.setAccessible(true);
            field.set(engine, dependency.getValue());
        }
        Map<String, Object> values = Map.of("choice", "two", "amount", 12);
        equal(true, engine.evaluateCondition("#choice == 'two'", values), "quotes preserve matching branch");
        equal(false, engine.evaluateCondition("#choice == 'none'", values), "quotes preserve nonmatching branch");
        equal(true, engine.evaluateCondition("#amount > 10 && #amount < 20", values), "comparisons and boolean operators retain syntax");
        equal(true, engine.evaluateCondition("#choice == '&gt;'", Map.of("choice", "&gt;")), "literal entity remains literal data");
        equal(false, engine.evaluateCondition("#choice == '&gt;'", Map.of("choice", ">")), "literal entity is not silently decoded");
        equal(false, engine.evaluateCondition("T(java.lang.Runtime).getRuntime()", values), "raw expressions still pass security validation");
    }

    private static void conditionPersistence() throws Exception {
        WfDefinitionServiceImpl definitions = new com.cloudflow.workflow.service.impl.WfDefinitionServiceImpl();
        Field security = definitions.getClass().getDeclaredField("securityUtils");
        security.setAccessible(true); security.set(definitions, new WorkflowSecurityUtils());
        Method sanitize = definitions.getClass().getDeclaredMethod("sanitizeModelJson", String.class);
        sanitize.setAccessible(true);
        ObjectNode source = model("INCLUSIVE");
        node(source, "split").put("title", "<script>alert('blocked')</script>包含网关");
        edge(source, "split-first").put("id", "split->first").put("condition", "#choice == 'two' && #amount < 20");
        edge(source, "split-second").put("condition", "#choice == '&gt;'");
        String first = (String) sanitize.invoke(definitions, source.toString());
        ObjectNode stored = (ObjectNode) JSON.readTree(first);
        ObjectNode resaved = (ObjectNode) JSON.readTree((String) sanitize.invoke(definitions, first));
        for (String edgeId : List.of("split->first", "split-second")) {
            equal(edge(source, edgeId).get("condition"), edge(stored, edgeId).get("condition"), "condition persists without HTML rewriting");
            equal(edge(stored, edgeId), edge(resaved, edgeId), "editing preserves edge identity and expression exactly");
        }
        equal("包含网关", node(stored, "split").get("title").asText(), "display text still strips script content");
        GRAPHS.parseRuntimeGraph(stored.toString()); assertions++;
    }

    private static void historyBoundaries() throws Exception {
        WfProcessInstance instance = new WfProcessInstance();
        instance.setVariables("{}");
        WfProcessInstanceMapper instances = (WfProcessInstanceMapper) Proxy.newProxyInstance(WfProcessInstanceMapper.class.getClassLoader(),
                new Class<?>[]{WfProcessInstanceMapper.class}, (proxy, method, arguments) -> {
                    equal("updateById", method.getName(), "history persists with instance optimistic version");
                    equal(instance, arguments[0], "history uses the locked instance");
                    return 1;
                });
        WorkflowHistoryState historyState = new WorkflowHistoryState(instances);
        WfTask task = new WfTask();
        WorkflowExecutionContext.Frame frame = new WorkflowExecutionContext.Frame("history-round", "branch", null);
        task.setExecutionContext(WorkflowExecutionContext.encode(frame));
        WfTaskHistory first = new WfTaskHistory(); first.setHistoryId("first-history"); first.setAction("APPROVE");
        first.setVariablesChanged("{\"originalAssigneeId\":12}");
        historyState.record(instance, task, first);
        Map<String, Object> stale = WorkflowWaitState.variables(instance);
        WfTaskHistory second = new WfTaskHistory(); second.setHistoryId("second-history"); second.setAction("REJECT");
        historyState.record(instance, task, second);
        WorkflowHistoryState.invalidate(instance, List.of(first.getHistoryId()));
        WorkflowWaitState.save(instance, stale);
        equal(2, WorkflowWaitState.variables(instance).get("_wf_history_sequence"), "stale snapshot cannot rewind history sequence");
        equal(Set.of(first.getHistoryId()), WorkflowHistoryState.invalidated(instance), "stale snapshot cannot revive invalidated approval");
        WorkflowWaitState.register(instance, stale, "history-wait", "TRIGGER", "trigger", Map.of("triggerType", "MANUAL"));
        WorkflowWaitState.finish(instance, stale, "history-wait");
        WfTaskHistory third = new WfTaskHistory(); third.setHistoryId("third-history"); third.setAction("APPROVE");
        historyState.record(instance, task, third);
        equal(3L, WorkflowHistoryState.execution(third).sequence(), "new approval sequence follows completed and invalidated histories");
        equal(frame, WorkflowHistoryState.execution(first).context(), "history retains authoritative branch frame");
        equal(Set.of(first.getHistoryId()), WorkflowHistoryState.invalidated(instance), "registering and completing stale waits preserves invalidation");
        equal(12, WorkflowHistoryState.metadata(first.getVariablesChanged()).get("originalAssigneeId"), "execution metadata preserves existing public attribution");
        String publicMetadata = JSON.readTree(JSON.writeValueAsString(first)).get("variablesChanged").asText();
        equal(false, publicMetadata.contains("_wf_"), "public history serialization removes private execution evidence");
        equal(12, JSON.readTree(publicMetadata).get("originalAssigneeId").asInt(), "public history keeps attribution metadata");
        equal(true, WorkflowWaitState.childVariables(WorkflowWaitState.variables(instance)).keySet().stream().noneMatch(key -> key.startsWith("_wf_")), "child process cannot inherit history counters or invalidation");
        equal(false, WorkflowHistoryState.approval(second), "rejection is not a rollback approval target");
    }

    private static void rewindBoundaries() {
        WorkflowRuntimeGraph graph = GRAPHS.parseRuntimeGraph(model("INCLUSIVE").toString());
        WfGatewayActivation round = new WfGatewayActivation(); round.setActivationId("round"); round.setGatewayId("split"); round.setStatus("WAITING");
        Map<String, WfGatewayActivation> rounds = Map.of("round", round);
        WorkflowExecutionContext.Frame first = new WorkflowExecutionContext.Frame("round", "split-first", null);
        equal(new WorkflowGatewayRewindPlan("first", first, null), WorkflowGatewayRewindPlan.resolve(graph, "first", first, rounds), "same branch keeps its current round");
        equal(new WorkflowGatewayRewindPlan("start", null, null), WorkflowGatewayRewindPlan.resolve(graph, "start", first, rounds), "upstream of gateway removes branch context");
        equal(new WorkflowGatewayRewindPlan("split", null, "split"), WorkflowGatewayRewindPlan.resolve(graph, "first", null, rounds), "released branch re-enters split instead of reusing old arrivals");
        try {
            WorkflowGatewayRewindPlan.resolve(graph, "second", first, rounds);
            throw new AssertionError("sibling target accepted");
        } catch (WorkflowException expected) {
            equal("GATEWAY_CONTEXT_INVALID", expected.getCode(), "siblings cannot share a rollback frame");
        }
        round.setStatus("CANCELLED");
        try {
            WorkflowGatewayRewindPlan.resolve(graph, "first", first, rounds);
            throw new AssertionError("cancelled frame accepted");
        } catch (WorkflowException expected) {
            equal("GATEWAY_CONTEXT_INVALID", expected.getCode(), "cancelled gateway cannot be retained");
        }
        WorkflowExecutionContext.Frame child = new WorkflowExecutionContext.Frame("inner", "inner-first", first);
        equal(true, WorkflowExecutionContext.within(child, first), "nested frame belongs to its ancestor scope");
        equal(false, WorkflowExecutionContext.within(first, child), "ancestor does not belong to nested scope");
        equal(false, WorkflowExecutionContext.within(new WorkflowExecutionContext.Frame("round", "split-second", null), first), "scope excludes sibling branch");
    }

    private static void waitBoundaries() {
        WfProcessInstance instance = new WfProcessInstance();
        instance.setInstanceId("waiting-instance");
        instance.setVariables("{\"note\":\"saved\"}");
        Map<String, Object> staleVariables = WorkflowWaitState.variables(instance);
        WorkflowExecutionContext.Frame left = new WorkflowExecutionContext.Frame("round-one", "left", null);
        WorkflowExecutionContext.Frame right = new WorkflowExecutionContext.Frame("round-one", "right", null);
        Map<String, Object> timer = Map.of("expireAt", 1789550000000L, "timerAction", "AUTO_PASS", "retryCount", 0);
        WorkflowWaitState.Pending first = WorkflowExecutionContext.call(left,
                () -> WorkflowWaitState.register(instance, staleVariables, "timer-one", "TIMER", "timer", timer));
        WorkflowWaitState.Pending second = WorkflowExecutionContext.call(right,
                () -> WorkflowWaitState.register(instance, staleVariables, "timer-two", "TIMER", "timer", timer));
        equal(2, WorkflowWaitState.list(instance, "TIMER").size(), "sibling wait registration preserves earlier pending branch");
        equal(left, WorkflowWaitState.find(instance, first.waitId()).context(), "waiting state restores branch after JSON round trip");
        equal(false, TimerSchedulerService.timerKey(instance.getInstanceId(), first).equals(TimerSchedulerService.timerKey(instance.getInstanceId(), second)), "same node in distinct branches has distinct timer keys");
        equal(true, TimerSchedulerService.timerKey(instance.getInstanceId(), first).contains("round-one:timer-one"), "timer key contains activation and generation");
        Map<String, Object> previousSnapshot = WorkflowWaitState.variables(instance);
        WorkflowWaitState.finish(instance, previousSnapshot, first.waitId());
        WorkflowWaitState.save(instance, previousSnapshot);
        equal(null, WorkflowWaitState.find(instance, first.waitId()), "stale variable snapshot cannot resurrect finished wait");
        equal(second, WorkflowWaitState.find(instance, second.waitId()), "finishing one branch preserves sibling wait");
        Map<String, Object> retry = new LinkedHashMap<>(timer); retry.put("retryCount", 1); retry.put("notified", true);
        WorkflowWaitState.Pending changed = WorkflowWaitState.change(instance, null, second, retry);
        equal(1, WorkflowWaitState.find(instance, changed.waitId()).payload().get("retryCount"), "retry count is durably persisted");
        equal(true, WorkflowWaitState.find(instance, changed.waitId()).payload().get("notified"), "notification-only wait is durable");
        equal(false, WorkflowWaitState.childVariables(WorkflowWaitState.variables(instance)).containsKey(WorkflowWaitState.VARIABLE), "child workflow cannot inherit parent wait registry");
        WorkflowWaitState.clear(instance);
        equal(0, WorkflowWaitState.list(instance, null).size(), "terminal state removes all pending waits");
        equal("saved", WorkflowWaitState.variables(instance).get("note"), "cleanup preserves business data");
        ObjectNode forgedMapping = model("INCLUSIVE");
        node(forgedMapping, "first").putObject("inputs").put("_wf_waits", "note");
        rejects(forgedMapping, "node mapping cannot overwrite server waiting state");
        ObjectNode leakedMapping = model("INCLUSIVE");
        node(leakedMapping, "first").putObject("outputs").put("note", "_wf_waits");
        rejects(leakedMapping, "node mapping cannot expose server waiting state");
    }

    private static void definitionWaitConfiguration() throws Exception {
        WfDefinitionServiceImpl definitions = new com.cloudflow.workflow.service.impl.WfDefinitionServiceImpl();
        Method validate = definitions.getClass().getDeclaredMethod("validateNodeModel", com.fasterxml.jackson.databind.JsonNode.class);
        validate.setAccessible(true);
        for (Map<String, Object> props : List.of(
                Map.<String, Object>of("timerType", "DELAY", "delayValue", 1, "delayUnit", "MINUTE", "timerAction", "AUTO_PASS"),
                Map.<String, Object>of("timerType", "FIXED_TIME", "fixedTime", "2026-01-01 00:00:00", "timerAction", "NOTIFY_ONLY"),
                Map.<String, Object>of("triggerType", "MESSAGE", "callAsync", true, "actionBody", Map.of("recipientIds", List.of("1"), "title", "检查", "content", "消息")))) {
            String type = props.containsKey("triggerType") ? "SCRIPT" : "TIMER";
            ObjectNode graph = model("INCLUSIVE");
            node(graph, "first").put("type", type).set("props", JSON.valueToTree(props));
            GRAPHS.parseRuntimeGraph(graph.toString());
            validate.invoke(definitions, node(graph, "first"));
            assertions++;
        }
        ObjectNode invalid = model("INCLUSIVE");
        node(invalid, "first").put("type", "TIMER").putObject("props").put("timerType", "DELAY").put("delayValue", 0);
        rejects(invalid, "zero duration remains invalid; recovery fixtures must use a fixed past time");
        Field resolver = definitions.getClass().getDeclaredField("workflowGraphModelResolver");
        resolver.setAccessible(true);
        resolver.set(definitions, GRAPHS);
        Method integrity = definitions.getClass().getDeclaredMethod("validateModelIntegrity", String.class);
        integrity.setAccessible(true);
        ObjectNode exclusive = model("CONDITION");
        for (String nodeId : List.of("first", "second", "third", "join")) node(exclusive, nodeId).put("approverType", "INITIATOR");
        edge(exclusive, "split-first").put("condition", "#choice == 'one'");
        edge(exclusive, "split-second").put("condition", "#choice == 'two'");
        edge(exclusive, "split-third").put("isDefault", true);
        GRAPHS.parseRuntimeGraph(exclusive.toString());
        integrity.invoke(definitions, exclusive.toString());
        assertions++;
        node(exclusive, "first").put("type", "CONDITION");
        integrity.invoke(definitions, exclusive.toString());
        assertions++;
        edge(exclusive, "split-first").remove("condition");
        try {
            integrity.invoke(definitions, exclusive.toString());
            throw new AssertionError("single-edge condition still requires a branch expression");
        } catch (java.lang.reflect.InvocationTargetException expected) {
            if (!(expected.getCause() instanceof WorkflowException)) throw expected;
            assertions++;
        }
    }

    private static void simulationBoundaries() throws Exception {
        ObjectNode inclusive = model("INCLUSIVE");
        edge(inclusive, "split-first").put("condition", "#choice != 'none'");
        edge(inclusive, "split-second").put("condition", "#choice == 'two'");
        edge(inclusive, "split-third").put("condition", "#choice == 'three'");
        SimulationResult partial = simulate(inclusive, Map.of("choice", "two"), false);
        equal(true, partial.isSuccess(), "partial inclusive simulation succeeds");
        equal(2, detail(partial, "split").getExpectedCount(), "only two matching branches are expected");
        equal(List.of("split-first", "split-second"), detail(partial, "split").getActivatedBranches(), "inclusive simulation follows all matching edges");
        equal(List.of("split-first", "split-second", "split-third"), detail(partial, "split").getBranchOrder(), "simulation preserves edge order");
        equal("join", detail(partial, "split").getJoinNodeKey(), "simulation returns explicit paired join");
        equal(null, detail(partial, "split").getDefaultBranch(), "simulation does not fabricate a default");
        equal(false, detail(partial, "third").isReached(), "unmatched branch is not marked reached");
        equal(2L, partial.getPaths().stream().filter(path -> "JOINED".equals(path.getTerminationType())).count(), "both matching branch paths reach join");
        equal(List.of("start", "split", "join", "end"), partial.getPaths().stream().filter(path -> "COMPLETED".equals(path.getTerminationType())).findFirst().orElseThrow().getNodeIds(), "continuation executes once after join");
        SimulationResult missing = simulate(inclusive, Map.of("choice", "none"), false);
        equal(false, missing.isSuccess(), "no match without default fails simulation");
        equal("GATEWAY_NO_MATCH", missing.getPaths().get(0).getTerminationType(), "no match has explicit reason");
        equal(false, detail(missing, "join").isReached(), "no match never releases join");
        edge(inclusive, "split-third").put("isDefault", true);
        SimulationResult fallback = simulate(inclusive, Map.of("choice", "none"), false);
        equal(List.of("split-third"), detail(fallback, "split").getActivatedBranches(), "default only runs when no ordinary branch matches");
        equal("split-third", detail(fallback, "split").getDefaultBranch(), "default edge exposed exactly");
        equal(List.of("split-first", "split-second"), detail(simulate(inclusive, Map.of("choice", "two"), false), "split").getActivatedBranches(), "default excluded when ordinary branches match");
        ObjectNode route = inclusive.deepCopy();
        node(route, "split").put("type", "ROUTE").remove("joinNodeKey");
        SimulationResult routed = simulate(route, Map.of("choice", "two"), false);
        equal(List.of("split-first"), detail(routed, "split").getActivatedBranches(), "route uses only first match");
        equal(false, detail(routed, "second").isReached(), "later route match not traversed");
        equal(null, detail(routed, "split").getExpectedCount(), "route never invents join waiting");
        ObjectNode parallel = model("PARALLEL");
        for (String branch : List.of("first", "second", "third")) edge(parallel, "split-" + branch).put("condition", "false");
        SimulationResult parallelResult = simulate(parallel, Map.of(), false);
        equal(3, detail(parallelResult, "split").getExpectedCount(), "parallel ignores conditions and excludes structural join edge");
        equal(3L, parallelResult.getPaths().stream().filter(path -> "JOINED".equals(path.getTerminationType())).count(), "parallel simulates every branch to join");
        equal(3, simulate(parallel, Map.of(), true).getPaths().size(), "all-path mode excludes structural join pointer");
        node(parallel, "join").put("type", "GATEWAY");
        equal(true, simulate(parallel, Map.of(), false).isSuccess(), "dedicated gateway join continues without an approval");
        ObjectNode branchLoop = inclusive.deepCopy();
        node(branchLoop, "first").put("type", "ROUTE");
        edge(branchLoop, "first-join").put("isDefault", true);
        ((ArrayNode) branchLoop.get("edges")).add(edge("first-first", "first", "first", false).put("condition", "true"));
        SimulationResult waiting = simulate(branchLoop, Map.of("choice", "two"), false);
        equal(false, detail(waiting, "join").isReached(), "cyclic branch never releases join");
        equal(true, waiting.getPaths().stream().anyMatch(path -> "WAITING_FOR_BRANCHES".equals(path.getTerminationType())), "incomplete branch is an explicit wait");
        equal(true, waiting.getPaths().stream().anyMatch(path -> "CYCLE".equals(path.getTerminationType())), "cyclic branch has explicit termination");
        try {
            simulate(inclusive, Map.of("_wf_waits", Map.of()), false);
            throw new AssertionError("simulation cannot accept internal variables");
        } catch (WorkflowException expected) {
            assertions++;
        }
    }

    private static SimulationResult simulate(ObjectNode model, Map<String, Object> variables, boolean allBranches) throws Exception {
        WfProcessDefinition definition = new WfProcessDefinition();
        definition.setDefinitionId("simulation-check"); definition.setModelJson(model.toString());
        IWfDefinitionService definitions = (IWfDefinitionService) Proxy.newProxyInstance(IWfDefinitionService.class.getClassLoader(),
                new Class<?>[]{IWfDefinitionService.class}, (proxy, method, arguments) -> {
                    if ("getProcessDefinition".equals(method.getName())) return definition;
                    throw new AssertionError("Unexpected definition operation: " + method.getName());
                });
        NodeExecutionServiceImpl engine = new NodeExecutionServiceImpl();
        for (Map.Entry<String, Object> dependency : Map.<String, Object>of("securityUtils", new WorkflowSecurityUtils(),
                "conditionExpressionEngine", new ConditionExpressionEngine()).entrySet()) {
            Field field = engine.getClass().getDeclaredField(dependency.getKey());
            field.setAccessible(true); field.set(engine, dependency.getValue());
        }
        SimulationServiceImpl simulation = new SimulationServiceImpl();
        for (Map.Entry<String, Object> dependency : Map.<String, Object>of("wfDefinitionService", definitions,
                "graphModelResolver", GRAPHS, "nodeExecutionService", engine).entrySet()) {
            Field field = simulation.getClass().getDeclaredField(dependency.getKey());
            field.setAccessible(true); field.set(simulation, dependency.getValue());
        }
        SimulationRequest request = new SimulationRequest();
        request.setDefinitionId(definition.getDefinitionId()); request.setVariables(variables); request.setSimulateAllBranches(allBranches);
        return simulation.simulateProcess(request);
    }

    private static SimulationNodeDetail detail(SimulationResult result, String nodeId) {
        return result.getNodeDetails().stream().filter(detail -> nodeId.equals(detail.getNodeId())).findFirst().orElseThrow();
    }

    private static ObjectNode model(String type) {
        ObjectNode model = JSON.createObjectNode();
        ArrayNode nodes = model.putArray("nodes");
        nodes.add(JSON.createObjectNode().put("id", "start").put("type", "START").put("title", "发起"));
        nodes.add(JSON.createObjectNode().put("id", "split").put("type", type).put("title", "分流").put("joinNodeKey", "join"));
        for (String nodeId : List.of("first", "second", "third", "join")) {
            nodes.add(JSON.createObjectNode().put("id", nodeId).put("type", "APPROVAL").put("title", nodeId));
        }
        nodes.add(JSON.createObjectNode().put("id", "end").put("type", "END").put("title", "结束"));
        ArrayNode edges = model.putArray("edges");
        edges.add(edge("start-split", "start", "split", false));
        for (String branch : List.of("first", "second", "third")) {
            edges.add(edge("split-" + branch, "split", branch, false));
            edges.add(edge(branch + "-join", branch, "join", false));
        }
        if ("PARALLEL".equals(type)) edges.add(edge("split-join", "split", "join", true));
        edges.add(edge("join-end", "join", "end", false));
        return model;
    }

    private static ObjectNode edge(String id, String source, String target, boolean fallback) {
        return JSON.createObjectNode().put("id", id).put("source", source).put("target", target).put("isDefault", fallback);
    }

    private static ObjectNode node(ObjectNode model, String id) {
        for (JsonNode candidate : model.get("nodes")) if (id.equals(candidate.get("id").asText())) return (ObjectNode) candidate;
        throw new AssertionError(id);
    }

    private static ObjectNode edge(ObjectNode model, String id) {
        for (JsonNode candidate : model.get("edges")) if (id.equals(candidate.get("id").asText())) return (ObjectNode) candidate;
        throw new AssertionError(id);
    }

    private static void removeEdge(ObjectNode model, String id) {
        ArrayNode edges = (ArrayNode) model.get("edges");
        for (int index = edges.size() - 1; index >= 0; index--) if (id.equals(edges.get(index).get("id").asText())) edges.remove(index);
    }

    private static void rejects(ObjectNode model, String label) {
        try { GRAPHS.parseRuntimeGraph(model.toString()); } catch (WorkflowException expected) { assertions++; return; }
        throw new AssertionError(label);
    }

    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": " + actual);
        assertions++;
    }
}
