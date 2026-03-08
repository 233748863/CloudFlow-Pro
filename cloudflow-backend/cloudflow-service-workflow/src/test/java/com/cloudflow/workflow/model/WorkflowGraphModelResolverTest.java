package com.cloudflow.workflow.model;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.exception.WorkflowException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WorkflowGraphModelResolverTest {

    private final WorkflowGraphModelResolver workflowGraphModelResolver = new WorkflowGraphModelResolver();

    @Test
    void parseRuntimeGraphShouldBuildNodeAndEdgeIndexes() {
        String modelJson = """
                {
                  "nodes": [
                    { "id": "start", "type": "START", "title": "开始" },
                    { "id": "approval_1", "type": "APPROVAL", "title": "主管审批", "approverType": "ROLE", "approverValue": "ADMIN" },
                    { "id": "end", "type": "END", "title": "结束" }
                  ],
                  "edges": [
                    { "source": "start", "target": "approval_1" },
                    { "source": "approval_1", "target": "end" }
                  ]
                }
                """;

        WorkflowRuntimeGraph runtimeGraph = workflowGraphModelResolver.parseRuntimeGraph(modelJson);

        assertEquals("start", runtimeGraph.getStartNodeId());
        assertEquals("approval_1", runtimeGraph.getFirstExecutableNodeId());
        assertEquals(3, runtimeGraph.getNodeIds().size());
        assertEquals(1, runtimeGraph.getOutgoingEdges("start").size());
        assertEquals(1, runtimeGraph.getIncomingEdges("approval_1").size());

        WfNodeConfig approvalNode = runtimeGraph.getNode("approval_1");
        assertNotNull(approvalNode);
        assertEquals("APPROVAL", approvalNode.getType());
        assertEquals("ROLE", approvalNode.getApproverType());
        assertEquals("ADMIN", approvalNode.getApproverValue());
    }

    @Test
    void parseRuntimeRootShouldAttachRuntimeGraphToRootProps() {
        String modelJson = """
                {
                  "nodes": [
                    { "id": "start", "type": "START", "title": "开始" },
                    { "id": "main", "type": "APPROVAL", "title": "主线审批", "approverType": "ROLE", "approverValue": "ADMIN" },
                    { "id": "alt", "type": "APPROVAL", "title": "备用审批", "approverType": "ROLE", "approverValue": "HR" },
                    { "id": "end_main", "type": "END", "title": "主线结束" },
                    { "id": "end_alt", "type": "END", "title": "备用结束" }
                  ],
                  "edges": [
                    { "source": "start", "target": "main", "isDefault": true },
                    { "source": "start", "target": "alt", "condition": "amount > 1000" },
                    { "source": "main", "target": "end_main" },
                    { "source": "alt", "target": "end_alt" }
                  ]
                }
                """;

        WfNodeConfig rootNode = workflowGraphModelResolver.parseRuntimeRoot(modelJson);
        WorkflowRuntimeGraph runtimeGraph = workflowGraphModelResolver.resolveRuntimeGraph(rootNode);

        assertNotNull(rootNode);
        assertEquals("start", rootNode.getId());
        assertNotNull(rootNode.getProps());
        assertNotNull(runtimeGraph);
        assertEquals("main", runtimeGraph.getFirstExecutableNodeId());
        assertEquals("main", runtimeGraph.findDefaultOrFirstOutgoingEdge("start").getTargetId());
    }

    @Test
    void parseRuntimeGraphShouldRejectLegacyTreeModel() {
        String legacyTreeJson = """
                {
                  "id": "start",
                  "type": "START",
                  "title": "开始",
                  "next": {
                    "id": "end",
                    "type": "END",
                    "title": "结束"
                  }
                }
                """;

        WorkflowException exception = assertThrows(
                WorkflowException.class,
                () -> workflowGraphModelResolver.parseRuntimeGraph(legacyTreeJson)
        );

        assertEquals("VALIDATION_ERROR", exception.getCode());
        assertFalse(workflowGraphModelResolver.validateGraphModel(legacyTreeJson));
    }

    @Test
    void parseRuntimeGraphShouldRejectMultipleDefaultEdgesFromSameNode() {
        String invalidGraphJson = """
                {
                  "nodes": [
                    { "id": "start", "type": "START", "title": "开始" },
                    { "id": "a", "type": "APPROVAL", "title": "A", "approverType": "ROLE", "approverValue": "ADMIN" },
                    { "id": "b", "type": "APPROVAL", "title": "B", "approverType": "ROLE", "approverValue": "HR" },
                    { "id": "end_a", "type": "END", "title": "结束A" },
                    { "id": "end_b", "type": "END", "title": "结束B" }
                  ],
                  "edges": [
                    { "source": "start", "target": "a", "isDefault": true },
                    { "source": "start", "target": "b", "isDefault": true },
                    { "source": "a", "target": "end_a" },
                    { "source": "b", "target": "end_b" }
                  ]
                }
                """;

        WorkflowException exception = assertThrows(
                WorkflowException.class,
                () -> workflowGraphModelResolver.parseRuntimeGraph(invalidGraphJson)
        );

        assertEquals("VALIDATION_ERROR", exception.getCode());
        assertFalse(workflowGraphModelResolver.validateGraphModel(invalidGraphJson));
    }

    @Test
    void parseRuntimeGraphShouldRejectUnreachableNode() {
        String invalidGraphJson = """
                {
                  "nodes": [
                    { "id": "start", "type": "START", "title": "开始" },
                    { "id": "approval_1", "type": "APPROVAL", "title": "审批", "approverType": "ROLE", "approverValue": "ADMIN" },
                    { "id": "end", "type": "END", "title": "结束" },
                    { "id": "orphan", "type": "NOTIFICATION", "title": "孤立节点" }
                  ],
                  "edges": [
                    { "source": "start", "target": "approval_1" },
                    { "source": "approval_1", "target": "end" }
                  ]
                }
                """;

        WorkflowException exception = assertThrows(
                WorkflowException.class,
                () -> workflowGraphModelResolver.parseRuntimeGraph(invalidGraphJson)
        );

        assertEquals("VALIDATION_ERROR", exception.getCode());
        assertNull(workflowGraphModelResolver.resolveRuntimeGraph(null));
        assertTrue(exception.getMessage() != null && !exception.getMessage().isBlank());
    }
}
