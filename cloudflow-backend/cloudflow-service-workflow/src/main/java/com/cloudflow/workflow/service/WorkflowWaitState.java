package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.exception.WorkflowException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public final class WorkflowWaitState {
    public static final String VARIABLE = "_wf_waits";
    public static final String FAILED_CONTEXT = "_wf_failed_execution_context";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> KINDS = Set.of("TIMER", "TRIGGER", "SUBPROCESS");

    private WorkflowWaitState() {
    }

    public record Pending(String waitId, String kind, String nodeKey, String executionContext, Map<String, Object> payload) {
        public Pending {
            if (waitId == null || waitId.isBlank() || waitId.length() > 64 || !KINDS.contains(kind)
                    || nodeKey == null || nodeKey.isBlank() || nodeKey.length() > 64 || payload == null) {
                throw invalid();
            }
            WorkflowExecutionContext.parse(executionContext);
            payload = java.util.Collections.unmodifiableMap(WorkflowExecutionContext.copyVariables(payload));
        }

        public WorkflowExecutionContext.Frame context() {
            return WorkflowExecutionContext.parse(executionContext);
        }
    }

    public static Map<String, Object> variables(WfProcessInstance instance) {
        if (instance.getVariables() == null || instance.getVariables().isBlank()) return new LinkedHashMap<>();
        try {
            Map<String, Object> values = JSON.readValue(instance.getVariables(), new TypeReference<>() {});
            if (values == null) throw invalid();
            return values;
        } catch (Exception failure) {
            throw invalid();
        }
    }

    public static List<Pending> list(WfProcessInstance instance, String kind) {
        return entries(variables(instance)).values().stream().filter(entry -> kind == null || kind.equals(entry.kind())).toList();
    }

    public static Pending find(WfProcessInstance instance, String waitId) {
        return entries(variables(instance)).get(waitId);
    }

    public static Pending register(WfProcessInstance instance, Map<String, Object> variables, String waitId,
                                   String kind, String nodeKey, Map<String, Object> payload) {
        Map<String, Object> values = merged(instance, variables);
        Map<String, Pending> waits = entries(values);
        Pending pending = new Pending(waitId, kind, nodeKey, WorkflowExecutionContext.capture(), payload);
        if (waits.containsKey(waitId) || waits.values().stream().anyMatch(entry -> kind.equals(entry.kind())
                && nodeKey.equals(entry.nodeKey()) && Objects.equals(entry.executionContext(), pending.executionContext()))) {
            throw WorkflowException.invalidState("当前分支节点已经处于等待中");
        }
        waits.put(waitId, pending);
        store(instance, values, waits);
        return pending;
    }

    public static Pending change(WfProcessInstance instance, Map<String, Object> variables, Pending pending, Map<String, Object> payload) {
        Map<String, Object> values = merged(instance, variables);
        Map<String, Pending> waits = entries(values);
        if (!Objects.equals(waits.get(pending.waitId()), pending)) throw invalid();
        Pending changed = new Pending(pending.waitId(), pending.kind(), pending.nodeKey(), pending.executionContext(), payload);
        waits.put(changed.waitId(), changed);
        store(instance, values, waits);
        return changed;
    }

    public static void finish(WfProcessInstance instance, Map<String, Object> variables, String waitId) {
        Map<String, Object> values = merged(instance, variables);
        Map<String, Pending> waits = entries(values);
        if (waits.remove(waitId) == null) throw invalid();
        store(instance, values, waits);
    }

    public static void save(WfProcessInstance instance, Map<String, Object> variables) {
        Map<String, Object> values = merged(instance, variables);
        store(instance, values, entries(values));
    }

    public static void clear(WfProcessInstance instance) {
        store(instance, variables(instance), Map.of());
    }

    public static Map<String, Object> childVariables(Map<String, Object> source) {
        Map<String, Object> copied = WorkflowExecutionContext.copyVariables(source);
        copied.keySet().removeIf(key -> key.startsWith("_wf_"));
        copied.remove(INodeExecutionService.FAILED_NODE_KEY_VARIABLE);
        return copied;
    }

    private static Map<String, Object> merged(WfProcessInstance instance, Map<String, Object> variables) {
        Map<String, Object> values = variables(instance);
        if (variables != null) variables.forEach((key, value) -> {
            if (!VARIABLE.equals(key) && !WorkflowHistoryState.manages(key)) values.put(key, value);
        });
        return values;
    }

    private static Map<String, Pending> entries(Map<String, Object> variables) {
        Object raw = variables.get(VARIABLE);
        if (raw == null) return new LinkedHashMap<>();
        try {
            Map<String, Pending> waits = JSON.convertValue(raw, new TypeReference<>() {});
            if (waits == null || waits.entrySet().stream().anyMatch(entry -> entry.getValue() == null
                    || !entry.getKey().equals(entry.getValue().waitId()))) throw invalid();
            return waits;
        } catch (Exception failure) {
            throw invalid();
        }
    }

    private static void store(WfProcessInstance instance, Map<String, Object> values, Map<String, Pending> waits) {
        if (waits.isEmpty()) values.remove(VARIABLE); else values.put(VARIABLE, waits);
        try {
            instance.setVariables(JSON.writeValueAsString(values));
        } catch (Exception failure) {
            throw invalid();
        }
    }

    private static WorkflowException invalid() {
        return WorkflowException.invalidState("流程持久等待记录无效，请核对流程执行状态");
    }
}
