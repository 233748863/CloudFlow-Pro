package com.cloudflow.workflow.model;

import com.cloudflow.workflow.domain.WfNodeConfig;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;

public final class WorkflowGatewayRouting {
    private WorkflowGatewayRouting() {
    }

    public static List<WorkflowRuntimeGraph.EdgeLink> outgoing(WorkflowRuntimeGraph graph, WfNodeConfig node) {
        return WorkflowGatewayTopology.isSplit(node) ? WorkflowGatewayTopology.split(graph, node).branches()
                : graph.getOutgoingEdges(node.getId());
    }

    public static List<WorkflowRuntimeGraph.EdgeLink> select(WorkflowRuntimeGraph graph, WfNodeConfig node,
                                                            Predicate<String> matches) {
        List<WorkflowRuntimeGraph.EdgeLink> outgoing = outgoing(graph, node);
        if ("PARALLEL".equals(node.getType()) && !StringUtils.hasText(node.getSignType())) return outgoing;
        List<WorkflowRuntimeGraph.EdgeLink> selected = new ArrayList<>();
        WorkflowRuntimeGraph.EdgeLink fallback = null;
        for (WorkflowRuntimeGraph.EdgeLink edge : outgoing) {
            if (edge.isDefault()) {
                fallback = edge;
                continue;
            }
            WfNodeConfig target = graph.getNode(edge.getTargetId());
            String condition = StringUtils.hasText(edge.getCondition()) ? edge.getCondition()
                    : target == null ? null : target.getCondition();
            if (matches.test(condition)) {
                selected.add(edge);
                if (!"INCLUSIVE".equals(node.getType())) break;
            }
        }
        if (selected.isEmpty() && fallback != null) selected.add(fallback);
        return List.copyOf(selected);
    }
}
