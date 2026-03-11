package com.cloudflow.common.config;

import com.cloudflow.common.core.context.UserContext;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.lang.reflect.Proxy;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;

class ContextTaskDecoratorTest {

    @Test
    void decorateShouldPropagateUserAndRequestContext() throws Exception {
        UserContext.setUserId(99L);
        UserContext.setUserName("audit-user");

        RequestAttributes requestAttributes = new ServletRequestAttributes(
                mockRequest("127.0.0.1", Map.of("User-Agent", "JUnit-Agent"))
        );
        RequestContextHolder.setRequestAttributes(requestAttributes);

        AtomicReference<Long> capturedUserId = new AtomicReference<>();
        AtomicReference<String> capturedUserName = new AtomicReference<>();
        AtomicReference<RequestAttributes> capturedRequestAttributes = new AtomicReference<>();
        AtomicReference<RequestAttributes> afterRunRequestAttributes = new AtomicReference<>();

        Runnable task = new ContextTaskDecorator().decorate(() -> {
            capturedUserId.set(UserContext.getUserId());
            capturedUserName.set(UserContext.getUserName());
            capturedRequestAttributes.set(RequestContextHolder.getRequestAttributes());
            afterRunRequestAttributes.set(RequestContextHolder.getRequestAttributes());
        });

        Thread thread = new Thread(task);
        thread.start();
        thread.join();

        assertEquals(99L, capturedUserId.get());
        assertEquals("audit-user", capturedUserName.get());
        assertSame(requestAttributes, capturedRequestAttributes.get());
        assertSame(requestAttributes, afterRunRequestAttributes.get());

        RequestContextHolder.resetRequestAttributes();
        UserContext.clear();
    }

    @Test
    void decorateShouldClearChildThreadContextAfterExecution() throws Exception {
        UserContext.setUserId(100L);

        AtomicReference<Long> observedUserIdAfterExecution = new AtomicReference<>();
        AtomicReference<RequestAttributes> observedRequestAttributesAfterExecution = new AtomicReference<>();

        Runnable task = new ContextTaskDecorator().decorate(() -> {
        });

        Thread thread = new Thread(() -> {
            task.run();
            observedUserIdAfterExecution.set(UserContext.getUserId());
            observedRequestAttributesAfterExecution.set(RequestContextHolder.getRequestAttributes());
        });
        thread.start();
        thread.join();

        assertNull(observedUserIdAfterExecution.get());
        assertNull(observedRequestAttributesAfterExecution.get());

        RequestContextHolder.resetRequestAttributes();
        UserContext.clear();
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
