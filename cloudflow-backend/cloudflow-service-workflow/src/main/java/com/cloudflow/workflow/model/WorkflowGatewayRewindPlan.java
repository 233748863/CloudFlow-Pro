package com.cloudflow.workflow.model;

import com.cloudflow.workflow.domain.WfGatewayActivation;
import com.cloudflow.workflow.service.WorkflowExecutionContext;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public record WorkflowGatewayRewindPlan(String targetKey, WorkflowExecutionContext.Frame context, String restartedGateway) {
    public static WorkflowGatewayRewindPlan resolve(WorkflowRuntimeGraph graph, String targetKey,
                                                     WorkflowExecutionContext.Frame current,
                                                     Map<String, WfGatewayActivation> activations) {
        List<WorkflowExecutionContext.Frame> frames = new ArrayList<>();
        for (WorkflowExecutionContext.Frame frame = current; frame != null; frame = frame.parent()) frames.add(0, frame);
        WorkflowExecutionContext.Frame retained = null;
        List<WorkflowGatewayTopology.BranchScope> scopes = WorkflowGatewayTopology.scopes(graph, targetKey);
        for (int index = 0; index < scopes.size(); index++) {
            WorkflowGatewayTopology.BranchScope scope = scopes.get(index);
            if (index >= frames.size()) return new WorkflowGatewayRewindPlan(scope.gatewayId(), retained, scope.gatewayId());
            WorkflowExecutionContext.Frame frame = frames.get(index);
            WfGatewayActivation activation = activations.get(frame.activationId());
            if (activation == null || !"WAITING".equals(activation.getStatus())
                    || !Objects.equals(WorkflowExecutionContext.parse(activation.getParentContext()), frame.parent())) {
                throw WorkflowExecutionContext.invalid();
            }
            if (!scope.gatewayId().equals(activation.getGatewayId())) {
                return new WorkflowGatewayRewindPlan(scope.gatewayId(), retained, scope.gatewayId());
            }
            if (!scope.branchKey().equals(frame.branchKey())) throw WorkflowExecutionContext.invalid();
            retained = frame;
        }
        return new WorkflowGatewayRewindPlan(targetKey, retained, WorkflowGatewayTopology.isSplit(graph.getNode(targetKey)) ? targetKey : null);
    }
}
