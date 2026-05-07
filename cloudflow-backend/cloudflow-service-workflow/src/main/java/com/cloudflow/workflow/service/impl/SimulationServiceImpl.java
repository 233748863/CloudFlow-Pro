package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.dto.SimulationNodeDetail;
import com.cloudflow.workflow.domain.dto.SimulationRequest;
import com.cloudflow.workflow.domain.dto.SimulationResult;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.model.WorkflowRuntimeGraph;
import com.cloudflow.workflow.service.INodeExecutionService;
import com.cloudflow.workflow.service.ISimulationService;
import com.cloudflow.workflow.service.IWfDefinitionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.*;

@Service
public class SimulationServiceImpl implements ISimulationService {

    @Autowired
    private IWfDefinitionService definitionService;

    @Autowired
    private WorkflowGraphModelResolver graphModelResolver;

    @Autowired
    private INodeExecutionService nodeExecutionService;

    @Override
    public SimulationResult simulateProcess(SimulationRequest request) {
        SimulationResult result = new SimulationResult();

        WfProcessDefinition definition = definitionService.getProcessDefinition(request.getDefinitionId());
        if (definition == null) {
            result.setSuccess(false);
            result.getErrors().add("流程定义不存在: " + request.getDefinitionId());
            return result;
        }

        if (!StringUtils.hasText(definition.getModelJson())) {
            result.setSuccess(false);
            result.getErrors().add("流程定义模型为空");
            return result;
        }

        WorkflowRuntimeGraph graph;
        try {
            graph = graphModelResolver.parseRuntimeGraph(definition.getModelJson());
        } catch (Exception e) {
            result.setSuccess(false);
            result.getErrors().add("流程模型解析失败: " + e.getMessage());
            return result;
        }

        Map<String, Object> variables = request.getVariables() != null ? request.getVariables() : new HashMap<>();
        int maxDepth = request.getMaxDepth() > 0 ? request.getMaxDepth() : 50;

        Set<String> allNodeIds = graph.getNodeIds();
        result.setTotalNodes(allNodeIds.size());

        Map<String, SimulationNodeDetail> detailMap = new LinkedHashMap<>();
        for (String nodeId : allNodeIds) {
            WfNodeConfig node = graph.getNode(nodeId);
            SimulationNodeDetail detail = new SimulationNodeDetail();
            detail.setNodeId(nodeId);
            detail.setNodeType(node != null ? node.getType() : "UNKNOWN");
            detail.setTitle(node != null ? node.getTitle() : "");
            detail.setReached(false);
            detailMap.put(nodeId, detail);
        }

        List<SimulationResult.SimulationPath> paths = new ArrayList<>();
        String startNodeId = graph.getStartNodeId();

        if (request.isSimulateAllBranches()) {
            simulateAllBranches(graph, startNodeId, variables, maxDepth, detailMap, paths, new ArrayList<>(), new HashSet<>(), result);
        } else {
            SimulationResult.SimulationPath path = new SimulationResult.SimulationPath();
            simulatePath(graph, startNodeId, variables, maxDepth, 0, detailMap, path, new HashSet<>(), result);
            paths.add(path);
        }

        result.setPaths(paths);

        int reachable = 0;
        for (SimulationNodeDetail detail : detailMap.values()) {
            if (detail.isReached()) {
                reachable++;
            } else {
                result.getUnreachableNodes().add(detail.getNodeId());
            }
        }
        result.setReachableNodes(reachable);
        result.setNodeDetails(new ArrayList<>(detailMap.values()));
        result.setSuccess(result.getErrors().isEmpty());

        return result;
    }

    @Override
    public SimulationResult validateDefinition(String definitionId) {
        SimulationResult result = new SimulationResult();

        WfProcessDefinition definition = definitionService.getProcessDefinition(definitionId);
        if (definition == null) {
            result.setSuccess(false);
            result.getErrors().add("流程定义不存在");
            return result;
        }

        if (!StringUtils.hasText(definition.getModelJson())) {
            result.setSuccess(false);
            result.getErrors().add("流程定义模型为空");
            return result;
        }

        WorkflowRuntimeGraph graph;
        try {
            graph = graphModelResolver.parseRuntimeGraph(definition.getModelJson());
        } catch (Exception e) {
            result.setSuccess(false);
            result.getErrors().add("流程模型解析失败: " + e.getMessage());
            return result;
        }

        Set<String> allNodeIds = graph.getNodeIds();
        result.setTotalNodes(allNodeIds.size());

        int startCount = 0;
        int endCount = 0;
        for (String nodeId : allNodeIds) {
            WfNodeConfig node = graph.getNode(nodeId);
            if (node == null) continue;
            if ("START".equals(node.getType())) startCount++;
            if ("END".equals(node.getType())) endCount++;

            if ("APPROVAL".equals(node.getType()) || "MANUAL".equals(node.getType())) {
                if (!StringUtils.hasText(node.getApproverType())) {
                    result.getWarnings().add("节点 [" + node.getTitle() + "] 未配置审批人");
                }
            }

            if ("CONDITION".equals(node.getType())) {
                List<WorkflowRuntimeGraph.EdgeLink> outgoing = graph.getOutgoingEdges(nodeId);
                if (outgoing.isEmpty()) {
                    result.getErrors().add("条件节点 [" + node.getTitle() + "] 没有出边");
                }
            }
        }

        if (startCount == 0) {
            result.getErrors().add("缺少 START 节点");
        } else if (startCount > 1) {
            result.getErrors().add("存在多个 START 节点");
        }

        if (endCount == 0) {
            result.getErrors().add("缺少 END 节点");
        }

        // 可达性检查
        Set<String> reachable = new HashSet<>();
        if (graph.getStartNodeId() != null) {
            dfsReachability(graph, graph.getStartNodeId(), reachable);
        }
        result.setReachableNodes(reachable.size());

        for (String nodeId : allNodeIds) {
            if (!reachable.contains(nodeId)) {
                WfNodeConfig node = graph.getNode(nodeId);
                String title = node != null ? node.getTitle() : nodeId;
                result.getUnreachableNodes().add(nodeId);
                result.getWarnings().add("节点 [" + title + "] 从 START 不可达");
            }
        }

        // 环检测
        if (graph.getStartNodeId() != null && hasCycle(graph)) {
            result.getWarnings().add("流程图中存在环路，可能导致无限循环");
        }

        result.setSuccess(result.getErrors().isEmpty());
        return result;
    }

    private void simulatePath(WorkflowRuntimeGraph graph, String nodeId,
                              Map<String, Object> variables, int maxDepth, int depth,
                              Map<String, SimulationNodeDetail> detailMap,
                              SimulationResult.SimulationPath path,
                              Set<String> visited, SimulationResult result) {
        if (depth > maxDepth) {
            result.getWarnings().add("模拟达到最大深度限制 (" + maxDepth + ")，可能存在环路");
            path.setTerminationType("MAX_DEPTH");
            return;
        }

        if (!StringUtils.hasText(nodeId)) {
            path.setTerminationType("NO_NEXT_NODE");
            return;
        }

        if (visited.contains(nodeId)) {
            result.getWarnings().add("检测到环路，节点: " + nodeId);
            path.setTerminationType("CYCLE");
            return;
        }

        WfNodeConfig node = graph.getNode(nodeId);
        if (node == null) {
            result.getErrors().add("节点不存在: " + nodeId);
            path.setTerminationType("NODE_NOT_FOUND");
            return;
        }

        visited.add(nodeId);
        SimulationNodeDetail detail = detailMap.get(nodeId);
        if (detail != null) {
            detail.setReached(true);
        }
        path.getNodeIds().add(nodeId);
        path.getNodeTitles().add(node.getTitle() != null ? node.getTitle() : node.getType());

        String nodeType = node.getType();

        switch (nodeType) {
            case "END":
                path.setTerminationType("COMPLETED");
                return;

            case "START":
                advanceToNext(graph, nodeId, variables, maxDepth, depth, detailMap, path, visited, result);
                break;

            case "CONDITION":
                handleConditionNode(graph, node, nodeId, variables, maxDepth, depth, detailMap, path, visited, result);
                break;

            case "APPROVAL":
            case "MANUAL":
                handleApprovalNode(node, detail, result);
                advanceToNext(graph, nodeId, variables, maxDepth, depth, detailMap, path, visited, result);
                break;

            case "PARALLEL":
                handleParallelNode(graph, nodeId, variables, maxDepth, depth, detailMap, path, visited, result);
                break;

            default:
                advanceToNext(graph, nodeId, variables, maxDepth, depth, detailMap, path, visited, result);
                break;
        }
    }

    private void handleConditionNode(WorkflowRuntimeGraph graph, WfNodeConfig node, String nodeId,
                                     Map<String, Object> variables, int maxDepth, int depth,
                                     Map<String, SimulationNodeDetail> detailMap,
                                     SimulationResult.SimulationPath path,
                                     Set<String> visited, SimulationResult result) {
        SimulationNodeDetail detail = detailMap.get(nodeId);
        List<WorkflowRuntimeGraph.EdgeLink> outgoing = graph.getOutgoingEdges(nodeId);

        String nextNodeId = null;
        for (WorkflowRuntimeGraph.EdgeLink edge : outgoing) {
            if (StringUtils.hasText(edge.getCondition())) {
                try {
                    boolean condResult = nodeExecutionService.evaluateCondition(edge.getCondition(), variables);
                    if (condResult) {
                        nextNodeId = edge.getTargetId();
                        if (detail != null) {
                            detail.setConditionResult(true);
                            detail.setBranchTaken(edge.getTargetId());
                        }
                        break;
                    }
                } catch (Exception e) {
                    result.getWarnings().add("条件评估异常 [" + node.getTitle() + "]: " + e.getMessage());
                }
            }
        }

        if (nextNodeId == null) {
            WorkflowRuntimeGraph.EdgeLink defaultEdge = graph.findDefaultOrFirstOutgoingEdge(nodeId);
            if (defaultEdge != null) {
                nextNodeId = defaultEdge.getTargetId();
                if (detail != null) {
                    detail.setConditionResult(false);
                    detail.setBranchTaken(defaultEdge.getTargetId());
                }
            } else if (!outgoing.isEmpty()) {
                nextNodeId = outgoing.get(0).getTargetId();
                if (detail != null) {
                    detail.setBranchTaken(nextNodeId);
                }
                result.getWarnings().add("条件节点 [" + node.getTitle() + "] 无条件匹配且无默认分支，使用第一条出边");
            }
        }

        if (nextNodeId != null) {
            simulatePath(graph, nextNodeId, variables, maxDepth, depth + 1, detailMap, path, visited, result);
        } else {
            result.getErrors().add("条件节点 [" + node.getTitle() + "] 无法确定下一步");
            path.setTerminationType("DEAD_END");
        }
    }

    private void handleApprovalNode(WfNodeConfig node, SimulationNodeDetail detail, SimulationResult result) {
        if (detail == null) return;
        try {
            String desc = nodeExecutionService.resolveAssigneeDescription(node.getApproverType(), node.getApproverValue());
            if (StringUtils.hasText(desc)) {
                detail.getResolvedAssignees().add(desc);
            }
        } catch (Exception e) {
            detail.getWarnings().add("审批人解析失败: " + e.getMessage());
        }

        if (!StringUtils.hasText(node.getApproverType())) {
            detail.getWarnings().add("未配置审批人");
        }
    }

    private void handleParallelNode(WorkflowRuntimeGraph graph, String nodeId,
                                    Map<String, Object> variables, int maxDepth, int depth,
                                    Map<String, SimulationNodeDetail> detailMap,
                                    SimulationResult.SimulationPath path,
                                    Set<String> visited, SimulationResult result) {
        List<WorkflowRuntimeGraph.EdgeLink> outgoing = graph.getOutgoingEdges(nodeId);
        if (outgoing.isEmpty()) {
            path.setTerminationType("DEAD_END");
            return;
        }
        // 模拟第一条分支作为主路径，其余分支标记为已到达
        for (int i = 0; i < outgoing.size(); i++) {
            String targetId = outgoing.get(i).getTargetId();
            if (i == 0) {
                simulatePath(graph, targetId, variables, maxDepth, depth + 1, detailMap, path, visited, result);
            } else {
                markReachable(graph, targetId, detailMap);
            }
        }
    }

    private void advanceToNext(WorkflowRuntimeGraph graph, String nodeId,
                               Map<String, Object> variables, int maxDepth, int depth,
                               Map<String, SimulationNodeDetail> detailMap,
                               SimulationResult.SimulationPath path,
                               Set<String> visited, SimulationResult result) {
        WorkflowRuntimeGraph.EdgeLink edge = graph.findDefaultOrFirstOutgoingEdge(nodeId);
        if (edge != null) {
            simulatePath(graph, edge.getTargetId(), variables, maxDepth, depth + 1, detailMap, path, visited, result);
        } else {
            List<WorkflowRuntimeGraph.EdgeLink> outgoing = graph.getOutgoingEdges(nodeId);
            if (!outgoing.isEmpty()) {
                simulatePath(graph, outgoing.get(0).getTargetId(), variables, maxDepth, depth + 1, detailMap, path, visited, result);
            } else {
                path.setTerminationType("DEAD_END");
            }
        }
    }

    private void simulateAllBranches(WorkflowRuntimeGraph graph, String startNodeId,
                                     Map<String, Object> variables, int maxDepth,
                                     Map<String, SimulationNodeDetail> detailMap,
                                     List<SimulationResult.SimulationPath> paths,
                                     List<String> currentPath, Set<String> visited,
                                     SimulationResult result) {
        if (currentPath.size() > maxDepth) {
            SimulationResult.SimulationPath path = buildPath(currentPath, graph);
            path.setTerminationType("MAX_DEPTH");
            paths.add(path);
            return;
        }

        if (!StringUtils.hasText(startNodeId) || visited.contains(startNodeId)) {
            SimulationResult.SimulationPath path = buildPath(currentPath, graph);
            path.setTerminationType(visited.contains(startNodeId) ? "CYCLE" : "NO_NEXT_NODE");
            paths.add(path);
            return;
        }

        WfNodeConfig node = graph.getNode(startNodeId);
        if (node == null) {
            SimulationResult.SimulationPath path = buildPath(currentPath, graph);
            path.setTerminationType("NODE_NOT_FOUND");
            paths.add(path);
            return;
        }

        visited.add(startNodeId);
        currentPath.add(startNodeId);

        SimulationNodeDetail detail = detailMap.get(startNodeId);
        if (detail != null) {
            detail.setReached(true);
        }

        if ("END".equals(node.getType())) {
            SimulationResult.SimulationPath path = buildPath(currentPath, graph);
            path.setTerminationType("COMPLETED");
            paths.add(path);
        } else {
            List<WorkflowRuntimeGraph.EdgeLink> outgoing = graph.getOutgoingEdges(startNodeId);
            if (outgoing.isEmpty()) {
                SimulationResult.SimulationPath path = buildPath(currentPath, graph);
                path.setTerminationType("DEAD_END");
                paths.add(path);
            } else {
                for (WorkflowRuntimeGraph.EdgeLink edge : outgoing) {
                    simulateAllBranches(graph, edge.getTargetId(), variables, maxDepth,
                            detailMap, paths, new ArrayList<>(currentPath), new HashSet<>(visited), result);
                }
            }
        }
    }

    private SimulationResult.SimulationPath buildPath(List<String> nodeIds, WorkflowRuntimeGraph graph) {
        SimulationResult.SimulationPath path = new SimulationResult.SimulationPath();
        path.setNodeIds(new ArrayList<>(nodeIds));
        List<String> titles = new ArrayList<>();
        for (String id : nodeIds) {
            WfNodeConfig n = graph.getNode(id);
            titles.add(n != null && n.getTitle() != null ? n.getTitle() : id);
        }
        path.setNodeTitles(titles);
        return path;
    }

    private void markReachable(WorkflowRuntimeGraph graph, String nodeId, Map<String, SimulationNodeDetail> detailMap) {
        if (!StringUtils.hasText(nodeId)) return;
        SimulationNodeDetail detail = detailMap.get(nodeId);
        if (detail != null && !detail.isReached()) {
            detail.setReached(true);
        }
    }

    private void dfsReachability(WorkflowRuntimeGraph graph, String nodeId, Set<String> visited) {
        if (!StringUtils.hasText(nodeId) || visited.contains(nodeId)) return;
        visited.add(nodeId);
        for (WorkflowRuntimeGraph.EdgeLink edge : graph.getOutgoingEdges(nodeId)) {
            dfsReachability(graph, edge.getTargetId(), visited);
        }
    }

    private boolean hasCycle(WorkflowRuntimeGraph graph) {
        Set<String> visited = new HashSet<>();
        Set<String> inStack = new HashSet<>();
        for (String nodeId : graph.getNodeIds()) {
            if (dfsCycleDetect(graph, nodeId, visited, inStack)) {
                return true;
            }
        }
        return false;
    }

    private boolean dfsCycleDetect(WorkflowRuntimeGraph graph, String nodeId, Set<String> visited, Set<String> inStack) {
        if (inStack.contains(nodeId)) return true;
        if (visited.contains(nodeId)) return false;
        visited.add(nodeId);
        inStack.add(nodeId);
        for (WorkflowRuntimeGraph.EdgeLink edge : graph.getOutgoingEdges(nodeId)) {
            if (dfsCycleDetect(graph, edge.getTargetId(), visited, inStack)) {
                return true;
            }
        }
        inStack.remove(nodeId);
        return false;
    }
}
