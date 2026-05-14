package com.cloudflow.workflow.service;

import com.cloudflow.workflow.config.properties.WorkflowProperties;
import com.cloudflow.workflow.exception.WorkflowException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 脚本节点执行策略。
 */
@Service
public class ScriptExecutionPolicy {

    private static final String SCRIPT_DISABLED_MESSAGE =
            "脚本节点进程内执行已禁用，请改用 API 类型或启用隔离脚本执行器";
    private static final String SCRIPT_TIMEOUT_MESSAGE =
            "脚本节点执行超时，请缩短脚本逻辑或改用 API 类型";

    private final WorkflowProperties workflowProperties;
    private final ObjectMapper objectMapper;

    public ScriptExecutionPolicy(WorkflowProperties workflowProperties, ObjectMapper objectMapper) {
        this.workflowProperties = workflowProperties;
        this.objectMapper = objectMapper;
    }

    public boolean isInProcessScriptEnabled() {
        return workflowProperties.getScript() != null && workflowProperties.getScript().isEnabled();
    }

    public boolean isInProcessScriptType(String scriptType) {
        String normalized = normalizeScriptType(scriptType);
        return "GROOVY".equals(normalized) || "JAVASCRIPT".equals(normalized);
    }

    public String normalizeScriptType(String scriptType) {
        return StringUtils.hasText(scriptType) ? scriptType.trim().toUpperCase() : "GROOVY";
    }

    public void assertInProcessScriptAllowed(String scriptType) {
        if (isInProcessScriptType(scriptType) && !isInProcessScriptEnabled()) {
            throw new WorkflowException("SCRIPT_DISABLED", SCRIPT_DISABLED_MESSAGE);
        }
    }

    public WorkflowException buildTimeoutException(Throwable cause) {
        return new WorkflowException("SCRIPT_TIMEOUT", SCRIPT_TIMEOUT_MESSAGE, cause);
    }

    public void assertModelDeployable(String modelJson) {
        if (!StringUtils.hasText(modelJson) || isInProcessScriptEnabled()) {
            return;
        }
        try {
            JsonNode nodes = objectMapper.readTree(modelJson).path("nodes");
            if (!nodes.isArray()) {
                return;
            }
            for (JsonNode node : nodes) {
                if (!"SCRIPT".equalsIgnoreCase(node.path("type").asText())) {
                    continue;
                }
                JsonNode props = node.path("props");
                String scriptType = normalizeScriptType(props.path("scriptType").asText(null));
                if (isInProcessScriptType(scriptType)) {
                    String nodeName = firstText(node.path("title").asText(null), node.path("label").asText(null), node.path("id").asText(null), "未命名脚本节点");
                    throw new WorkflowException("SCRIPT_DISABLED", "脚本节点 [" + nodeName + "] 使用 " + scriptType
                            + "，当前禁止发布进程内脚本节点，请改用 API 类型或启用隔离脚本执行器");
                }
            }
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            throw WorkflowException.validationError("脚本节点策略校验失败: " + e.getMessage());
        }
    }

    private String firstText(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value;
            }
        }
        return null;
    }
}
