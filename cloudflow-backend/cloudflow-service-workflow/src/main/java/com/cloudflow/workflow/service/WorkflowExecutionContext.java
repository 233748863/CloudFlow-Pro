package com.cloudflow.workflow.service;

import com.cloudflow.workflow.exception.WorkflowException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Supplier;

public final class WorkflowExecutionContext {
    private static final ThreadLocal<Frame> CURRENT = new ThreadLocal<>();
    private static final ObjectMapper JSON = new ObjectMapper();

    private WorkflowExecutionContext() {
    }

    public record Frame(String activationId, String branchKey, Frame parent) {
    }

    public static Frame current() {
        return CURRENT.get();
    }

    public static String capture() {
        return encode(current());
    }

    public static boolean within(Frame frame, Frame scope) {
        if (scope == null) return true;
        for (Frame current = frame; current != null; current = current.parent()) {
            if (Objects.equals(current, scope)) return true;
        }
        return false;
    }

    public static String encode(Frame frame) {
        if (frame == null) return null;
        validate(frame);
        try {
            return JSON.writeValueAsString(frame);
        } catch (Exception failure) {
            throw invalid();
        }
    }

    public static Frame parse(String encoded) {
        if (encoded == null) return null;
        try {
            Frame frame = JSON.readValue(encoded, Frame.class);
            if (frame == null) throw invalid();
            validate(frame);
            return frame;
        } catch (Exception failure) {
            throw invalid();
        }
    }

    public static <Result> Result call(Frame frame, Supplier<Result> action) {
        validate(frame);
        Frame previous = current();
        if (frame == null) CURRENT.remove(); else CURRENT.set(frame);
        try {
            return action.get();
        } finally {
            if (previous == null) CURRENT.remove(); else CURRENT.set(previous);
        }
    }

    public static void run(Frame frame, Runnable action) {
        call(frame, () -> {
            action.run();
            return null;
        });
    }

    public static Map<String, Object> copyVariables(Map<String, Object> variables) {
        Map<String, Object> copied = new LinkedHashMap<>();
        if (variables != null) variables.forEach((key, value) -> copied.put(key, copyValue(value)));
        return copied;
    }

    public static void assertNoOverrides(Map<String, ?> variables) {
        if (variables != null && variables.keySet().stream().anyMatch(key -> key != null && key.startsWith("_wf_"))) {
            throw WorkflowException.validationError("业务操作不能携带流程执行记录或等待状态");
        }
    }

    private static Object copyValue(Object value) {
        if (value instanceof Map<?, ?> source) {
            Map<Object, Object> copied = new LinkedHashMap<>();
            source.forEach((key, child) -> copied.put(key, copyValue(child)));
            return copied;
        }
        if (value instanceof List<?> source) {
            List<Object> copied = new ArrayList<>(source.size());
            source.forEach(child -> copied.add(copyValue(child)));
            return copied;
        }
        return value;
    }

    private static void validate(Frame frame) {
        Set<String> activations = new HashSet<>();
        for (Frame current = frame; current != null; current = current.parent()) {
            if (current.activationId() == null || current.activationId().isBlank() || current.activationId().length() > 64
                    || current.branchKey() == null || current.branchKey().isBlank() || current.branchKey().length() > 64
                    || !activations.add(current.activationId()) || activations.size() > 64) throw invalid();
        }
    }

    public static WorkflowException invalid() {
        return new WorkflowException("GATEWAY_CONTEXT_INVALID", "流程分支执行记录无效，请重新读取流程状态");
    }
}
