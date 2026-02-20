package com.cloudflow.workflow.handler.impl;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.handler.INodeHandler;
import com.cloudflow.workflow.service.HttpClientService;
import com.cloudflow.workflow.service.ScriptExecutionService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.Map;

/**
 * 脚本节点处理器
 * 支持 Groovy/JavaScript/API 三种执行模式
 *
 * @author CloudFlow
 */
@Component
@RequiredArgsConstructor
public class ScriptNodeHandler implements INodeHandler {

    private static final Logger log = LoggerFactory.getLogger(ScriptNodeHandler.class);

    private final ScriptExecutionService scriptExecutionService;
    private final HttpClientService httpClientService;

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

            String scriptType = (String) props.getOrDefault("scriptType", "GROOVY");

            switch (scriptType) {
                case "API":
                    handleApiCall(node, props, variables);
                    break;
                case "GROOVY":
                    handleGroovyScript(node, props, variables);
                    break;
                case "JAVASCRIPT":
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
        return true; // 自动继续流转
    }

    /**
     * 处理 API 调用模式
     */
    private void handleApiCall(WfNodeConfig node, Map<String, Object> props, Map<String, Object> variables) {
        String apiUrl = (String) props.get("apiUrl");
        String apiMethod = (String) props.getOrDefault("apiMethod", "POST");

        if (!StringUtils.hasText(apiUrl)) return;

        log.info("[ScriptNodeHandler] 执行API调用, url={}, method={}", apiUrl, apiMethod);

        // 准备请求头
        Map<String, String> headers = new HashMap<>();
        if (props.containsKey("apiHeaders")) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, String> configHeaders = (Map<String, String>) props.get("apiHeaders");
                if (configHeaders != null) headers.putAll(configHeaders);
            } catch (Exception e) {
                log.warn("[ScriptNodeHandler] 解析请求头失败: {}", e.getMessage());
            }
        }
        headers.putIfAbsent("Content-Type", "application/json");

        // 准备请求体，替换变量引用
        @SuppressWarnings("unchecked")
        Map<String, Object> requestBody = props.containsKey("apiBody") ? (Map<String, Object>) props.get("apiBody") : null;
        if (requestBody != null && variables != null) {
            requestBody = replaceVariables(requestBody, variables);
        }

        // 执行请求
        HttpClientService.ApiResponse response = httpClientService.executeRequest(apiUrl, apiMethod, headers, requestBody);

        log.info("[ScriptNodeHandler] API调用完成, statusCode={}", response.getStatusCode());

        // 存储响应到变量
        if (variables != null) {
            variables.put("_apiResponse_" + node.getId(), response.getBody());
            variables.put("_apiStatusCode_" + node.getId(), response.getStatusCode());
        }

        if (!response.isSuccess()) {
            Boolean continueOnError = (Boolean) props.getOrDefault("continueOnError", true);
            if (!continueOnError) {
                throw new WorkflowException("API_CALL_FAILED", "API调用失败: HTTP " + response.getStatusCode());
            }
        }
    }

    /**
     * 处理 Groovy 脚本模式
     */
    private void handleGroovyScript(WfNodeConfig node, Map<String, Object> props, Map<String, Object> variables) {
        String scriptContent = (String) props.get("scriptContent");
        if (!StringUtils.hasText(scriptContent)) return;

        Object result = scriptExecutionService.executeGroovyScript(scriptContent, variables);
        if (variables != null && result != null) {
            variables.put("_scriptResult_" + node.getId(), result);
        }
        log.info("[ScriptNodeHandler] Groovy脚本执行完成, result={}", result);
    }

    /**
     * 处理 JavaScript 脚本模式
     */
    private void handleJavaScript(WfNodeConfig node, Map<String, Object> props, Map<String, Object> variables) {
        String scriptContent = (String) props.get("scriptContent");
        if (!StringUtils.hasText(scriptContent)) return;

        Object result = scriptExecutionService.executeJavaScript(scriptContent, variables);
        if (variables != null && result != null) {
            variables.put("_scriptResult_" + node.getId(), result);
        }
        log.info("[ScriptNodeHandler] JavaScript脚本执行完成, result={}", result);
    }

    /**
     * 替换 Map 中的 ${variable} 变量引用
     */
    private Map<String, Object> replaceVariables(Map<String, Object> map, Map<String, Object> variables) {
        Map<String, Object> result = new HashMap<>();
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            Object value = entry.getValue();
            if (value instanceof String) {
                String strValue = (String) value;
                for (Map.Entry<String, Object> var : variables.entrySet()) {
                    strValue = strValue.replace("${" + var.getKey() + "}", String.valueOf(var.getValue()));
                }
                result.put(entry.getKey(), strValue);
            } else if (value instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> nested = (Map<String, Object>) value;
                result.put(entry.getKey(), replaceVariables(nested, variables));
            } else {
                result.put(entry.getKey(), value);
            }
        }
        return result;
    }
}
