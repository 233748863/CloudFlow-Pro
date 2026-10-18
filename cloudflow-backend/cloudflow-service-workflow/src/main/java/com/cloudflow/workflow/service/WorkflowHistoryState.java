package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class WorkflowHistoryState {
    public static final String METADATA = "_wf_execution";
    private static final String SEQUENCE = "_wf_history_sequence";
    private static final String INVALIDATED = "_wf_invalidated_histories";
    private static final ObjectMapper JSON = new ObjectMapper();
    private final WfProcessInstanceMapper instances;

    public record Execution(long sequence, String executionContext) {
        public Execution {
            if (sequence < 1) throw WorkflowExecutionContext.invalid();
            WorkflowExecutionContext.parse(executionContext);
        }

        public WorkflowExecutionContext.Frame context() {
            return WorkflowExecutionContext.parse(executionContext);
        }
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void recordDetails(WfProcessInstance instance, WfTask task, WfTaskHistory history, Map<String, Object> details) {
        try {
            history.setVariablesChanged(JSON.writeValueAsString(details));
        } catch (Exception failure) {
            throw WorkflowExecutionContext.invalid();
        }
        record(instance, task, history);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(WfProcessInstance instance, WfTask task, WfTaskHistory history) {
        WorkflowImCompletionContext.correlate(task, history);
        Map<String, Object> variables = WorkflowWaitState.variables(instance);
        long sequence = Math.addExact(((Number) variables.getOrDefault(SEQUENCE, 0L)).longValue(), 1L);
        Map<String, Object> metadata = metadata(history.getVariablesChanged());
        metadata.put(METADATA, new Execution(sequence, task.getExecutionContext()));
        try {
            history.setVariablesChanged(JSON.writeValueAsString(metadata));
        } catch (Exception failure) {
            throw WorkflowExecutionContext.invalid();
        }
        variables.put(SEQUENCE, sequence);
        save(instance, variables);
        if (instances.updateById(instance) != 1) throw WorkflowException.invalidState("审批执行记录已变更，请重新读取");
    }

    public static Execution execution(WfTaskHistory history) {
        Object raw = metadata(history.getVariablesChanged()).get(METADATA);
        if (raw == null) return null;
        try {
            return JSON.convertValue(raw, Execution.class);
        } catch (Exception failure) {
            throw WorkflowExecutionContext.invalid();
        }
    }

    public static boolean approval(WfTaskHistory history) {
        return Set.of("APPROVE", "COUNTERSIGN_APPROVE").contains(history.getAction() == null ? "" : history.getAction());
    }

    public static boolean effectiveApproval(WfProcessInstance instance, WfTaskHistory history) {
        return history != null && approval(history) && execution(history) != null
                && !invalidated(instance).contains(history.getHistoryId());
    }

    public static Set<String> invalidated(WfProcessInstance instance) {
        Object raw = WorkflowWaitState.variables(instance).get(INVALIDATED);
        if (raw == null) return new LinkedHashSet<>();
        if (!(raw instanceof List<?> values) || values.stream().anyMatch(value -> !(value instanceof String))) {
            throw WorkflowExecutionContext.invalid();
        }
        Set<String> result = new LinkedHashSet<>();
        for (Object value : values) result.add((String) value);
        return result;
    }

    public static void invalidate(WfProcessInstance instance, Collection<String> historyIds) {
        Set<String> invalidated = invalidated(instance);
        invalidated.addAll(historyIds);
        Map<String, Object> variables = WorkflowWaitState.variables(instance);
        variables.put(INVALIDATED, List.copyOf(invalidated));
        save(instance, variables);
    }

    static boolean manages(String key) {
        return SEQUENCE.equals(key) || INVALIDATED.equals(key);
    }

    private static void save(WfProcessInstance instance, Map<String, Object> variables) {
        try {
            instance.setVariables(JSON.writeValueAsString(variables));
        } catch (Exception failure) {
            throw WorkflowExecutionContext.invalid();
        }
    }

    public static Map<String, Object> metadata(String encoded) {
        if (encoded == null || encoded.isBlank()) return new LinkedHashMap<>();
        try {
            Map<String, Object> metadata = JSON.readValue(encoded, new TypeReference<>() {});
            if (metadata == null) throw WorkflowExecutionContext.invalid();
            return metadata;
        } catch (Exception failure) {
            throw WorkflowExecutionContext.invalid();
        }
    }
}
