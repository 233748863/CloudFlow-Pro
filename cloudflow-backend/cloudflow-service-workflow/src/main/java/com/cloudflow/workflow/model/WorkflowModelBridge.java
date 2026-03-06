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
 * 1. 对外只接受 nodes+edges 图模型；
 * 2. 对内构建运行时图索引（WorkflowRuntimeGraph）并兼容生成树结构（WfNodeConfig）供现有执行引擎复用。
 */
@Component
public class WorkflowModelBridge {

    private static final TypeReference<Map<String, String>> STRING_MAP_TYPE = new TypeReference<>() {};
    private static final TypeReference<Map<String, Object>> OBJECT_MAP_TYPE = new TypeReference<>() {};
    private static final String RUNTIME_GRAPH_PROP_KEY = "__runtimeGraph";

    private final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    /**
     * 解析 modelJson 为运行时树结构，同时把运行时图索引挂到 root.props["__runtimeGraph"]。
     */
    public WfNodeConfig parseRuntimeRoot(String modelJson) {
        try {
            GraphParseResult parsed = parseGraph(modelJson);
            WfNodeConfig root = convertGraphToTree(parsed);
            WorkflowRuntimeGraph runtimeGraph = buildRuntimeGraph(root, parsed);
            attachRuntimeGraph(root, runtimeGraph);
            return root;
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            throw WorkflowException.validationError("流程模型解析失败: " + e.getMessage());
        }
    }

    /**
     * 解析 modelJson 为运行时图索引。
     */
    public WorkflowRuntimeGraph parseRuntimeGraph(String modelJson) {
        WfNodeConfig root = parseRuntimeRoot(modelJson);
        WorkflowRuntimeGraph runtimeGraph = resolveRuntimeGraph(root);
        if (runtimeGraph == null) {
            throw WorkflowException.validationError("流程运行时图索引构建失败");
        }
        return runtimeGraph;
    }

    /**
     * 从 parseRuntimeRoot 返回的 root 节点中读取运行时图索引。
     */
    public WorkflowRuntimeGraph resolveRuntimeGraph(WfNodeConfig rootNode) {
        if (rootNode == null || rootNode.getProps() == null) {
            return null;
        }
        Object graphObj = rootNode.getProps().get(RUNTIME_GRAPH_PROP_KEY);
        if (graphObj instanceof WorkflowRuntimeGraph) {
            return (WorkflowRuntimeGraph) graphObj;
        }
        return null;
    }

    /**
     * 返回“首个可执行节点 ID”（START 的默认/首条出边目标；若无出边则返回 START）。
     */
    public String resolveFirstExecutableNodeId(String modelJson) {
        try {
            GraphParseResult parsed = parseGraph(modelJson);
            return resolveFirstExecutableNodeId(parsed.startNodeId(), parsed.outgoing());
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            throw WorkflowException.validationError("流程模型解析失败: " + e.getMessage());
        }
    }

    /**
     * 校验图模型是否合法。
     */
    public boolean validateGraphModel(String modelJson) {
        try {
            parseRuntimeRoot(modelJson);
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
                && root.get("nodes").isArray()
                && root.has("edges")
                && root.get("edges").isArray();
    }

    private GraphParseResult parseGraph(String modelJson) {
        if (!StringUtils.hasText(modelJson)) {
            throw WorkflowException.validationError("流程模型不能为空");
        }
        try {
            JsonNode root = objectMapper.readTree(modelJson);
            if (!isGraphModel(root)) {
                throw WorkflowException.validationError("仅支持 nodes+edges 图模型");
            }
            return parseGraph(root);
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            throw WorkflowException.validationError("流程模型解析失败: " + e.getMessage());
        }
    }

    private GraphParseResult parseGraph(JsonNode graphRoot) {
        JsonNode nodesNode = graphRoot.get("nodes");
        if (nodesNode == null || !nodesNode.isArray() || nodesNode.isEmpty()) {
            throw WorkflowException.validationError("流程图节点不能为空");
        }
        JsonNode edgesNode = graphRoot.get("edges");
        if (edgesNode == null || !edgesNode.isArray()) {
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

        Map<String, List<EdgeLink>> outgoing = new LinkedHashMap<>();
        Map<String, List<EdgeLink>> incoming = new LinkedHashMap<>();
        for (JsonNode edge : edgesNode) {
            String source = text(edge, "source");
            String target = text(edge, "target");
            if (!StringUtils.hasText(source) || !StringUtils.hasText(target)) {
                throw WorkflowException.validationError("存在 source/target 缺失的连线");
            }
            if (!nodeMap.containsKey(source) || !nodeMap.containsKey(target)) {
                throw WorkflowException.validationError("流程图连线引用了不存在的节点: " + source + " -> " + target);
            }
            EdgeLink edgeLink = EdgeLink.of(source, target, text(edge, "condition"), parseEdgeDefault(edge));
            outgoing.computeIfAbsent(source, k -> new ArrayList<>()).add(edgeLink);
            incoming.computeIfAbsent(target, k -> new ArrayList<>()).add(edgeLink);
            incomingCount.put(target, incomingCount.getOrDefault(target, 0) + 1);
        }

        for (Map.Entry<String, List<EdgeLink>> entry : outgoing.entrySet()) {
            resolveDefaultEdge(entry.getKey(), entry.getValue());
        }

        String startId = resolveSingleStartNodeId(nodeMap);

        // 过渡期限制：执行引擎仍保留一部分树语义，先禁止多入边汇聚。
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

        return new GraphParseResult(nodeMap, outgoing, incoming, startId);
    }

    private WfNodeConfig convertGraphToTree(GraphParseResult parsed) {
        return buildTree(parsed.startNodeId(), parsed.nodeMap(), parsed.outgoing(), new LinkedHashSet<>());
    }

    private WorkflowRuntimeGraph buildRuntimeGraph(WfNodeConfig root, GraphParseResult parsed) {
        Map<String, WfNodeConfig> nodeIndex = new LinkedHashMap<>();
        collectTreeNodeIndex(root, nodeIndex, new HashSet<>());

        Map<String, List<WorkflowRuntimeGraph.EdgeLink>> outgoingIndex = new LinkedHashMap<>();
        for (Map.Entry<String, List<EdgeLink>> entry : parsed.outgoing().entrySet()) {
            List<WorkflowRuntimeGraph.EdgeLink> converted = new ArrayList<>();
            for (EdgeLink edge : entry.getValue()) {
                converted.add(new WorkflowRuntimeGraph.EdgeLink(
                        edge.sourceId(),
                        edge.targetId(),
                        edge.condition(),
                        edge.isDefault()
                ));
            }
            outgoingIndex.put(entry.getKey(), converted);
        }

        Map<String, List<WorkflowRuntimeGraph.EdgeLink>> incomingIndex = new LinkedHashMap<>();
        for (Map.Entry<String, List<EdgeLink>> entry : parsed.incoming().entrySet()) {
            List<WorkflowRuntimeGraph.EdgeLink> converted = new ArrayList<>();
            for (EdgeLink edge : entry.getValue()) {
                converted.add(new WorkflowRuntimeGraph.EdgeLink(
                        edge.sourceId(),
                        edge.targetId(),
                        edge.condition(),
                        edge.isDefault()
                ));
            }
            incomingIndex.put(entry.getKey(), converted);
        }

        String firstExecutableNodeId = resolveFirstExecutableNodeId(parsed.startNodeId(), parsed.outgoing());
        return new WorkflowRuntimeGraph(
                parsed.startNodeId(),
                firstExecutableNodeId,
                nodeIndex,
                outgoingIndex,
                incomingIndex
        );
    }

    private void attachRuntimeGraph(WfNodeConfig root, WorkflowRuntimeGraph runtimeGraph) {
        if (root == null || runtimeGraph == null) {
            return;
        }
        Map<String, Object> props = root.getProps() != null ? new HashMap<>(root.getProps()) : new HashMap<>();
        props.put(RUNTIME_GRAPH_PROP_KEY, runtimeGraph);
        root.setProps(props);
    }

    private void collectTreeNodeIndex(WfNodeConfig node,
                                      Map<String, WfNodeConfig> nodeIndex,
                                      Set<String> visited) {
        if (node == null || !StringUtils.hasText(node.getId()) || visited.contains(node.getId())) {
            return;
        }
        visited.add(node.getId());
        nodeIndex.put(node.getId(), node);

        collectTreeNodeIndex(node.getNext(), nodeIndex, visited);
        if (node.getBranches() != null) {
            for (WfNodeConfig branch : node.getBranches()) {
                collectTreeNodeIndex(branch, nodeIndex, visited);
            }
        }
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

    private String resolveFirstExecutableNodeId(String startId, Map<String, List<EdgeLink>> outgoing) {
        List<EdgeLink> startOutgoing = outgoing.getOrDefault(startId, List.of());
        if (startOutgoing.isEmpty()) {
            return startId;
        }
        if (startOutgoing.size() == 1) {
            return startOutgoing.get(0).targetId();
        }
        EdgeLink defaultEdge = resolveDefaultEdge(startId, startOutgoing);
        return defaultEdge != null ? defaultEdge.targetId() : startOutgoing.get(0).targetId();
    }

    private void collectReachable(String current,
                                  Map<String, List<EdgeLink>> outgoing,
                                  Set<String> reachable,
                                  Set<String> path) {
        if (!StringUtils.hasText(current) || path.contains(current)) {
            return;
        }
        path.add(current);
        reachable.add(current);
        for (EdgeLink next : outgoing.getOrDefault(current, List.of())) {
            collectReachable(next.targetId(), outgoing, reachable, path);
        }
        path.remove(current);
    }

    private WfNodeConfig buildTree(String currentId,
                                   Map<String, JsonNode> nodeMap,
                                   Map<String, List<EdgeLink>> outgoing,
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
        List<EdgeLink> nextEdges = outgoing.getOrDefault(currentId, List.of());
        if (nextEdges.size() == 1) {
            WfNodeConfig next = buildTree(nextEdges.get(0).targetId(), nodeMap, outgoing, new LinkedHashSet<>(path));
            applyEdgeCondition(next, nextEdges.get(0));
            config.setNext(next);
        } else if (nextEdges.size() > 1) {
            EdgeLink defaultEdge = resolveDefaultEdge(currentId, nextEdges);
            List<WfNodeConfig> branches = new ArrayList<>();
            for (EdgeLink edge : nextEdges) {
                if (edge == defaultEdge) {
                    continue;
                }
                WfNodeConfig branch = buildTree(edge.targetId(), nodeMap, outgoing, new LinkedHashSet<>(path));
                applyEdgeCondition(branch, edge);
                branches.add(branch);
            }
            if (!branches.isEmpty()) {
                config.setBranches(branches);
            }
            if (defaultEdge != null) {
                WfNodeConfig next = buildTree(defaultEdge.targetId(), nodeMap, outgoing, new LinkedHashSet<>(path));
                applyEdgeCondition(next, defaultEdge);
                config.setNext(next);
            }
        }

        path.remove(currentId);
        return config;
    }

    private WfNodeConfig toNodeConfig(JsonNode node) {
        WfNodeConfig config = new WfNodeConfig();
        config.setId(text(node, "id"));
        config.setType(text(node, "type"));
        config.setTitle(text(node, "title"));
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

    private void applyEdgeCondition(WfNodeConfig target, EdgeLink edge) {
        if (target == null || edge == null) {
            return;
        }
        // 允许在边上声明条件；若目标节点未显式配置 condition，则回填到目标节点。
        if (!StringUtils.hasText(target.getCondition()) && StringUtils.hasText(edge.condition())) {
            target.setCondition(edge.condition());
        }
    }

    private EdgeLink resolveDefaultEdge(String sourceId, List<EdgeLink> edges) {
        EdgeLink defaultEdge = null;
        for (EdgeLink edge : edges) {
            if (!edge.isDefault()) {
                continue;
            }
            if (defaultEdge != null) {
                throw WorkflowException.validationError("节点存在多条默认连线: " + sourceId);
            }
            defaultEdge = edge;
        }
        return defaultEdge;
    }

    private boolean parseEdgeDefault(JsonNode edge) {
        if (edge == null || edge.isNull()) {
            return false;
        }
        return parseBooleanField(edge, "isDefault");
    }

    private boolean parseBooleanField(JsonNode node, String field) {
        if (node == null || !node.has(field) || node.get(field).isNull()) {
            return false;
        }
        JsonNode value = node.get(field);
        if (value.isBoolean()) {
            return value.asBoolean();
        }
        if (value.isNumber()) {
            return value.asInt() != 0;
        }
        String text = value.asText();
        if (!StringUtils.hasText(text)) {
            return false;
        }
        return "true".equalsIgnoreCase(text)
                || "1".equals(text)
                || "yes".equalsIgnoreCase(text)
                || "y".equalsIgnoreCase(text);
    }

    private record GraphParseResult(Map<String, JsonNode> nodeMap,
                                    Map<String, List<EdgeLink>> outgoing,
                                    Map<String, List<EdgeLink>> incoming,
                                    String startNodeId) {
    }

    private record EdgeLink(String sourceId, String targetId, String condition, boolean isDefault) {
        private static EdgeLink of(String sourceId, String targetId, String condition, boolean isDefault) {
            return new EdgeLink(sourceId, targetId, condition, isDefault);
        }
    }
}
