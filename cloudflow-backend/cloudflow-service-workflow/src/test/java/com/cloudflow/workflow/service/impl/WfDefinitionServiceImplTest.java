package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WfDefinitionServiceImplTest {

    @Test
    void validateModelIntegrityShouldRejectParallelSignTypeWithMultipleBranches() {
        WfDefinitionServiceImpl service = createService();

        WorkflowException exception = assertThrows(
                WorkflowException.class,
                () -> invokeValidateModelIntegrity(service, """
                        {
                          "nodes": [
                            { "id": "start", "type": "START", "title": "开始" },
                            { "id": "parallel_gateway", "type": "PARALLEL", "title": "并行节点", "signType": "ALL" },
                            { "id": "approval_a", "type": "APPROVAL", "title": "审批A", "approverType": "ROLE", "approverValue": "ADMIN" },
                            { "id": "approval_b", "type": "APPROVAL", "title": "审批B", "approverType": "ROLE", "approverValue": "HR" },
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
                        """)
        );

        assertEquals("VALIDATION_ERROR", exception.getCode());
        assertTrue(exception.getMessage().contains("同时配置了会签模式"));
    }

    @Test
    void sanitizeModelJsonShouldRecursivelyCleanTextFields() {
        WfDefinitionServiceImpl service = createService();

        String sanitized = invokeSanitizeModelJson(service, """
                {
                  "nodes": [
                    {
                      "id": "start",
                      "type": "START",
                      "title": "<script>alert(1)</script>开始",
                      "description": "safe",
                      "props": {
                        "label": "<img src=x onerror='alert(1)'>",
                        "nested": {
                          "remark": "javascript:alert(1)"
                        }
                      }
                    },
                    {
                      "id": "end",
                      "type": "END",
                      "title": "结束"
                    }
                  ],
                  "edges": [
                    {
                      "source": "start",
                      "target": "end",
                      "condition": "<script>alert(2)</script>ok"
                    }
                  ]
                }
                """);

        assertTrue(sanitized.contains("&lt;img src=x &gt;"));
        assertTrue(sanitized.contains("ok"));
        assertTrue(sanitized.contains("&lt;"));
        assertTrue(!sanitized.contains("<script>"));
        assertTrue(!sanitized.contains("javascript:"));
        assertTrue(!sanitized.contains("onerror="));
    }

    private WfDefinitionServiceImpl createService() {
        WfDefinitionServiceImpl service = new WfDefinitionServiceImpl();
        injectField(service, "workflowGraphModelResolver", new WorkflowGraphModelResolver());
        injectField(service, "securityUtils", new WorkflowSecurityUtils());
        return service;
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

    private void invokeValidateModelIntegrity(WfDefinitionServiceImpl service, String modelJson) {
        invokePrivate(service, "validateModelIntegrity", modelJson);
    }

    private String invokeSanitizeModelJson(WfDefinitionServiceImpl service, String modelJson) {
        return (String) invokePrivate(service, "sanitizeModelJson", modelJson);
    }

    /**
     * 通过反射调用私有方法，确保保存链路中的关键图模型校验与清洗逻辑可单测。
     */
    private Object invokePrivate(Object target, String methodName, String argument) {
        try {
            Method method = target.getClass().getDeclaredMethod(methodName, String.class);
            method.setAccessible(true);
            return method.invoke(target, argument);
        } catch (Exception e) {
            Throwable cause = e.getCause();
            if (cause instanceof RuntimeException runtimeException) {
                throw runtimeException;
            }
            throw new IllegalStateException("调用私有方法失败: " + methodName, e);
        }
    }
}
