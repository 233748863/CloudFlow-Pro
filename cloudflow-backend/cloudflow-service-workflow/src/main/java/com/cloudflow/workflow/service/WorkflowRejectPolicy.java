package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.model.WorkflowRuntimeGraph;

import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.Set;

public final class WorkflowRejectPolicy {
    public static final Set<String> STRATEGIES = Set.of("TO_INITIATOR", "TO_PREVIOUS_NODE",
            "TO_SPECIFIED_NODE", "TERMINATE", "TO_PARENT_NODE");

    private WorkflowRejectPolicy() {
    }

    public static String resolve(String requested, WfNodeConfig node) {
        String strategy = requested != null ? requested : node == null ? null : node.getRejectStrategy();
        if (strategy != null && !STRATEGIES.contains(strategy)) {
            throw WorkflowException.validationError("未知驳回策略: " + strategy);
        }
        return strategy;
    }

    /** 无策略、无目标的驳回默认回发起人；显式目标继续使用既有指定节点回退。 */
    public static String resolve(String requested, WfNodeConfig node, String targetNodeKey) {
        String strategy = resolve(requested, node);
        return strategy == null && (targetNodeKey == null || targetNodeKey.isBlank())
                ? "TO_INITIATOR" : strategy;
    }

    public static void assertUpstream(WorkflowRuntimeGraph graph, String currentNodeKey, String targetNodeKey) {
        if (targetNodeKey == null || graph.getNode(targetNodeKey) == null) {
            throw WorkflowException.validationError("驳回目标节点不存在");
        }
        Set<String> visited = new HashSet<>();
        ArrayDeque<String> pending = new ArrayDeque<>();
        pending.add(currentNodeKey);
        while (!pending.isEmpty()) {
            for (WorkflowRuntimeGraph.EdgeLink edge : graph.getIncomingEdges(pending.removeFirst())) {
                if (visited.add(edge.getSourceId())) {
                    pending.addLast(edge.getSourceId());
                }
            }
        }
        if (currentNodeKey.equals(targetNodeKey) || !visited.contains(targetNodeKey)) {
            throw WorkflowException.validationError("只能驳回到上游节点，不能选择当前节点、下游或并行兄弟分支");
        }
    }
}
