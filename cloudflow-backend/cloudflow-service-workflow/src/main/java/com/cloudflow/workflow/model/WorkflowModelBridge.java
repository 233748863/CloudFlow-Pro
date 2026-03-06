package com.cloudflow.workflow.model;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.exception.WorkflowException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 工作流模型桥接器：
 * 1. 对外接受 nodes+edges 图模型；
 * 2. 对内转换为运行时节点树（WfNodeConfig）供执行引擎复用。
 */
@Component
public class WorkflowModelBridge {

    private static final TypeReference<Map<String, String>> STRING_MAP_TYPE = new TypeReference<>() {};
    private static final TypeReference<Map<String, Object>> OBJECT_MAP_TYPE = new TypeReference<>() {};

    private final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    /**
     * 将 modelJson 解析为运行时节点树。
     * 仅支持图模型：{ nodes: [...], edges: [...] }
     */
    public WfNodeConfig parseRuntimeRoot(String modelJson) {
        if (!StringUtils.hasText(modelJson)) {
            throw WorkflowException.validationError("流程模型不能为空");
        }
        try {
            JsonNode root = objectMapper.readTree(modelJson);
            if (!isGraphModel(root)) {
                throw WorkflowException.validationError("仅支持 nodes+edges 图模型");
            }
            return convertGraphToTree(root);
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            throw WorkflowException.validationError("流程模型解析失败: " + e.getMessage());
        }
    }

    /**
     * 校验图模型基础结构是否合法。
     */
    public boolean validateGraphModel(String modelJson) {
        try {
            JsonNode root = objectMapper.readTree(modelJson);
            if (!isGraphModel(root)) {
                return false;
            }
            convertGraphToTree(root);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public boolean isGraphModel(String modelJson) {
        if (!StringUtils.hasText(modelJson)) {
            return false;
        }
        try {
            return isGraphModel(objectMapper.readTree(modelJson));
        } catch (Exception e) {
            return false;
        }
    }

    public boolean isGraphModel(JsonNode root) {
        return root != null
                && root.isObject()
                && root.has("nodes")
                && root.get("nodes").isArray();
    }

    private WfNodeConfig convertGraphToTree(JsonNode graphRoot) {
        JsonNode nodesNode = graphRoot.get("nodes");
        if (nodesNode == null || !nodesNode.isArray() || nodesNode.isEmpty()) {
            throw WorkflowException.validationError("流程图节点不能为空");
        }
        JsonNode edgesNode = graphRoot.get("edges");
        if (edgesNode != null && !edgesNode.isArray()) {
            throw WorkflowException.validationError("流程图边结构无效");
        }

        Map<String, JsonNode> nodeMap = new LinkedHashMap<>();
        Map<String, Integer> incomingCount = new HashMap<>();
        for (JsonNode node : nodesNode) {
            String nodeId = text(node, "id");
            if (!StringUtils.hasText(nodeId)) {
                throw WorkflowException.validationError("存在未配置 id 的流程节点");
            }
            if (nodeMap.containsKey(nodeId)) {
                throw WorkflowException.validationError("流程图存在重复节点ID: " + nodeId);
            }
            String nodeType = text(node, "type");
            if (!StringUtils.hasText(nodeType)) {
                throw WorkflowException.validationError("流程节点缺少 type: " + nodeId);
            }
            nodeMap.put(nodeId, node);
            incomingCount.put(nodeId, 0);
        }

        Map<String, List<String>> outgoing = new LinkedHashMap<>();
        if (edgesNode != null) {
            for (JsonNode edge : edgesNode) {
                String source = firstNotBlank(text(edge, "source"), text(edge, "from"));
                String target = firstNotBlank(text(edge, "target"), text(edge, "to"));
                if (!StringUtils.hasText(source) || !StringUtils.hasText(target)) {
                    throw WorkflowException.validationError("存在 source/target 缺失的连线");
                }
                if (!nodeMap.containsKey(source) || !nodeMap.containsKey(target)) {
                    throw WorkflowException.validationError("流程图连线引用了不存在的节点: " + source + " -> " + target);
                }
                outgoing.computeIfAbsent(source, k -> new ArrayList<>()).add(target);
                incomingCount.put(target, incomingCount.getOrDefault(target, 0) + 1);
            }
        }

        String startId = resolveSingleStartNodeId(nodeMap);

        // 当前执行引擎仍基于树结构：暂不支持“多入边汇聚”图。
        for (Map.Entry<String, Integer> entry : incomingCount.entrySet()) {
            String nodeId = entry.getKey();
            int inDegree = entry.getValue();
            if (!nodeId.equals(startId) && inDegree > 1) {
                throw WorkflowException.validationError("暂不支持多入边汇聚节点，请先拆分节点: " + nodeId);
            }
        }

        Set<String> reachable = new LinkedHashSet<>();
        collectReachable(startId, outgoing, reachable, new HashSet<>());
        if (reachable.size() != nodeMap.size()) {
            throw WorkflowException.validationError("流程图存在不可达节点，请删除孤立节点后重试");
        }

        boolean hasEnd = reachable.stream()
                .map(nodeMap::get)
                .anyMatch(n -> "END".equalsIgnoreCase(text(n, "type")));
        if (!hasEnd) {
            throw WorkflowException.validationError("流程图缺少结束节点(END)");
        }

        return buildTree(startId, nodeMap, outgoing, new LinkedHashSet<>());
    }

    private String resolveSingleStartNodeId(Map<String, JsonNode> nodeMap) {
        List<String> startIds = nodeMap.entrySet().stream()
                .filter(e -> "START".equalsIgnoreCase(text(e.getValue(), "type")))
                .map(Map.Entry::getKey)
                .toList();
        if (startIds.size() != 1) {
            throw WorkflowException.validationError("流程图必须且只能包含一个开始节点(START)");
        }
        return startIds.get(0);
    }

    private void collectReachable(String current,
                                  Map<String, List<String>> outgoing,
                                  Set<String> reachable,
                                  Set<String> path) {
        if (!StringUtils.hasText(current) || path.contains(current)) {
            return;
        }
        path.add(current);
        reachable.add(current);
        for (String next : outgoing.getOrDefault(current, List.of())) {
            collectReachable(next, outgoing, reachable, path);
        }
        path.remove(current);
    }

    private WfNodeConfig buildTree(String currentId,
                                   Map<String, JsonNode> nodeMap,
                                   Map<String, List<String>> outgoing,
                                   Set<String> path) {
        if (path.contains(currentId)) {
            throw WorkflowException.validationError("流程图存在循环，节点ID: " + currentId);
        }
        path.add(currentId);

        JsonNode node = nodeMap.get(currentId);
        if (node == null) {
            throw WorkflowException.validationError("流程节点不存在: " + currentId);
        }

        WfNodeConfig config = toNodeConfig(node);
        List<String> nextIds = outgoing.getOrDefault(currentId, List.of());
        if (nextIds.size() == 1) {
            config.setNext(buildTree(nextIds.get(0), nodeMap, outgoing, new LinkedHashSet<>(path)));
        } else if (nextIds.size() > 1) {
            List<WfNodeConfig> branches = new ArrayList<>();
            for (String nextId : nextIds) {
                branches.add(buildTree(nextId, nodeMap, outgoing, new LinkedHashSet<>(path)));
            }
            config.setBranches(branches);
        }

        path.remove(currentId);
        return config;
    }

    private WfNodeConfig toNodeConfig(JsonNode node) {
        WfNodeConfig config = new WfNodeConfig();
        config.setId(text(node, "id"));
        config.setType(text(node, "type"));
        config.setTitle(firstNotBlank(text(node, "title"), text(node, "label")));
        config.setDescription(text(node, "description"));
        config.setApproverType(text(node, "approverType"));
        config.setApproverValue(text(node, "approverValue"));
        config.setBranchStrategy(text(node, "branchStrategy"));
        config.setCondition(text(node, "condition"));
        config.setSignType(text(node, "signType"));
        config.setSlaAction(text(node, "slaAction"));

        if (node.hasNonNull("allowEdit")) {
            config.setAllowEdit(node.get("allowEdit").asBoolean());
        }
        if (node.hasNonNull("passPercent")) {
            config.setPassPercent(node.get("passPercent").asInt());
        }
        if (node.hasNonNull("slaHours")) {
            config.setSlaHours(node.get("slaHours").asInt());
        }

        JsonNode inputs = node.get("inputs");
        if (inputs != null && inputs.isObject()) {
            config.setInputs(objectMapper.convertValue(inputs, STRING_MAP_TYPE));
        }
        JsonNode outputs = node.get("outputs");
        if (outputs != null && outputs.isObject()) {
            config.setOutputs(objectMapper.convertValue(outputs, STRING_MAP_TYPE));
        }
        JsonNode props = node.get("props");
        if (props != null && props.isObject()) {
            config.setProps(objectMapper.convertValue(props, OBJECT_MAP_TYPE));
        }
        JsonNode retry = node.get("retry");
        if (retry != null && retry.isObject()) {
            config.setRetry(objectMapper.convertValue(retry, OBJECT_MAP_TYPE));
        }
        return config;
    }

    private String text(JsonNode node, String field) {
        if (node == null || !node.has(field) || node.get(field).isNull()) {
            return null;
        }
        String value = node.get(field).asText();
        return StringUtils.hasText(value) ? value : null;
    }

    private String firstNotBlank(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value;
            }
        }
        return null;
    }
}
