package com.cloudflow.workflow.handler.impl;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.handler.INodeHandler;
import com.cloudflow.workflow.service.HttpClientService;
import com.cloudflow.workflow.service.ScriptExecutionService;
import com.cloudflow.workflow.service.ScriptExecutionPolicy;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.Map;

/**
 * 脚本节点处理器。
 * 支持 Groovy、JavaScript 和 API 三种执行方式。
 */
@Component
@RequiredArgsConstructor
public class ScriptNodeHandler implements INodeHandler {

    private static final Logger log = LoggerFactory.getLogger(ScriptNodeHandler.class);

    private final ScriptExecutionService scriptExecutionService;
    private final ScriptExecutionPolicy scriptExecutionPolicy;
    private final HttpClientService httpClientService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public String getNodeType() {
        return "SCRIPT";
    }

    @Override
    public boolean handle(WfNodeConfig node, WfProcessInstance instance, Map<String, Object> variables) {
        try {
            log.info("[ScriptNodeHandler] 执行脚本节点, nodeKey={}, instanceId={}", node.getId(), instance.getInstanceId());

            Map<String, Object> props = node.getProps();
            if (props == null) {
                log.warn("[ScriptNodeHandler] 脚本节点未配置属性, nodeKey={}", node.getId());
                return true;
            }

            String scriptType = scriptExecutionPolicy.normalizeScriptType((String) props.get("scriptType"));
            switch (scriptType) {
                case "API":
                    handleApiCall(node, props, variables);
                    break;
                case "GROOVY":
                    scriptExecutionPolicy.assertInProcessScriptAllowed(scriptType);
                    handleGroovyScript(node, props, variables);
                    break;
                case "JAVASCRIPT":
                    scriptExecutionPolicy.assertInProcessScriptAllowed(scriptType);
                    handleJavaScript(node, props, variables);
                    break;
                default:
                    log.warn("[ScriptNodeHandler] 未知脚本类型: {}", scriptType);
            }

            log.info("[ScriptNodeHandler] 脚本节点执行完成, nodeKey={}", node.getId());
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            log.error("[ScriptNodeHandler] 脚本节点执行失败, nodeKey={}: {}", node.getId(), e.getMessage(), e);
            Map<String, Object> props = node.getProps();
            Boolean continueOnError = props != null ? (Boolean) props.getOrDefault("continueOnError", true) : true;
            if (!continueOnError) {
                throw new WorkflowException("SCRIPT_EXECUTION_FAILED", "脚本节点执行失败: " + e.getMessage(), e);
            }
        }
        return true;
    }

    private void handleApiCall(WfNodeConfig node, Map<String, Object> props, Map<String, Object> variables) {
        String apiUrl = (String) props.get("apiUrl");
        String apiMethod = (String) props.getOrDefault("apiMethod", "POST");
        if (!StringUtils.hasText(apiUrl)) {
            return;
        }

        log.info("[ScriptNodeHandler] 执行 API 调用, url={}, method={}", apiUrl, apiMethod);

        Map<String, String> headers = new HashMap<>();
        if (props.containsKey("apiHeaders")) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, String> configHeaders = (Map<String, String>) props.get("apiHeaders");
                if (configHeaders != null) {
                    headers.putAll(configHeaders);
                }
            } catch (Exception e) {
                log.warn("[ScriptNodeHandler] 解析请求头失败: {}", e.getMessage());
            }
        }
        headers.putIfAbsent("Content-Type", "application/json");

        Map<String, Object> requestBody = buildApiRequestBody(props.get("apiBody"), variables);
        HttpClientService.ApiResponse response = httpClientService.executeRequest(apiUrl, apiMethod, headers, requestBody);

        log.info("[ScriptNodeHandler] API 调用完成, statusCode={}", response.getStatusCode());
        if (variables != null) {
            variables.put("_apiResponse_" + node.getId(), response.getBody());
            variables.put("_apiStatusCode_" + node.getId(), response.getStatusCode());
        }

        if (!response.isSuccess()) {
            Boolean continueOnError = (Boolean) props.getOrDefault("continueOnError", true);
            if (!continueOnError) {
                throw new WorkflowException("API_CALL_FAILED", "API 调用失败: HTTP " + response.getStatusCode());
            }
        }
    }

    private void handleGroovyScript(WfNodeConfig node, Map<String, Object> props, Map<String, Object> variables) {
        String scriptContent = decodeHtmlEntities((String) props.get("scriptContent"));
        if (!StringUtils.hasText(scriptContent)) {
            return;
        }
        Object result = scriptExecutionService.executeGroovyScript(scriptContent, variables);
        storeScriptResult(node, variables, result);
        log.info("[ScriptNodeHandler] Groovy 脚本执行完成, result={}", result);
    }

    private void handleJavaScript(WfNodeConfig node, Map<String, Object> props, Map<String, Object> variables) {
        String scriptContent = decodeHtmlEntities((String) props.get("scriptContent"));
        if (!StringUtils.hasText(scriptContent)) {
            return;
        }
        Object result = scriptExecutionService.executeJavaScript(scriptContent, variables);
        storeScriptResult(node, variables, result);
        log.info("[ScriptNodeHandler] JavaScript 脚本执行完成, result={}", result);
    }

    private Map<String, Object> buildApiRequestBody(Object rawApiBody, Map<String, Object> variables) {
        if (rawApiBody == null) {
            return null;
        }
        if (rawApiBody instanceof Map<?, ?> rawMap) {
            Map<String, Object> copied = new HashMap<>();
            for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
                if (entry.getKey() != null) {
                    copied.put(String.valueOf(entry.getKey()), entry.getValue());
                }
            }
            return variables != null ? replaceVariables(copied, variables) : copied;
        }
        if (rawApiBody instanceof String rawText) {
            String replaced = replaceVariablesInString(decodeHtmlEntities(rawText), variables);
            if (!StringUtils.hasText(replaced)) {
                return null;
            }
            try {
                return objectMapper.readValue(replaced, new TypeReference<Map<String, Object>>() {});
            } catch (Exception e) {
                throw new WorkflowException("API_BODY_INVALID", "API 请求体不是合法 JSON: " + e.getMessage(), e);
            }
        }
        throw new WorkflowException("API_BODY_INVALID", "暂不支持的 API 请求体类型: " + rawApiBody.getClass().getSimpleName());
    }

    private void storeScriptResult(WfNodeConfig node, Map<String, Object> variables, Object result) {
        if (variables == null || result == null) {
            return;
        }
        variables.put("_scriptResult_" + node.getId(), result);
        if (result instanceof Map<?, ?> resultMap) {
            for (Map.Entry<?, ?> entry : resultMap.entrySet()) {
                if (entry.getKey() != null) {
                    variables.put(String.valueOf(entry.getKey()), entry.getValue());
                }
            }
        }
    }

    /**
     * 递归替换请求体中的变量引用。
     */
    private Map<String, Object> replaceVariables(Map<String, Object> map, Map<String, Object> variables) {
        Map<String, Object> result = new HashMap<>();
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            Object value = entry.getValue();
            if (value instanceof String) {
                result.put(entry.getKey(), replaceVariablesInString((String) value, variables));
            } else if (value instanceof Map<?, ?> nested) {
                Map<String, Object> nestedMap = new HashMap<>();
                for (Map.Entry<?, ?> nestedEntry : nested.entrySet()) {
                    if (nestedEntry.getKey() != null) {
                        nestedMap.put(String.valueOf(nestedEntry.getKey()), nestedEntry.getValue());
                    }
                }
                result.put(entry.getKey(), replaceVariables(nestedMap, variables));
            } else {
                result.put(entry.getKey(), value);
            }
        }
        return result;
    }

    private String replaceVariablesInString(String source, Map<String, Object> variables) {
        if (source == null || variables == null || variables.isEmpty()) {
            return source;
        }
        String replaced = source;
        for (Map.Entry<String, Object> var : variables.entrySet()) {
            replaced = replaced.replace("${" + var.getKey() + "}", String.valueOf(var.getValue()));
        }
        return replaced;
    }

    private String decodeHtmlEntities(String source) {
        if (!StringUtils.hasText(source)) {
            return source;
        }
        return source
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&amp;", "&");
    }
}
