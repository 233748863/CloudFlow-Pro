package com.cloudflow.workflow.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfAuditLog;
import com.cloudflow.workflow.enums.OperationType;
import com.cloudflow.workflow.enums.TargetType;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AuditLogServiceImplTest {

    @Test
    void buildAuditLogShouldUseUserContextAndRealRequestInfo() {
        AuditLogServiceImpl service = new AuditLogServiceImpl();

        UserContext.setUserId(88L);
        UserContext.setUserName("flow-admin");
        UserContext.setTenantId(100000L);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(
                mockRequest("172.16.0.9", Map.of(
                        "X-Forwarded-For", "10.10.10.10, 172.16.0.9",
                        "User-Agent", "JUnit-Audit-Agent"
                ))
        ));

        WfAuditLog auditLog = invokeBuildAuditLog(
                service,
                OperationType.WORKFLOW_ARCHIVE,
                TargetType.WORKFLOW,
                "wf-001",
                "请假流程",
                "测试归档",
                "detail",
                "SUCCESS",
                null
        );

        assertEquals("88", auditLog.getOperatorId());
        assertEquals("flow-admin", auditLog.getOperatorName());
        assertEquals("10.10.10.10", auditLog.getIpAddress());
        assertEquals("JUnit-Audit-Agent", auditLog.getUserAgent());
        assertEquals(100000L, auditLog.getTenantId());

        RequestContextHolder.resetRequestAttributes();
        UserContext.clear();
    }

    private WfAuditLog invokeBuildAuditLog(AuditLogServiceImpl service,
                                           OperationType operationType,
                                           TargetType targetType,
                                           String targetId,
                                           String targetName,
                                           String reason,
                                           String details,
                                           String result,
                                           String errorMessage) {
        try {
            Method method = AuditLogServiceImpl.class.getDeclaredMethod(
                    "buildAuditLog",
                    OperationType.class,
                    TargetType.class,
                    String.class,
                    String.class,
                    String.class,
                    String.class,
                    String.class,
                    String.class
            );
            method.setAccessible(true);
            return (WfAuditLog) method.invoke(
                    service,
                    operationType,
                    targetType,
                    targetId,
                    targetName,
                    reason,
                    details,
                    result,
                    errorMessage
            );
        } catch (Exception e) {
            throw new IllegalStateException("调用 buildAuditLog 失败", e);
        }
    }

    private HttpServletRequest mockRequest(String remoteAddr, Map<String, String> headers) {
        return (HttpServletRequest) Proxy.newProxyInstance(
                HttpServletRequest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class},
                (proxy, method, args) -> {
                    switch (method.getName()) {
                        case "getHeader":
                            return headers.get(String.valueOf(args[0]));
                        case "getRemoteAddr":
                            return remoteAddr;
                        case "toString":
                            return "MockHttpServletRequest";
                        case "hashCode":
                            return System.identityHashCode(proxy);
                        case "equals":
                            return proxy == args[0];
                        default:
                            return null;
                    }
                }
        );
    }
}
