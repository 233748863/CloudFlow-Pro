package com.cloudflow.workflow.validator;

import com.cloudflow.workflow.exception.WorkflowException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * P3.1: JSON Schema 验证器
 * 用于验证流程定义和表单定义的 JSON 结构
 */
@Component
public class JsonSchemaValidator {
    
    private static final Logger log = LoggerFactory.getLogger(JsonSchemaValidator.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    
    /**
     * 1.A: 验证流程定义 JSON 结构
     */
    public void validateProcessDefinitionJson(String modelJson) {
        if (modelJson == null || modelJson.trim().isEmpty()) {
            throw WorkflowException.validationError("流程定义JSON不能为空");
        }
        
        try {
            JsonNode root = objectMapper.readTree(modelJson);
            
            // 验证必需字段
            if (!root.has("id")) {
                throw WorkflowException.validationError("流程定义缺少id字段");
            }
            if (!root.has("type")) {
                throw WorkflowException.validationError("流程定义缺少type字段");
            }
            
            // 验证节点连接完整性
            validateNodeConnectivity(root);
            
            // 检测循环
            detectCycles(root);
            
            // 检测孤立节点
            detectOrphanNodes(root);
            
            log.info("[validateProcessDefinitionJson] 流程定义JSON验证通过");
            
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            log.error("[validateProcessDefinitionJson] JSON解析失败: {}", e.getMessage());
            throw WorkflowException.validationError("流程定义JSON格式错误: " + e.getMessage());
        }
    }
    
    /**
     * 3.A: 验证表单 Schema
     */
    public void validateFormSchema(String formSchema) {
        if (formSchema == null || formSchema.trim().isEmpty()) {
            throw WorkflowException.validationError("表单Schema不能为空");
        }
        
        try {
            JsonNode root = objectMapper.readTree(formSchema);
            
            if (!root.isArray()) {
                throw WorkflowException.validationError("表单Schema必须是数组格式");
            }
            
            Set<String> fieldIds = new HashSet<>();
            
            for (JsonNode field : root) {
                // 验证必需字段
                if (!field.has("id")) {
                    throw WorkflowException.validationError("表单字段缺少id");
                }
                if (!field.has("type")) {
                    throw WorkflowException.validationError("表单字段缺少type");
                }
                if (!field.has("label")) {
                    throw WorkflowException.validationError("表单字段缺少label");
                }
                
                String fieldId = field.get("id").asText();
                
                // 3.B: 字段ID唯一性检查
                if (fieldIds.contains(fieldId)) {
                    throw WorkflowException.validationError("表单字段ID重复: " + fieldId);
                }
                fieldIds.add(fieldId);
                
                // 验证字段类型
                String fieldType = field.get("type").asText();
                if (!isValidFieldType(fieldType)) {
                    throw WorkflowException.validationError("不支持的字段类型: " + fieldType);
                }
            }
            
            log.info("[validateFormSchema] 表单Schema验证通过, 字段数: {}", fieldIds.size());
            
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            log.error("[validateFormSchema] JSON解析失败: {}", e.getMessage());
            throw WorkflowException.validationError("表单Schema格式错误: " + e.getMessage());
        }
    }
    
    /**
     * 验证节点连接完整性
     */
    private void validateNodeConnectivity(JsonNode node) {
        String type = node.has("type") ? node.get("type").asText() : "";
        
        // APPROVAL节点可以是流程的最后一个节点，不强制要求有next
        // 只有当它既没有next也没有branches，且不是END类型时才需要警告
        // 但不应该抛出异常，因为审批节点可以作为流程的结束节点
        
        // GATEWAY节点必须有branches
        // 注意：CONDITION 类型在前端数据模型中既可以作为独立的条件网关（此时需要有branches），
        // 也可以作为分支的子节点（此时不需要有branches，只需要有condition表达式）。
        // 因此只对 GATEWAY 类型强制要求有 branches，CONDITION 类型不强制要求。
        if ("GATEWAY".equals(type)) {
            if (!node.has("branches") || !node.get("branches").isArray() || node.get("branches").size() == 0) {
                throw WorkflowException.validationError("网关节点必须有分支");
            }
        }
        
        // PARALLEL 类型有两种用法：
        // 1. 会签模式（signType 为 ALL/ANY/PERCENT/SEQUENTIAL）：多人审批，不需要分支
        // 2. 并行网关模式（有 branches 且无 signType）：多条分支并行执行
        // 如果既没有 signType 也没有 branches，默认视为会签模式（全签），不报错
        if ("PARALLEL".equals(type)) {
            boolean hasBranches = node.has("branches") && node.get("branches").isArray() && node.get("branches").size() > 0;
            boolean isCountersignMode = isCountersignNode(node);
            // 只有明确配置了分支但分支为空的情况才报错（理论上不会出现）
            // 没有分支 + 没有会签配置 = 默认当作会签节点（全签模式）
            if (hasBranches && isCountersignMode) {
                // 会签模式不应该有分支，这在 WfDefinitionServiceImpl.validateNodeConnections 中已校验
                log.warn("[validateNodeConnectivity] PARALLEL 节点同时有 signType 和 branches，将在后续校验中处理");
            }
        }
        
        // 递归验证子节点
        if (node.has("next")) {
            validateNodeConnectivity(node.get("next"));
        }
        if (node.has("branches")) {
            for (JsonNode branch : node.get("branches")) {
                validateNodeConnectivity(branch);
            }
        }
    }
    
    /**
     * 检测循环
     */
    private void detectCycles(JsonNode root) {
        Set<String> visited = new HashSet<>();
        Set<String> recursionStack = new HashSet<>();
        detectCyclesHelper(root, visited, recursionStack);
    }
    
    private void detectCyclesHelper(JsonNode node, Set<String> visited, Set<String> recursionStack) {
        if (node == null || !node.has("id")) {
            return;
        }
        
        String nodeId = node.get("id").asText();
        
        if (recursionStack.contains(nodeId)) {
            throw WorkflowException.validationError("检测到循环流程: " + nodeId);
        }
        
        if (visited.contains(nodeId)) {
            return;
        }
        
        visited.add(nodeId);
        recursionStack.add(nodeId);
        
        if (node.has("next")) {
            detectCyclesHelper(node.get("next"), visited, recursionStack);
        }
        if (node.has("branches")) {
            for (JsonNode branch : node.get("branches")) {
                detectCyclesHelper(branch, visited, recursionStack);
            }
        }
        
        recursionStack.remove(nodeId);
    }
    
    /**
     * 检测孤立节点
     */
    private void detectOrphanNodes(JsonNode root) {
        Set<String> allNodes = new HashSet<>();
        Set<String> reachableNodes = new HashSet<>();
        
        collectAllNodes(root, allNodes);
        collectReachableNodes(root, reachableNodes);
        
        allNodes.removeAll(reachableNodes);
        if (!allNodes.isEmpty()) {
            log.warn("[detectOrphanNodes] 检测到孤立节点: {}", allNodes);
            // 不抛出异常，只记录警告
        }
    }
    
    private void collectAllNodes(JsonNode node, Set<String> allNodes) {
        if (node == null || !node.has("id")) {
            return;
        }
        allNodes.add(node.get("id").asText());
        
        if (node.has("next")) {
            collectAllNodes(node.get("next"), allNodes);
        }
        if (node.has("branches")) {
            for (JsonNode branch : node.get("branches")) {
                collectAllNodes(branch, allNodes);
            }
        }
    }
    
    private void collectReachableNodes(JsonNode node, Set<String> reachableNodes) {
        if (node == null || !node.has("id")) {
            return;
        }
        
        String nodeId = node.get("id").asText();
        if (reachableNodes.contains(nodeId)) {
            return;
        }
        
        reachableNodes.add(nodeId);
        
        if (node.has("next")) {
            collectReachableNodes(node.get("next"), reachableNodes);
        }
        if (node.has("branches")) {
            for (JsonNode branch : node.get("branches")) {
                collectReachableNodes(branch, reachableNodes);
            }
        }
    }
    
    /**
     * 判断 PARALLEL 节点是否为会签模式
     * signType 可能存储在节点顶层（node.signType）或 props 内（node.props.signType）
     */
    private boolean isCountersignNode(JsonNode node) {
        String signType = null;
        // 优先检查 props.signType（前端 WorkflowBuilder 的存储方式）
        if (node.has("props") && node.get("props").has("signType")) {
            signType = node.get("props").get("signType").asText();
        }
        // 兼容直接存储在节点顶层的情况
        if (signType == null && node.has("signType")) {
            signType = node.get("signType").asText();
        }
        if (signType == null) {
            return false;
        }
        return "ALL".equals(signType) || "ANY".equals(signType)
                || "PERCENT".equals(signType) || "SEQUENTIAL".equals(signType);
    }

    /**
     * 验证字段类型是否有效
     */
    private boolean isValidFieldType(String type) {
        Set<String> validTypes = new HashSet<>(Arrays.asList(
            "text", "textarea", "number", "date", "datetime", "select", 
            "radio", "checkbox", "file", "email", "phone", "url"
        ));
        return validTypes.contains(type);
    }
}
