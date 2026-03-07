package com.cloudflow.workflow.model;

import com.cloudflow.workflow.domain.WfNodeConfig;
import org.springframework.util.StringUtils;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * nodes+edges 运行时图模型。
 * 用于执行阶段按 nodeId / edge 快速导航，避免依赖树结构递归查找。
 */
public class WorkflowRuntimeGraph implements Serializable {

    private final String startNodeId;
    private final String firstExecutableNodeId;
    private final Map<String, WfNodeConfig> nodeIndex;
    private final Map<String, List<EdgeLink>> outgoingIndex;
    private final Map<String, List<EdgeLink>> incomingIndex;

    public WorkflowRuntimeGraph(String startNodeId,
                                String firstExecutableNodeId,
                                Map<String, WfNodeConfig> nodeIndex,
                                Map<String, List<EdgeLink>> outgoingIndex,
                                Map<String, List<EdgeLink>> incomingIndex) {
        this.startNodeId = startNodeId;
        this.firstExecutableNodeId = firstExecutableNodeId;
        this.nodeIndex = unmodifiableNodeMap(nodeIndex);
        this.outgoingIndex = unmodifiableEdgeMap(outgoingIndex);
        this.incomingIndex = unmodifiableEdgeMap(incomingIndex);
    }

    public String getStartNodeId() {
        return startNodeId;
    }

    public String getFirstExecutableNodeId() {
        return firstExecutableNodeId;
    }

    public WfNodeConfig getNode(String nodeId) {
        if (!StringUtils.hasText(nodeId)) {
            return null;
        }
        return nodeIndex.get(nodeId);
    }

    public List<EdgeLink> getOutgoingEdges(String sourceId) {
        if (!StringUtils.hasText(sourceId)) {
            return List.of();
        }
        return outgoingIndex.getOrDefault(sourceId, List.of());
    }

    public List<EdgeLink> getIncomingEdges(String targetId) {
        if (!StringUtils.hasText(targetId)) {
            return List.of();
        }
        return incomingIndex.getOrDefault(targetId, List.of());
    }

    public Set<String> getNodeIds() {
        return nodeIndex.keySet();
    }

    /**
     * 查找默认出边。
     * 规则：
     * 1. 仅有一条出边时，直接返回该边；
     * 2. 存在多条出边时，仅返回标记为 default 的出边；
     * 3. 多出边且未配置 default 时，返回 null。
     */
    public EdgeLink findDefaultOrFirstOutgoingEdge(String sourceId) {
        List<EdgeLink> outgoing = getOutgoingEdges(sourceId);
        if (outgoing.isEmpty()) {
            return null;
        }
        if (outgoing.size() == 1) {
            return outgoing.get(0);
        }
        for (EdgeLink edge : outgoing) {
            if (edge.isDefault()) {
                return edge;
            }
        }
        return null;
    }

    private static Map<String, WfNodeConfig> unmodifiableNodeMap(Map<String, WfNodeConfig> source) {
        if (source == null || source.isEmpty()) {
            return Map.of();
        }
        return Collections.unmodifiableMap(new LinkedHashMap<>(source));
    }

    private static Map<String, List<EdgeLink>> unmodifiableEdgeMap(Map<String, List<EdgeLink>> source) {
        if (source == null || source.isEmpty()) {
            return Map.of();
        }
        Map<String, List<EdgeLink>> copy = new LinkedHashMap<>();
        for (Map.Entry<String, List<EdgeLink>> entry : source.entrySet()) {
            List<EdgeLink> value = entry.getValue();
            copy.put(entry.getKey(), value == null ? List.of() : List.copyOf(new ArrayList<>(value)));
        }
        return Collections.unmodifiableMap(copy);
    }

    public static final class EdgeLink implements Serializable {
        private final String sourceId;
        private final String targetId;
        private final String condition;
        private final boolean isDefault;

        public EdgeLink(String sourceId, String targetId, String condition, boolean isDefault) {
            this.sourceId = sourceId;
            this.targetId = targetId;
            this.condition = condition;
            this.isDefault = isDefault;
        }

        public String getSourceId() {
            return sourceId;
        }

        public String getTargetId() {
            return targetId;
        }

        public String getCondition() {
            return condition;
        }

        public boolean isDefault() {
            return isDefault;
        }
    }
}
