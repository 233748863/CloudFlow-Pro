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
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 工作流图模型解析器。
 * 1. 对外只接受 nodes+edges 图模型。
 * 2. 对内构建 WorkflowRuntimeGraph 供执行引擎直接使用。
 */
@Component
public class WorkflowGraphModelResolver {

    private static final TypeReference<Map<String, String>> STRING_MAP_TYPE = new TypeReference<>() {};
    private static final TypeReference<Map<String, Object>> OBJECT_MAP_TYPE = new TypeReference<>() {};
    private static final String RUNTIME_GRAPH_PROP_KEY = "__runtimeGraph";
    private static final Set<String> PARALLEL_SIGN_MODES = Set.of("ALL", "ANY", "PERCENT", "SEQUENTIAL");

    private final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    /**
     * 解析 modelJson 并返回运行时根节点（START 节点），
     * 同时把运行时图索引挂到 root.props["__runtimeGraph"]。
     */
    public WfNodeConfig parseRuntimeRoot(String modelJson) {
        try {
            GraphParseResult parsed = parseGraph(modelJson);
            WorkflowRuntimeGraph runtimeGraph = buildRuntimeGraph(parsed);
            WfNodeConfig root = buildRuntimeRoot(parsed, runtimeGraph);
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
        try {
            GraphParseResult parsed = parseGraph(modelJson);
            return buildRuntimeGraph(parsed);
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            throw WorkflowException.validationError("流程模型解析失败: " + e.getMessage());
        }
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
            parseRuntimeGraph(modelJson);
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

        // END 始终允许多入边；普通节点仅允许作为同一上游路由的受限汇聚点，
        // 用于支持设计器"共享 END 前追加公共节点"场景，避免开放任意 DAG 多入边。
        for (Map.Entry<String, Integer> entry : incomingCount.entrySet()) {
            String nodeId = entry.getKey();
            int inDegree = entry.getValue();
            if (nodeId.equals(startId) || inDegree <= 1) {
                continue;
            }
            JsonNode targetNode = nodeMap.get(nodeId);
            if (!"END".equalsIgnoreCase(text(targetNode, "type"))
                    && !isLegalBranchMergeNode(nodeId, nodeMap, incoming, outgoing)) {
                throw WorkflowException.validationError("暂不支持多入边汇聚节点，请先拆分节点: " + nodeId);
            }
        }

        for (Map.Entry<String, JsonNode> entry : nodeMap.entrySet()) {
            if ("END".equalsIgnoreCase(text(entry.getValue(), "type"))
                    && !outgoing.getOrDefault(entry.getKey(), List.of()).isEmpty()) {
                throw WorkflowException.validationError("结束节点不能配置后继连线: " + entry.getKey());
            }
        }

        // R8/R9/R10：多分支决策节点拓扑校验
        // 适用：任何拥有 >=2 条出边的节点（CONDITION/GATEWAY/PARALLEL-分支模式 类型且为路由角色，
        // 或 APPROVAL 等业务节点通过 branchStrategy=EXCLUSIVE 充当路由），均视为"多分支路由"。
        // 单出边的 CONDITION 视为分支标签节点（兼容历史模板），不强制 R8。
        for (Map.Entry<String, JsonNode> entry : nodeMap.entrySet()) {
            String nodeId = entry.getKey();
            JsonNode node = entry.getValue();
            List<EdgeLink> outs = outgoing.getOrDefault(nodeId, List.of());
            boolean isRouterByOutgoing = outs.size() >= 2;
            boolean isRouterByType = isMultiBranchDecisionNode(node);
            if (!isRouterByOutgoing && !isRouterByType) {
                continue;
            }
            // R8：声明为 GATEWAY/PARALLEL-branch 类型的节点必须 >=2 条出边
            // CONDITION 单出边作为"分支标签"使用——其上游必须是真正的多出边路由节点
            if (isRouterByType && !isRouterByOutgoing) {
                String upperType = textUpper(node, "type");
                if ("CONDITION".equals(upperType)) {
                    if (!isConditionLabelDownstreamOfRouter(nodeId, incoming, outgoing)) {
                        throw WorkflowException.validationError(
                                "CONDITION 节点既非多出边路由也非合法分支标签: " + nodeId);
                    }
                } else {
                    throw WorkflowException.validationError("多分支决策节点至少需要两条出边: " + nodeId);
                }
                continue;
            }
            // 仅对真正的多出边路由节点应用 R9/R10
            if (!isRouterByOutgoing) {
                continue;
            }
            // R9：必须恰好 1 条 isDefault=true（兜底分支）
            long defaultCount = outs.stream().filter(EdgeLink::isDefault).count();
            if (defaultCount == 0) {
                throw WorkflowException.validationError("多分支路由节点缺少默认分支(isDefault=true): " + nodeId);
            }
            if (defaultCount > 1) {
                throw WorkflowException.validationError("多分支路由节点存在多条默认分支: " + nodeId);
            }
            // R10：非默认分支不得直连结束节点(END)，必须先经过中间业务节点
            // （默认分支保留"兜底直接结束"的合法业务语义）
            for (EdgeLink edge : outs) {
                if (edge.isDefault()) {
                    continue;
                }
                JsonNode targetNode = nodeMap.get(edge.targetId());
                if ("END".equalsIgnoreCase(text(targetNode, "type"))) {
                    throw WorkflowException.validationError(
                            "多分支路由节点的非默认分支不能直接连向结束节点(END): " + nodeId + " -> " + edge.targetId());
                }
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

    private WorkflowRuntimeGraph buildRuntimeGraph(GraphParseResult parsed) {
        Map<String, WfNodeConfig> nodeIndex = new LinkedHashMap<>();
        for (Map.Entry<String, JsonNode> entry : parsed.nodeMap().entrySet()) {
            nodeIndex.put(entry.getKey(), toNodeConfig(entry.getValue()));
        }

        Map<String, List<WorkflowRuntimeGraph.EdgeLink>> outgoingIndex = convertEdgeIndex(parsed.outgoing());
        Map<String, List<WorkflowRuntimeGraph.EdgeLink>> incomingIndex = convertEdgeIndex(parsed.incoming());

        String firstExecutableNodeId = resolveFirstExecutableNodeId(parsed.startNodeId(), parsed.outgoing());
        return new WorkflowRuntimeGraph(
                parsed.startNodeId(),
                firstExecutableNodeId,
                nodeIndex,
                outgoingIndex,
                incomingIndex
        );
    }

    private Map<String, List<WorkflowRuntimeGraph.EdgeLink>> convertEdgeIndex(Map<String, List<EdgeLink>> edgeIndex) {
        Map<String, List<WorkflowRuntimeGraph.EdgeLink>> converted = new LinkedHashMap<>();
        for (Map.Entry<String, List<EdgeLink>> entry : edgeIndex.entrySet()) {
            List<WorkflowRuntimeGraph.EdgeLink> links = new ArrayList<>();
            for (EdgeLink edge : entry.getValue()) {
                links.add(new WorkflowRuntimeGraph.EdgeLink(
                        edge.sourceId(),
                        edge.targetId(),
                        edge.condition(),
                        edge.isDefault()
                ));
            }
            converted.put(entry.getKey(), links);
        }
        return converted;
    }

    private WfNodeConfig buildRuntimeRoot(GraphParseResult parsed, WorkflowRuntimeGraph runtimeGraph) {
        WfNodeConfig root = runtimeGraph.getNode(parsed.startNodeId());
        if (root == null) {
            throw WorkflowException.validationError("流程运行时根节点构建失败");
        }
        return root;
    }

    private void attachRuntimeGraph(WfNodeConfig root, WorkflowRuntimeGraph runtimeGraph) {
        if (root == null || runtimeGraph == null) {
            return;
        }
        Map<String, Object> props = root.getProps() != null ? new HashMap<>(root.getProps()) : new HashMap<>();
        props.put(RUNTIME_GRAPH_PROP_KEY, runtimeGraph);
        root.setProps(props);
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
        if (defaultEdge == null) {
            throw WorkflowException.validationError("START 节点存在多条出边但未配置 default，无法确定首个可执行节点");
        }
        return defaultEdge.targetId();
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

    private String textUpper(JsonNode node, String field) {
        String value = text(node, field);
        return value == null ? null : value.toUpperCase(Locale.ROOT);
    }

    /**
     * 判断 CONDITION 节点是否作为"分支标签"使用：
     * 只有一条入边，且来源节点是真正的多出边路由节点。
     */
    private boolean isConditionLabelDownstreamOfRouter(String conditionId,
                                                       Map<String, List<EdgeLink>> incoming,
                                                       Map<String, List<EdgeLink>> outgoing) {
        List<EdgeLink> ins = incoming.getOrDefault(conditionId, List.of());
        if (ins.size() != 1) {
            return false;
        }
        String upstreamId = ins.get(0).sourceId();
        return outgoing.getOrDefault(upstreamId, List.of()).size() >= 2;
    }

    private boolean isLegalBranchMergeNode(String mergeNodeId,
                                           Map<String, JsonNode> nodeMap,
                                           Map<String, List<EdgeLink>> incoming,
                                           Map<String, List<EdgeLink>> outgoing) {
        if (outgoing.getOrDefault(mergeNodeId, List.of()).size() > 1) {
            return false;
        }
        if (incoming.getOrDefault(mergeNodeId, List.of()).size() <= 1) {
            return true;
        }

        for (Map.Entry<String, List<EdgeLink>> entry : outgoing.entrySet()) {
            String routerId = entry.getKey();
            if (mergeNodeId.equals(routerId) || entry.getValue().size() < 2) {
                continue;
            }
            if (!nodeMap.containsKey(routerId)) {
                continue;
            }
            JsonNode routerNode = nodeMap.get(routerId);
            if ("PARALLEL".equalsIgnoreCase(text(routerNode, "type")) && isMultiBranchDecisionNode(routerNode)) {
                EdgeLink defaultEdge = resolveDefaultEdge(routerId, entry.getValue());
                if (defaultEdge == null || !mergeNodeId.equals(defaultEdge.targetId())) {
                    continue;
                }
            }
            boolean allBranchesReachMerge = true;
            for (EdgeLink edge : entry.getValue()) {
                if (!isReachableToTarget(edge.targetId(), mergeNodeId, outgoing, new HashSet<>())) {
                    allBranchesReachMerge = false;
                    break;
                }
            }
            if (allBranchesReachMerge
                    && allIncomingSourcesBelongToRouterBranches(mergeNodeId, routerId, entry.getValue(), incoming, outgoing)) {
                return true;
            }
        }
        return false;
    }

    private boolean allIncomingSourcesBelongToRouterBranches(String mergeNodeId,
                                                             String routerId,
                                                             List<EdgeLink> routerEdges,
                                                             Map<String, List<EdgeLink>> incoming,
                                                             Map<String, List<EdgeLink>> outgoing) {
        Set<String> branchScope = new HashSet<>();
        branchScope.add(routerId);
        for (EdgeLink edge : routerEdges) {
            collectBranchScopeUntilTarget(edge.targetId(), mergeNodeId, outgoing, branchScope, new HashSet<>());
        }
        for (EdgeLink incomingEdge : incoming.getOrDefault(mergeNodeId, List.of())) {
            if (!branchScope.contains(incomingEdge.sourceId())) {
                return false;
            }
        }
        return true;
    }

    private void collectBranchScopeUntilTarget(String currentId,
                                               String targetId,
                                               Map<String, List<EdgeLink>> outgoing,
                                               Set<String> branchScope,
                                               Set<String> visited) {
        if (!StringUtils.hasText(currentId) || currentId.equals(targetId) || !visited.add(currentId)) {
            return;
        }
        branchScope.add(currentId);
        for (EdgeLink edge : outgoing.getOrDefault(currentId, List.of())) {
            collectBranchScopeUntilTarget(edge.targetId(), targetId, outgoing, branchScope, visited);
        }
    }

    private boolean isReachableToTarget(String currentId,
                                        String targetId,
                                        Map<String, List<EdgeLink>> outgoing,
                                        Set<String> visited) {
        if (!StringUtils.hasText(currentId) || !visited.add(currentId)) {
            return false;
        }
        if (currentId.equals(targetId)) {
            return true;
        }
        for (EdgeLink edge : outgoing.getOrDefault(currentId, List.of())) {
            if (isReachableToTarget(edge.targetId(), targetId, outgoing, visited)) {
                return true;
            }
        }
        return false;
    }

    private boolean isMultiBranchDecisionNode(JsonNode node) {
        if (node == null) {
            return false;
        }
        String type = text(node, "type");
        if (type == null) {
            return false;
        }
        String upperType = type.toUpperCase(Locale.ROOT);
        if ("CONDITION".equals(upperType) || "GATEWAY".equals(upperType)) {
            return true;
        }
        if ("PARALLEL".equals(upperType)) {
            String signType = text(node, "signType");
            // 分支模式：signType 缺失或不属于合规会签模式
            return signType == null
                    || !PARALLEL_SIGN_MODES.contains(signType.trim().toUpperCase(Locale.ROOT));
        }
        return false;
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
