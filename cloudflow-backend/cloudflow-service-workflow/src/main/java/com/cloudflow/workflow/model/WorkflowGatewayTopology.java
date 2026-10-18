package com.cloudflow.workflow.model;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.exception.WorkflowException;
import org.springframework.util.StringUtils;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public final class WorkflowGatewayTopology {
    private WorkflowGatewayTopology() {
    }

    public record Split(String gatewayId, String type, String joinNodeKey, List<WorkflowRuntimeGraph.EdgeLink> branches) {
    }

    public record BranchScope(String gatewayId, String branchKey, Set<String> nodes) {
    }

    public static List<BranchScope> scopes(WorkflowRuntimeGraph graph, String nodeKey) {
        List<BranchScope> scopes = new ArrayList<>();
        for (String gatewayId : graph.getNodeIds()) {
            WfNodeConfig gateway = graph.getNode(gatewayId);
            if (!isSplit(gateway)) continue;
            Split split = split(graph, gateway);
            for (WorkflowRuntimeGraph.EdgeLink branch : split.branches()) {
                Set<String> region = branchRegion(graph, split, branch.getTargetId());
                if (region.contains(nodeKey)) scopes.add(new BranchScope(gatewayId, branch.getId(), Set.copyOf(region)));
            }
        }
        scopes.sort(java.util.Comparator.comparingInt((BranchScope scope) -> scope.nodes().size()).reversed());
        return List.copyOf(scopes);
    }

    public static boolean isSplit(WfNodeConfig node) {
        return node != null && ("INCLUSIVE".equals(node.getType())
                || ("PARALLEL".equals(node.getType()) && !StringUtils.hasText(node.getSignType())));
    }

    public static Split split(WorkflowRuntimeGraph graph, WfNodeConfig node) {
        if (!isSplit(node)) throw invalid("节点未配置并行或包含分流");
        List<WorkflowRuntimeGraph.EdgeLink> outgoing = graph.getOutgoingEdges(node.getId());
        String joinKey = node.getJoinNodeKey();
        WorkflowRuntimeGraph.EdgeLink joinPointer = null;
        if ("PARALLEL".equals(node.getType())) {
            for (WorkflowRuntimeGraph.EdgeLink edge : outgoing) {
                if (edge.isDefault()) {
                    if (joinKey != null && !joinKey.equals(edge.getTargetId())) {
                        throw invalid("并行网关默认连线必须指向配对汇聚点: " + node.getId());
                    }
                    joinKey = edge.getTargetId();
                    joinPointer = edge;
                }
            }
        }
        if (!StringUtils.hasText(joinKey) || graph.getNode(joinKey) == null || node.getId().equals(joinKey)) {
            throw invalid("网关必须配置有效的配对汇聚点: " + node.getId());
        }
        List<WorkflowRuntimeGraph.EdgeLink> branches = new ArrayList<>();
        for (WorkflowRuntimeGraph.EdgeLink edge : outgoing) {
            if (edge != joinPointer) branches.add(edge);
        }
        if (branches.isEmpty()) throw invalid("网关没有可执行分支: " + node.getId());
        return new Split(node.getId(), node.getType(), joinKey, List.copyOf(branches));
    }

    public static boolean isJoin(WorkflowRuntimeGraph graph, String nodeKey) {
        for (String gatewayId : graph.getNodeIds()) {
            WfNodeConfig node = graph.getNode(gatewayId);
            if (isSplit(node) && split(graph, node).joinNodeKey().equals(nodeKey)) return true;
        }
        return false;
    }

    public static void validate(WorkflowRuntimeGraph graph) {
        Set<String> joins = new HashSet<>();
        for (String nodeId : graph.getNodeIds()) {
            WfNodeConfig node = graph.getNode(nodeId);
            if (!isSplit(node)) continue;
            Split split = split(graph, node);
            if (!joins.add(split.joinNodeKey())) throw invalid("不同网关不能共用配对汇聚点: " + split.joinNodeKey());
            if ("START".equals(graph.getNode(split.joinNodeKey()).getType())) throw invalid("开始节点不能作为汇聚点");
            Set<String> allBranches = new LinkedHashSet<>();
            for (WorkflowRuntimeGraph.EdgeLink branch : split.branches()) {
                Set<String> region = branchRegion(graph, split, branch.getTargetId());
                for (String member : region) {
                    if (!allBranches.add(member)) throw invalid("分支在配对汇聚点前相交: " + member);
                    for (WorkflowRuntimeGraph.EdgeLink incoming : graph.getIncomingEdges(member)) {
                        if (!region.contains(incoming.getSourceId()) && !split.gatewayId().equals(incoming.getSourceId())) {
                            throw invalid("连线跨入其他网关分支: " + incoming.getId());
                        }
                    }
                }
            }
            for (WorkflowRuntimeGraph.EdgeLink incoming : graph.getIncomingEdges(split.joinNodeKey())) {
                if (!allBranches.contains(incoming.getSourceId()) && !split.gatewayId().equals(incoming.getSourceId())) {
                    throw invalid("连线绕过分流直接进入汇聚点: " + incoming.getId());
                }
            }
        }
    }

    private static Set<String> branchRegion(WorkflowRuntimeGraph graph, Split split, String firstNodeId) {
        Set<String> region = new LinkedHashSet<>();
        ArrayDeque<String> pending = new ArrayDeque<>();
        pending.add(firstNodeId);
        while (!pending.isEmpty()) {
            String current = pending.removeFirst();
            if (current.equals(split.joinNodeKey()) || !region.add(current)) continue;
            WfNodeConfig node = graph.getNode(current);
            if (node == null || current.equals(split.gatewayId()) || "START".equals(node.getType()) || "END".equals(node.getType())) {
                throw invalid("分支越过配对汇聚点或返回未结束的分流: " + current);
            }
            List<WorkflowRuntimeGraph.EdgeLink> outgoing = graph.getOutgoingEdges(current);
            if (outgoing.isEmpty()) throw invalid("分支未连接到配对汇聚点: " + current);
            for (WorkflowRuntimeGraph.EdgeLink edge : outgoing) pending.addLast(edge.getTargetId());
        }
        Set<String> reachesJoin = new HashSet<>();
        pending.add(split.joinNodeKey());
        while (!pending.isEmpty()) {
            String current = pending.removeFirst();
            if (!reachesJoin.add(current)) continue;
            for (WorkflowRuntimeGraph.EdgeLink edge : graph.getIncomingEdges(current)) {
                if (region.contains(edge.getSourceId())) pending.addLast(edge.getSourceId());
            }
        }
        if (!reachesJoin.containsAll(region)) throw invalid("分支存在无法到达汇聚点的循环: " + split.gatewayId());
        return region;
    }

    private static WorkflowException invalid(String message) {
        return WorkflowException.validationError(message);
    }
}
