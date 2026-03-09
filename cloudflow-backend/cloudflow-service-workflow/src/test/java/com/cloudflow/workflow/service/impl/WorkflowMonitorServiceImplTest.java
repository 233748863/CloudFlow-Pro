package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.domain.monitor.ProcessMonitor;
import com.cloudflow.workflow.mapper.AnomalyAlertMapper;
import com.cloudflow.workflow.mapper.PerformanceStatsMapper;
import com.cloudflow.workflow.mapper.ProcessMonitorMapper;
import com.cloudflow.workflow.mapper.TimeoutAlertMapper;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Proxy;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertEquals;

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
