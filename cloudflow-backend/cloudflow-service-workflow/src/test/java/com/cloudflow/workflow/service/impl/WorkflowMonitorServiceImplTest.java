package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.domain.monitor.AnomalyAlert;
import com.cloudflow.workflow.domain.monitor.ProcessMonitor;
import com.cloudflow.workflow.mapper.AnomalyAlertMapper;
import com.cloudflow.workflow.mapper.PerformanceStatsMapper;
import com.cloudflow.workflow.mapper.ProcessMonitorMapper;
import com.cloudflow.workflow.mapper.TimeoutAlertMapper;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Proxy;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;

class WorkflowMonitorServiceImplTest {

    @Test
    void getProcessMonitorShouldQueryByInstanceId() {
        ProcessMonitor expected = new ProcessMonitor();
        expected.setInstanceId("instance-1");

        AtomicReference<String> invokedMethod = new AtomicReference<>();
        AtomicReference<String> invokedInstanceId = new AtomicReference<>();

        ProcessMonitorMapper processMonitorMapper = proxy(ProcessMonitorMapper.class, (methodName, args) -> {
            invokedMethod.set(methodName);
            if (args != null && args.length > 0 && args[0] instanceof String instanceId) {
                invokedInstanceId.set(instanceId);
            }
            if ("selectByInstanceId".equals(methodName)) {
                return expected;
            }
            return null;
        });

        WorkflowMonitorServiceImpl service = new WorkflowMonitorServiceImpl(
                processMonitorMapper,
                proxy(TimeoutAlertMapper.class, (methodName, args) -> null),
                proxy(AnomalyAlertMapper.class, (methodName, args) -> null),
                proxy(PerformanceStatsMapper.class, (methodName, args) -> null)
        );

        ProcessMonitor actual = service.getProcessMonitor("instance-1");

        assertSame(expected, actual);
        assertEquals("selectByInstanceId", invokedMethod.get());
        assertEquals("instance-1", invokedInstanceId.get());
    }

    @Test
    void resolveAnomalyAlertShouldPersistYnFlag() {
        AnomalyAlert stored = new AnomalyAlert();
        stored.setId(100L);
        stored.setResolved("N");

        AtomicReference<AnomalyAlert> updatedAlert = new AtomicReference<>();

        AnomalyAlertMapper anomalyAlertMapper = proxy(AnomalyAlertMapper.class, (methodName, args) -> {
            if ("selectById".equals(methodName)) {
                return stored;
            }
            if ("updateById".equals(methodName)) {
                updatedAlert.set((AnomalyAlert) args[0]);
                return 1;
            }
            return null;
        });

        WorkflowMonitorServiceImpl service = new WorkflowMonitorServiceImpl(
                proxy(ProcessMonitorMapper.class, (methodName, args) -> null),
                proxy(TimeoutAlertMapper.class, (methodName, args) -> null),
                anomalyAlertMapper,
                proxy(PerformanceStatsMapper.class, (methodName, args) -> null)
        );

        service.resolveAnomalyAlert(100L, "人工处理完成");

        AnomalyAlert updated = updatedAlert.get();
        assertNotNull(updated);
        assertEquals("Y", updated.getResolved());
        assertEquals("人工处理完成", updated.getResolveNote());
        assertNotNull(updated.getResolveTime());
    }

    @SuppressWarnings("unchecked")
    private static <T> T proxy(Class<T> type, Handler handler) {
        return (T) Proxy.newProxyInstance(
                type.getClassLoader(),
                new Class<?>[]{type},
                (proxy, method, args) -> {
                    if ("toString".equals(method.getName())) {
                        return type.getSimpleName() + "Proxy";
                    }
                    if ("hashCode".equals(method.getName())) {
                        return System.identityHashCode(proxy);
                    }
                    if ("equals".equals(method.getName())) {
                        return proxy == args[0];
                    }
                    return handler.invoke(method.getName(), args);
                }
        );
    }

    @FunctionalInterface
    private interface Handler {
        Object invoke(String methodName, Object[] args);
    }
}
