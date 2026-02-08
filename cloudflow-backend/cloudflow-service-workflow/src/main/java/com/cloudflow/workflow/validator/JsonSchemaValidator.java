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
        
        // APPROVAL节点必须有next或branches
        if ("APPROVAL".equals(type)) {
            if (!node.has("next") && !node.has("branches")) {
                throw WorkflowException.validationError("审批节点必须有后续节点");
            }
        }
        
        // GATEWAY节点必须有branches
        if ("GATEWAY".equals(type) || "CONDITION".equals(type)) {
            if (!node.has("branches") || !node.get("branches").isArray() || node.get("branches").size() == 0) {
                throw WorkflowException.validationError("网关节点必须有分支");
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
