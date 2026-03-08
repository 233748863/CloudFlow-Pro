package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.model.WorkflowModelBridge;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NodeExecutionServiceImplTest {

    private final WorkflowModelBridge workflowModelBridge = new WorkflowModelBridge();

    @Test
    void findNextNodeShouldPreferDefaultEdgeWhenMultipleOutgoingEdgesExist() {
        TestNodeExecutionService service = createService();
        WfNodeConfig root = workflowModelBridge.parseRuntimeRoot("""
                {
                  "nodes": [
                    { "id": "start", "type": "START", "title": "开始" },
                    { "id": "gateway", "type": "CONDITION", "title": "条件网关" },
                    { "id": "default_approval", "type": "APPROVAL", "title": "默认审批", "approverType": "ROLE", "approverValue": "ADMIN" },
                    { "id": "branch_approval", "type": "APPROVAL", "title": "分支审批", "approverType": "ROLE", "approverValue": "HR" },
                    { "id": "end_default", "type": "END", "title": "默认结束" },
                    { "id": "end_branch", "type": "END", "title": "分支结束" }
                  ],
                  "edges": [
                    { "source": "start", "target": "gateway" },
                    { "source": "gateway", "target": "default_approval", "isDefault": true },
                    { "source": "gateway", "target": "branch_approval", "condition": "route_branch" },
                    { "source": "default_approval", "target": "end_default" },
                    { "source": "branch_approval", "target": "end_branch" }
                  ]
                }
                """);

        WfNodeConfig nextNode = service.findNextNode(root, "gateway");

        assertEquals("default_approval", nextNode.getId());
        assertEquals("默认审批", nextNode.getTitle());
    }

    @Test
    void advanceAfterNodeShouldRouteToMatchedExclusiveBranch() {
        TestNodeExecutionService service = createService();
        WfNodeConfig root = workflowModelBridge.parseRuntimeRoot(buildExclusiveGraphJson());
        WfNodeConfig gateway = service.findNode(root, "gateway");
        Map<String, Object> variables = Map.of("route_branch", true);

        service.advanceAfterNode(buildInstance(), gateway, gateway.getId(), variables, 0, root);

        assertEquals(List.of("branch_approval"), service.visitedNodeIds);
    }

    @Test
    void advanceAfterNodeShouldFallbackToDefaultEdgeWhenNoBranchMatches() {
        TestNodeExecutionService service = createService();
        WfNodeConfig root = workflowModelBridge.parseRuntimeRoot(buildExclusiveGraphJson());
        WfNodeConfig gateway = service.findNode(root, "gateway");
        Map<String, Object> variables = Map.of("route_branch", false);

        service.advanceAfterNode(buildInstance(), gateway, gateway.getId(), variables, 0, root);

        assertEquals(List.of("default_approval"), service.visitedNodeIds);
    }

    @Test
    void advanceAfterNodeShouldRejectAmbiguousConditionBranchEntry() {
        TestNodeExecutionService service = createService();
        WfNodeConfig root = workflowModelBridge.parseRuntimeRoot("""
                {
                  "nodes": [
                    { "id": "start", "type": "START", "title": "开始" },
                    { "id": "gateway", "type": "CONDITION", "title": "条件网关" },
                    { "id": "branch_head", "type": "CONDITION", "title": "命中分支" },
                    { "id": "fallback", "type": "APPROVAL", "title": "默认审批", "approverType": "ROLE", "approverValue": "ADMIN" },
                    { "id": "approval_a", "type": "APPROVAL", "title": "审批A", "approverType": "ROLE", "approverValue": "ADMIN" },
                    { "id": "approval_b", "type": "APPROVAL", "title": "审批B", "approverType": "ROLE", "approverValue": "HR" },
                    { "id": "end_fallback", "type": "END", "title": "默认结束" },
                    { "id": "end_a", "type": "END", "title": "结束A" },
                    { "id": "end_b", "type": "END", "title": "结束B" }
                  ],
                  "edges": [
                    { "source": "start", "target": "gateway" },
                    { "source": "gateway", "target": "branch_head", "condition": "route_branch" },
                    { "source": "gateway", "target": "fallback", "isDefault": true },
                    { "source": "branch_head", "target": "approval_a" },
                    { "source": "branch_head", "target": "approval_b" },
                    { "source": "fallback", "target": "end_fallback" },
                    { "source": "approval_a", "target": "end_a" },
                    { "source": "approval_b", "target": "end_b" }
                  ]
                }
                """);
        WfNodeConfig gateway = service.findNode(root, "gateway");

        WorkflowException exception = assertThrows(
                WorkflowException.class,
                () -> service.advanceAfterNode(buildInstance(), gateway, gateway.getId(), Map.of("route_branch", true), 0, root)
        );

        assertEquals("VALIDATION_ERROR", exception.getCode());
        assertTrue(exception.getMessage().contains("多条非默认出边"));
    }

    @Test
    void advanceAfterNodeShouldForkAllParallelBranches() {
        TestNodeExecutionService service = createService();
        WfNodeConfig root = workflowModelBridge.parseRuntimeRoot("""
                {
                  "nodes": [
                    { "id": "start", "type": "START", "title": "开始" },
                    { "id": "parallel_gateway", "type": "PARALLEL", "title": "并行网关", "branchStrategy": "PARALLEL" },
                    { "id": "approval_a", "type": "APPROVAL", "title": "并行审批A", "approverType": "ROLE", "approverValue": "ADMIN" },
                    { "id": "approval_b", "type": "APPROVAL", "title": "并行审批B", "approverType": "ROLE", "approverValue": "HR" },
                    { "id": "end_a", "type": "END", "title": "结束A" },
                    { "id": "end_b", "type": "END", "title": "结束B" }
                  ],
                  "edges": [
                    { "source": "start", "target": "parallel_gateway" },
                    { "source": "parallel_gateway", "target": "approval_a" },
                    { "source": "parallel_gateway", "target": "approval_b" },
                    { "source": "approval_a", "target": "end_a" },
                    { "source": "approval_b", "target": "end_b" }
                  ]
                }
                """);
        WfNodeConfig gateway = service.findNode(root, "parallel_gateway");

        service.advanceAfterNode(buildInstance(), gateway, gateway.getId(), Map.of(), 0, root);

        assertEquals(List.of("approval_a", "approval_b"), service.visitedNodeIds);
    }

    private TestNodeExecutionService createService() {
        TestNodeExecutionService service = new TestNodeExecutionService();
        injectField(service, "workflowModelBridge", workflowModelBridge);
        return service;
    }

    private String buildExclusiveGraphJson() {
        return """
                {
                  "nodes": [
                    { "id": "start", "type": "START", "title": "开始" },
                    { "id": "gateway", "type": "CONDITION", "title": "条件网关" },
                    { "id": "branch_approval", "type": "APPROVAL", "title": "分支审批", "approverType": "ROLE", "approverValue": "HR" },
                    { "id": "default_approval", "type": "APPROVAL", "title": "默认审批", "approverType": "ROLE", "approverValue": "ADMIN" },
                    { "id": "end_branch", "type": "END", "title": "分支结束" },
                    { "id": "end_default", "type": "END", "title": "默认结束" }
                  ],
                  "edges": [
                    { "source": "start", "target": "gateway" },
                    { "source": "gateway", "target": "branch_approval", "condition": "route_branch" },
                    { "source": "gateway", "target": "default_approval", "isDefault": true },
                    { "source": "branch_approval", "target": "end_branch" },
                    { "source": "default_approval", "target": "end_default" }
                  ]
                }
                """;
    }

    private WfProcessInstance buildInstance() {
        WfProcessInstance instance = new WfProcessInstance();
        instance.setInstanceId("test-instance");
        instance.setTitle("测试流程");
        return instance;
    }

    private void injectField(Object target, String fieldName, Object value) {
        Class<?> current = target.getClass();
        while (current != null) {
            try {
                Field field = current.getDeclaredField(fieldName);
                field.setAccessible(true);
                field.set(target, value);
                return;
            } catch (NoSuchFieldException ignored) {
                current = current.getSuperclass();
            } catch (IllegalAccessException e) {
                throw new IllegalStateException("测试注入字段失败: " + fieldName, e);
            }
        }
        throw new IllegalStateException("未找到字段: " + fieldName);
    }

    /**
     * 使用测试替身截获流转结果，避免引入数据库、通知、任务引擎等外部依赖。
     */
    private static final class TestNodeExecutionService extends NodeExecutionServiceImpl {
        private final List<String> visitedNodeIds = new ArrayList<>();
        private final List<String> completedStatuses = new ArrayList<>();

        @Override
        public void runNode(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables, int depth, WfNodeConfig rootNode) {
            if (node != null && node.getId() != null) {
                visitedNodeIds.add(node.getId());
            } else {
                completedStatuses.add("NULL_NODE");
            }
        }

        @Override
        public void completeInstance(WfProcessInstance instance, String status) {
            completedStatuses.add(status);
        }

        @Override
        public boolean evaluateCondition(String condition, Map<String, Object> variables) {
            if (condition == null || condition.trim().isEmpty()) {
                return true;
            }
            Object value = variables.get(condition.trim());
            if (value instanceof Boolean boolValue) {
                return boolValue;
            }
            if (value instanceof Number numberValue) {
                return numberValue.intValue() != 0;
            }
            return value != null && Boolean.parseBoolean(String.valueOf(value));
        }
    }
}
