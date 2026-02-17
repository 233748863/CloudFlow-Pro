package com.cloudflow.common.core.context;

import com.alibaba.ttl.TransmittableThreadLocal;

import java.util.Set;

/**
 * 用户上下文 - 使用 TransmittableThreadLocal 存储当前用户信息
 * 支持线程池自动传递（配合 TTL Agent 或 TtlExecutors 包装）
 * 
 * @author CloudFlow
 */
public class UserContext {

    private static final ThreadLocal<Long> USER_ID = new TransmittableThreadLocal<>();
    private static final ThreadLocal<String> USER_NAME = new TransmittableThreadLocal<>();
    private static final ThreadLocal<Set<String>> USER_ROLES = new TransmittableThreadLocal<>();
    private static final ThreadLocal<Long> USER_DEPT_ID = new TransmittableThreadLocal<>();
    private static final ThreadLocal<String> USER_DEPT_NAME = new TransmittableThreadLocal<>();
    private static final ThreadLocal<Long> USER_TENANT_ID = new TransmittableThreadLocal<>();

    public static void setUserId(Long userId) {
        USER_ID.set(userId);
    }

    public static Long getUserId() {
        return USER_ID.get();
    }

    public static void setUserName(String userName) {
        USER_NAME.set(userName);
    }

    public static String getUserName() {
        return USER_NAME.get();
    }

    public static void setRoles(Set<String> roles) {
        USER_ROLES.set(roles);
    }

    public static Set<String> getRoles() {
        return USER_ROLES.get();
    }

    public static void setDeptId(Long deptId) {
        USER_DEPT_ID.set(deptId);
    }

    public static Long getDeptId() {
        return USER_DEPT_ID.get();
    }

    public static void setDeptName(String deptName) {
        USER_DEPT_NAME.set(deptName);
    }

    public static String getDeptName() {
        return USER_DEPT_NAME.get();
    }

    public static void setTenantId(Long tenantId) {
        USER_TENANT_ID.set(tenantId);
    }

    public static Long getTenantId() {
        return USER_TENANT_ID.get();
    }

    /**
     * 清除所有用户上下文信息
     * 必须在请求结束时调用，避免内存泄漏
     */
    public static void clear() {
        USER_ID.remove();
        USER_NAME.remove();
        USER_ROLES.remove();
        USER_DEPT_ID.remove();
        USER_DEPT_NAME.remove();
        USER_TENANT_ID.remove();
    }
}
