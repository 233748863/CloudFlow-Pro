package com.cloudflow.workflow.service;

import com.cloudflow.workflow.exception.WorkflowException;

import java.util.Collection;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public final class WorkflowVariableSubstitution {
    private static final Pattern PLACEHOLDER = Pattern.compile("\\$\\{([^}]+)}");

    private WorkflowVariableSubstitution() {
    }

    public static String replace(String template, Map<String, Object> variables, Object configuredNames) {
        if (template == null) {
            return null;
        }
        Map<String, Object> available = variables == null ? Map.of() : variables;
        Set<String> allowed = configuredNames instanceof Collection<?> names
                ? names.stream().map(String::valueOf).collect(Collectors.toSet())
                : available.keySet().stream().filter(name -> name.matches("[A-Za-z][A-Za-z0-9_]*")).collect(Collectors.toSet());
        Matcher matcher = PLACEHOLDER.matcher(template);
        StringBuffer rendered = new StringBuffer();
        while (matcher.find()) {
            String name = matcher.group(1);
            if (!name.matches("[A-Za-z][A-Za-z0-9_]*") || !allowed.contains(name) || !available.containsKey(name)) {
                throw WorkflowException.validationError("变量未在允许列表中或不存在: " + name);
            }
            Object value = available.get(name);
            if (value instanceof Map<?, ?> || value instanceof Collection<?>) {
                throw WorkflowException.validationError("占位变量必须为单个值: " + name);
            }
            matcher.appendReplacement(rendered, Matcher.quoteReplacement(value == null ? "" : String.valueOf(value)));
        }
        matcher.appendTail(rendered);
        if (rendered.indexOf("${") >= 0) {
            throw WorkflowException.validationError("变量占位格式不正确");
        }
        return rendered.toString();
    }
}
