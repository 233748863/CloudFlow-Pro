package com.cloudflow.workflow.model;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.service.InitiatorSelectionService;
import com.cloudflow.workflow.service.WorkflowRejectPolicy;

import java.util.Set;

public final class WorkflowNodeConfigValidator {
    private WorkflowNodeConfigValidator() {
    }

    /** New definition writes must not promise a self-approval policy for manual work. */
    public static void validateForSave(WorkflowRuntimeGraph graph) {
        for (String nodeId : graph.getNodeIds()) {
            WfNodeConfig node = graph.getNode(nodeId);
            if ("MANUAL".equalsIgnoreCase(node.getType()) && node.getApproveSelf() != null
                    && !"ALLOW".equals(node.getApproveSelf())) {
                throw WorkflowException.validationError("人工任务必须人工办理，不能配置自审跳过或转派策略；请移除自审配置后保存");
            }
        }
    }

    public static void validate(WorkflowRuntimeGraph graph) {
        for (String nodeId : graph.getNodeIds()) {
            WfNodeConfig node = graph.getNode(nodeId);
            com.cloudflow.workflow.service.CountersignWeightService.validate(node);
            com.cloudflow.workflow.handler.impl.TimerNodeHandler.validate(node);
            com.cloudflow.workflow.service.WorkflowTriggerExecutor.validate(node);
            assertValue(node.getApproveSelf(), Set.of("ALLOW", "AUTO_SKIP", "TO_DIRECT_LEADER", "TO_DEPT_MANAGER"), "自审策略");
            assertValue(node.getSlaAction(), Set.of("AUTO_PASS", "AUTO_REJECT"), "任务超时动作");
            if ("INITIATOR_SELECTED".equals(node.getApproverType()) && Boolean.FALSE.equals(node.getAllowSelection())) {
                throw WorkflowException.validationError("发起人自选节点必须允许选人");
            }
            String rejectStrategy = WorkflowRejectPolicy.resolve(null, node);
            if ("TO_SPECIFIED_NODE".equals(rejectStrategy)) {
                WorkflowRejectPolicy.assertUpstream(graph, nodeId, node.getRejectToNodeKey());
            }
            if ("MULTI_LEVEL_MANAGER".equals(node.getApproverType())) {
                if (node.getDirectorLevel() != null && (node.getDirectorLevel() < 1 || node.getDirectorLevel() > 10)) {
                    throw WorkflowException.validationError("主管层级必须在1至10之间");
                }
                assertValue(node.getDirectorFallback(), Set.of("TOP_LEVEL", "SKIP", "FAIL"), "主管层级不足策略");
            }
            if ("INITIATOR_SELECTED".equals(node.getApproverType()) && node.getSelectableScope() != null) {
                if (!Set.of("roleIds", "deptIds").containsAll(node.getSelectableScope().keySet())) {
                    throw WorkflowException.validationError("可选范围仅支持roleIds和deptIds");
                }
                InitiatorSelectionService.scopeIds(node.getSelectableScope().get("roleIds"));
                InitiatorSelectionService.scopeIds(node.getSelectableScope().get("deptIds"));
            }
        }
    }

    public static void assertValue(String value, Set<String> allowed, String label) {
        if (value != null && !allowed.contains(value)) {
            throw WorkflowException.validationError("未知" + label + ": " + value);
        }
    }
}
