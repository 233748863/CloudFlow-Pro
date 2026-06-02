package com.cloudflow.common.redis.support;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;

/**
 * 运行时桥接 common-core 的上下文与异常类型，避免编译期强耦合。
 */
public final class RuntimeContextBridge {

    private static final Logger log = LoggerFactory.getLogger(RuntimeContextBridge.class);

    private static final Method USER_CONTEXT_GET_TENANT_ID =
            resolveStaticMethod("com.cloudflow.common.core.context.UserContext", "getTenantId");
    private static final Method TENANT_CONTEXT_GET_TENANT_ID =
            resolveStaticMethod("com.cloudflow.common.tenant.TenantContext", "getTenantId");
    private static final Constructor<?> SERVICE_EXCEPTION_CTOR_MESSAGE_CODE =
            resolveConstructor("com.cloudflow.common.core.exception.ServiceException", String.class, Integer.class);
    private static final Constructor<?> SERVICE_EXCEPTION_CTOR_MESSAGE_CODE_CAUSE =
            resolveConstructor("com.cloudflow.common.core.exception.ServiceException", String.class, Integer.class, Throwable.class);

    private RuntimeContextBridge() {
    }

    public static Long getTenantId() {
        Long tenantId = invokeTenantId(USER_CONTEXT_GET_TENANT_ID);
        if (tenantId != null) {
            return tenantId;
        }
        return invokeTenantId(TENANT_CONTEXT_GET_TENANT_ID);
    }

    public static RuntimeException newServiceException(String message, Integer code) {
        RuntimeException runtimeException = instantiate(SERVICE_EXCEPTION_CTOR_MESSAGE_CODE, message, code);
        return runtimeException != null ? runtimeException : new IllegalStateException(message);
    }

    public static RuntimeException newServiceException(String message, Integer code, Throwable cause) {
        RuntimeException runtimeException = instantiate(SERVICE_EXCEPTION_CTOR_MESSAGE_CODE_CAUSE, message, code, cause);
        if (runtimeException != null) {
            return runtimeException;
        }
        return new IllegalStateException(message, cause);
    }

    private static Method resolveStaticMethod(String className, String methodName) {
        try {
            Method method = Class.forName(className).getMethod(methodName);
            method.setAccessible(true);
            return method;
        } catch (ReflectiveOperationException ex) {
            log.debug("Runtime bridge method unavailable: {}#{}", className, methodName, ex);
            return null;
        }
    }

    private static Constructor<?> resolveConstructor(String className, Class<?>... parameterTypes) {
        try {
            Constructor<?> constructor = Class.forName(className).getConstructor(parameterTypes);
            constructor.setAccessible(true);
            return constructor;
        } catch (ReflectiveOperationException ex) {
            log.debug("Runtime bridge constructor unavailable: {}", className, ex);
            return null;
        }
    }

    private static Long invokeTenantId(Method method) {
        if (method == null) {
            return null;
        }
        try {
            Object value = method.invoke(null);
            if (value instanceof Number number) {
                return number.longValue();
            }
            return null;
        } catch (ReflectiveOperationException ex) {
            log.debug("Runtime bridge tenant lookup failed", ex);
            return null;
        }
    }

    private static RuntimeException instantiate(Constructor<?> constructor, Object... args) {
        if (constructor == null) {
            return null;
        }
        try {
            Object value = constructor.newInstance(args);
            if (value instanceof RuntimeException runtimeException) {
                return runtimeException;
            }
            return null;
        } catch (ReflectiveOperationException ex) {
            log.debug("Runtime bridge exception construction failed", ex);
            return null;
        }
    }
}
