package com.cloudflow.workflow.service;

import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class WorkflowTriggerExecutor {
    private final HttpClientService http;
    private final WorkflowTriggerSecrets secrets;
    private final MessageSender messages;
    private final SysUserMapper users;
    private final ObjectMapper mapper;

    public Map<String, Object> prepare(WfNodeConfig node, WfProcessInstance instance, Map<String, Object> variables) {
        Map<String, Object> props = node.getProps();
        validate(node);
        Map<String, Object> request = new HashMap<>();
        String type = String.valueOf(props.getOrDefault("triggerType", "HTTP_CALLBACK"));
        Object allowed = props.get("allowedVariables");
        request.put("type", type);
        request.put("tenantId", instance.getTenantId());
        request.put("nodeKey", node.getId());
        request.put("definitionId", instance.getDefinitionId());
        request.put("failStrategy", failureStrategy(props));
        request.put("retryCount", integer(props, "retryCount", 0, 0, 5));
        request.put("timeoutMillis", integer(props, "timeoutSeconds", 10, 1, 60) * 1000);
        String bodyKey = props.containsKey("actionBody") ? "actionBody" : "apiBody";
        request.put("body", body(props.get(bodyKey), variables, allowed, "apiBody".equals(bodyKey)));
        if (!"MESSAGE".equals(type)) {
            String url = String.valueOf(props.getOrDefault("actionUrl", props.getOrDefault("apiUrl", "")));
            request.put("url", WorkflowVariableSubstitution.replace(props.containsKey("actionUrl") ? url : HtmlUtils.htmlUnescape(url), variables, allowed));
            request.put("method", props.getOrDefault("actionMethod", props.getOrDefault("apiMethod", "POST")));
            String headerKey = props.containsKey("actionHeaders") ? "actionHeaders" : "apiHeaders";
            Map<String, String> headers = new HashMap<>();
            secrets.headers(props, headerKey).forEach((name, value) -> headers.put(name,
                    WorkflowVariableSubstitution.replace(value, variables, allowed)));
            headers.putIfAbsent("Content-Type", "application/json");
            request.put("headers", headers);
        }
        return request;
    }

    public HttpClientService.ApiResponse execute(Map<String, Object> request, String requestId, long timeoutMillis) {
        Map<String, Object> body = mapper.convertValue(request.get("body"), new TypeReference<Map<String, Object>>() {});
        if ("MESSAGE".equals(request.get("type"))) {
            if (body == null || !(body.get("recipientIds") instanceof List<?> recipients) || recipients.isEmpty()
                    || body.get("title") == null || body.get("content") == null) {
                throw WorkflowException.validationError("消息触发请求体必须包含recipientIds、title和content");
            }
            Long tenantId = new BigDecimal(String.valueOf(request.get("tenantId"))).longValueExact();
            for (Object identifier : recipients) {
                Long userId = new BigDecimal(String.valueOf(identifier)).longValueExact();
                SysUser user = users.selectById(userId);
                if (user == null || !Objects.equals(user.getTenantId(), tenantId) || !"0".equals(user.getStatus())) {
                    throw WorkflowException.validationError("消息接收人不存在、已停用或属于其他租户");
                }
            }
            for (Object identifier : recipients) {
                messages.send(new BigDecimal(String.valueOf(identifier)).longValueExact(), String.valueOf(body.get("title")),
                        String.valueOf(body.get("content")), "1", 0L, "工作流触发节点");
            }
            return new HttpClientService.ApiResponse(200, "消息已进入发送队列", true);
        }
        Map<String, String> headers = mapper.convertValue(request.get("headers"), new TypeReference<Map<String, String>>() {});
        if (headers == null) headers = new HashMap<>();
        headers.put("X-Workflow-Trigger-Id", requestId);
        return http.executeRequest(String.valueOf(request.get("url")), String.valueOf(request.get("method")), headers, body, timeoutMillis);
    }

    public static String failureStrategy(Map<String, Object> props) {
        return String.valueOf(props.getOrDefault("failStrategy", Boolean.TRUE.equals(props.get("continueOnError")) ? "SKIP" : "BLOCK"));
    }

    public static void validate(WfNodeConfig node) {
        if (!"SCRIPT".equals(node.getType()) || node.getProps() == null) return;
        Map<String, Object> props = node.getProps();
        if (props.containsKey("triggerType") && !Set.of("HTTP_CALLBACK", "INNER_SERVICE", "MESSAGE").contains(String.valueOf(props.get("triggerType")))) {
            throw WorkflowException.validationError("未知触发节点类型");
        }
        if (!Set.of("BLOCK", "SKIP", "TO_DLQ").contains(failureStrategy(props))) throw WorkflowException.validationError("未知触发失败策略");
        integer(props, "retryCount", 0, 0, 5);
        integer(props, "timeoutSeconds", 10, 1, 60);
    }

    private Map<String, Object> body(Object value, Map<String, Object> variables, Object allowed, boolean encoded) {
        if (value == null || "".equals(value)) return null;
        try {
            Object parsed = value instanceof String text ? mapper.readValue(encoded ? HtmlUtils.htmlUnescape(text) : text, Object.class) : value;
            if (!(parsed instanceof Map<?, ?>)) throw new IllegalArgumentException();
            return mapper.convertValue(replace(parsed, variables, allowed, encoded && !(value instanceof String)), new TypeReference<Map<String, Object>>() {});
        } catch (WorkflowException failure) {
            throw failure;
        } catch (Exception failure) {
            throw WorkflowException.validationError("触发请求体必须为JSON对象，占位变量请放在字符串中");
        }
    }

    private Object replace(Object value, Map<String, Object> variables, Object allowed, boolean decode) {
        if (value instanceof String text) return WorkflowVariableSubstitution.replace(decode ? HtmlUtils.htmlUnescape(text) : text, variables, allowed);
        if (value instanceof Map<?, ?> values) {
            Map<String, Object> replaced = new HashMap<>();
            values.forEach((name, entry) -> replaced.put(String.valueOf(name), replace(entry, variables, allowed, decode)));
            return replaced;
        }
        if (value instanceof List<?> entries) {
            List<Object> replaced = new ArrayList<>();
            entries.forEach(entry -> replaced.add(replace(entry, variables, allowed, decode)));
            return replaced;
        }
        return value;
    }

    private static int integer(Map<String, Object> props, String name, int defaultValue, int minimum, int maximum) {
        try {
            int value = new BigDecimal(String.valueOf(props.getOrDefault(name, defaultValue))).intValueExact();
            if (value >= minimum && value <= maximum) return value;
        } catch (RuntimeException ignored) {
        }
        throw WorkflowException.validationError(name + "必须为" + minimum + "至" + maximum + "之间的整数");
    }
}
