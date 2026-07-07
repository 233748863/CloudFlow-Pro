package com.cloudflow.workflow.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.dto.VersionComparisonDTO;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.service.IVersionComparisonService;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * 版本对比服务实现类
 * 实现流程版本之间的详细差异对比
 * 
 * @author CloudFlow
 */
@Slf4j
@Service
public class VersionComparisonServiceImpl implements IVersionComparisonService {

    @Autowired
    private WfProcessDefinitionMapper definitionMapper;

    @Autowired
    private ObjectMapper objectMapper;

    /**
     * 对比两个版本的差异（C6: 版本 id 即版本行 definitionId）
     * 使用 Redis 缓存对比结果（1小时过期）
     */
    @Override
    @Cacheable(value = "versionComparison", key = "#fromVersionId + '_' + #toVersionId", unless = "#result == null")
    public VersionComparisonDTO compareVersions(String fromVersionId, String toVersionId) {
        log.info("开始对比版本, fromVersionId={}, toVersionId={}", fromVersionId, toVersionId);

        // 查询两个版本行
        WfProcessDefinition fromVersion = definitionMapper.selectById(fromVersionId);
        WfProcessDefinition toVersion = definitionMapper.selectById(toVersionId);

        if (fromVersion == null) {
            throw new WorkflowException("源版本不存在: " + fromVersionId);
        }
        if (toVersion == null) {
            throw new WorkflowException("目标版本不存在: " + toVersionId);
        }
        if (!Objects.equals(fromVersion.getProcessKey(), toVersion.getProcessKey())) {
            throw WorkflowException.validationError("仅支持同一流程版本对比");
        }
        assertWorkflowTenantAccess(fromVersion.getDefinitionId(), "版本对比");

        // 对比定义
        VersionComparisonDTO result = compareDefinitions(
            fromVersion.getModelJson(),
            toVersion.getModelJson()
        );

        // 设置版本号
        result.setFromVersion(fromVersion.getCurrentVersion());
        result.setToVersion(toVersion.getCurrentVersion());

        log.info("版本对比完成, 新增节点: {}, 删除节点: {}, 修改节点: {}", 
            result.getAddedNodes().size(), 
            result.getRemovedNodes().size(), 
            result.getModifiedNodes().size());

        return result;
    }

    private void assertWorkflowTenantAccess(String workflowId, String operation) {
        WfProcessDefinition definition = definitionMapper.selectById(workflowId);
        if (definition == null) {
            throw WorkflowException.processNotFound(workflowId);
        }
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && !Objects.equals(currentTenantId, definition.getTenantId())) {
            throw WorkflowException.permissionDenied(operation);
        }
    }

    /**
     * 对比两个流程定义的差异
     */
    @Override
    public VersionComparisonDTO compareDefinitions(String fromDefinition, String toDefinition) {
        try {
            JsonNode fromJson = objectMapper.readTree(fromDefinition);
            JsonNode toJson = objectMapper.readTree(toDefinition);

            VersionComparisonDTO result = new VersionComparisonDTO();

            // 对比节点
            compareNodes(fromJson, toJson, result);

            // 对比连接
            compareEdges(fromJson, toJson, result);

            // 对比配置
            compareConfigs(fromJson, toJson, result);

            return result;

        } catch (Exception e) {
            log.error("对比流程定义失败", e);
            throw new WorkflowException("对比流程定义失败: " + e.getMessage());
        }
    }

    /**
     * 对比节点的差异
     */
    private void compareNodes(JsonNode fromJson, JsonNode toJson, VersionComparisonDTO result) {
        JsonNode fromNodes = fromJson.get("nodes");
        JsonNode toNodes = toJson.get("nodes");

        if (fromNodes == null || toNodes == null) {
            result.setAddedNodes(new ArrayList<>());
            result.setRemovedNodes(new ArrayList<>());
            result.setModifiedNodes(new ArrayList<>());
            return;
        }

        // 构建节点映射
        Map<String, JsonNode> fromNodeMap = buildNodeMap(fromNodes);
        Map<String, JsonNode> toNodeMap = buildNodeMap(toNodes);

        List<VersionComparisonDTO.NodeChange> addedNodes = new ArrayList<>();
        List<VersionComparisonDTO.NodeChange> removedNodes = new ArrayList<>();
        List<VersionComparisonDTO.NodeChange> modifiedNodes = new ArrayList<>();

        // 查找新增和修改的节点
        for (Map.Entry<String, JsonNode> entry : toNodeMap.entrySet()) {
            String nodeId = entry.getKey();
            JsonNode toNode = entry.getValue();

            if (!fromNodeMap.containsKey(nodeId)) {
                // 新增的节点
                addedNodes.add(createNodeChange(toNode, null));
            } else {
                // 检查是否修改
                JsonNode fromNode = fromNodeMap.get(nodeId);
                if (!fromNode.equals(toNode)) {
                    // 节点被修改
                    VersionComparisonDTO.NodeChange change = createNodeChange(toNode, fromNode);
                    change.setChanges(compareNodeProperties(fromNode, toNode));
                    modifiedNodes.add(change);
                }
            }
        }

        // 查找删除的节点
        for (Map.Entry<String, JsonNode> entry : fromNodeMap.entrySet()) {
            String nodeId = entry.getKey();
            if (!toNodeMap.containsKey(nodeId)) {
                // 删除的节点
                removedNodes.add(createNodeChange(entry.getValue(), null));
            }
        }

        result.setAddedNodes(addedNodes);
        result.setRemovedNodes(removedNodes);
        result.setModifiedNodes(modifiedNodes);
    }

    /**
     * 构建节点ID到节点对象的映射
     */
    private Map<String, JsonNode> buildNodeMap(JsonNode nodes) {
        Map<String, JsonNode> nodeMap = new HashMap<>();
        if (nodes != null && nodes.isArray()) {
            for (JsonNode node : nodes) {
                String id = node.has("id") ? node.get("id").asText() : "";
                if (!id.isEmpty()) {
                    nodeMap.put(id, node);
                }
            }
        }
        return nodeMap;
    }

    /**
     * 创建节点变更对象
     */
    private VersionComparisonDTO.NodeChange createNodeChange(JsonNode node, JsonNode oldNode) {
        VersionComparisonDTO.NodeChange change = new VersionComparisonDTO.NodeChange();
        change.setNodeId(node.has("id") ? node.get("id").asText() : "");
        change.setNodeName(node.has("name") ? node.get("name").asText() : "");
        change.setNodeType(node.has("type") ? node.get("type").asText() : "");
        return change;
    }

    /**
     * 对比节点属性的变更
     */
    private List<VersionComparisonDTO.PropertyChange> compareNodeProperties(JsonNode fromNode, JsonNode toNode) {
        List<VersionComparisonDTO.PropertyChange> changes = new ArrayList<>();

        // 对比所有字段
        Set<String> allFields = new HashSet<>();
        fromNode.fieldNames().forEachRemaining(allFields::add);
        toNode.fieldNames().forEachRemaining(allFields::add);

        for (String field : allFields) {
            // 跳过 id 字段
            if ("id".equals(field)) {
                continue;
            }

            JsonNode fromValue = fromNode.get(field);
            JsonNode toValue = toNode.get(field);

            // 检查是否有变更
            if (!Objects.equals(fromValue, toValue)) {
                VersionComparisonDTO.PropertyChange change = new VersionComparisonDTO.PropertyChange();
                change.setPath(field);
                change.setOldValue(fromValue != null ? fromValue.toString() : null);
                change.setNewValue(toValue != null ? toValue.toString() : null);
                changes.add(change);
            }
        }

        return changes;
    }

    /**
     * 对比连接的差异
     */
    private void compareEdges(JsonNode fromJson, JsonNode toJson, VersionComparisonDTO result) {
        JsonNode fromEdges = fromJson.get("edges");
        JsonNode toEdges = toJson.get("edges");

        if (fromEdges == null || toEdges == null) {
            result.setAddedEdges(new ArrayList<>());
            result.setRemovedEdges(new ArrayList<>());
            return;
        }

        // 构建连接集合
        Set<String> fromEdgeSet = buildEdgeSet(fromEdges);
        Set<String> toEdgeSet = buildEdgeSet(toEdges);

        List<VersionComparisonDTO.EdgeChange> addedEdges = new ArrayList<>();
        List<VersionComparisonDTO.EdgeChange> removedEdges = new ArrayList<>();

        // 查找新增的连接
        for (String edgeKey : toEdgeSet) {
            if (!fromEdgeSet.contains(edgeKey)) {
                addedEdges.add(parseEdgeKey(edgeKey));
            }
        }

        // 查找删除的连接
        for (String edgeKey : fromEdgeSet) {
            if (!toEdgeSet.contains(edgeKey)) {
                removedEdges.add(parseEdgeKey(edgeKey));
            }
        }

        result.setAddedEdges(addedEdges);
        result.setRemovedEdges(removedEdges);
    }

    /**
     * 构建连接集合（格式：source->target）
     */
    private Set<String> buildEdgeSet(JsonNode edges) {
        Set<String> edgeSet = new HashSet<>();
        if (edges != null && edges.isArray()) {
            for (JsonNode edge : edges) {
                String source = edge.has("source") ? edge.get("source").asText() : 
                               edge.has("from") ? edge.get("from").asText() : "";
                String target = edge.has("target") ? edge.get("target").asText() : 
                               edge.has("to") ? edge.get("to").asText() : "";
                
                if (!source.isEmpty() && !target.isEmpty()) {
                    String edgeKey = source + "->" + target;
                    edgeSet.add(edgeKey);
                }
            }
        }
        return edgeSet;
    }

    /**
     * 解析连接键（格式：source->target）
     */
    private VersionComparisonDTO.EdgeChange parseEdgeKey(String edgeKey) {
        String[] parts = edgeKey.split("->");
        VersionComparisonDTO.EdgeChange change = new VersionComparisonDTO.EdgeChange();
        change.setEdgeId(edgeKey);
        change.setSourceId(parts.length > 0 ? parts[0] : "");
        change.setTargetId(parts.length > 1 ? parts[1] : "");
        return change;
    }

    /**
     * 对比全局配置的差异
     */
    private void compareConfigs(JsonNode fromJson, JsonNode toJson, VersionComparisonDTO result) {
        List<VersionComparisonDTO.ConfigChange> configChanges = new ArrayList<>();

        // 对比所有顶层字段（除了 nodes 和 edges）
        Set<String> allFields = new HashSet<>();
        fromJson.fieldNames().forEachRemaining(allFields::add);
        toJson.fieldNames().forEachRemaining(allFields::add);

        for (String field : allFields) {
            // 跳过 nodes 和 edges
            if ("nodes".equals(field) || "edges".equals(field)) {
                continue;
            }

            JsonNode fromValue = fromJson.get(field);
            JsonNode toValue = toJson.get(field);

            // 检查是否有变更
            if (!Objects.equals(fromValue, toValue)) {
                VersionComparisonDTO.ConfigChange change = new VersionComparisonDTO.ConfigChange();
                change.setPath(field);
                change.setOldValue(fromValue != null ? fromValue.toString() : null);
                change.setNewValue(toValue != null ? toValue.toString() : null);
                configChanges.add(change);
            }
        }

        result.setConfigChanges(configChanges);
    }
}
