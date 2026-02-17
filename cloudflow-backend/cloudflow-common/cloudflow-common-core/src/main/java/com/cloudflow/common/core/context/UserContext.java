package com.cloudflow.common.core.context;

import com.alibaba.ttl.TransmittableThreadLocal;

import java.util.Collections;
import java.util.List;
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
    private static final ThreadLocal<Set<String>> USER_PERMISSIONS = new TransmittableThreadLocal<>();
    private static final ThreadLocal<String> AUTH_TOKEN = new TransmittableThreadLocal<>();
    /** 数据权限类型（0全部 1自定义 2本级及下级 3本级 4本人） */
    private static final ThreadLocal<Integer> USER_DS_TYPE = new TransmittableThreadLocal<>();
    /** 数据权限可访问的部门ID列表（登录时预计算） */
    private static final ThreadLocal<List<Long>> USER_DS_DEPT_IDS = new TransmittableThreadLocal<>();

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

    public static void setPermissions(Set<String> permissions) {
        USER_PERMISSIONS.set(permissions);
    }

    public static Set<String> getPermissions() {
        Set<String> perms = USER_PERMISSIONS.get();
        return perms != null ? perms : Collections.emptySet();
    }

    public static void setAuthToken(String token) {
        AUTH_TOKEN.set(token);
    }

    /**
     * 获取当前请求的认证 Token UUID（用于 Feign 服务间调用传递）
     */
    public static String getAuthToken() {
        return AUTH_TOKEN.get();
    }

    public static void setDsType(Integer dsType) {
        USER_DS_TYPE.set(dsType);
    }

    /**
     * 获取数据权限类型（0全部 1自定义 2本级及下级 3本级 4本人）
     */
    public static Integer getDsType() {
        return USER_DS_TYPE.get();
    }

    public static void setDsDeptIds(List<Long> deptIds) {
        USER_DS_DEPT_IDS.set(deptIds);
    }

    /**
     * 获取数据权限可访问的部门ID列表
     */
    public static List<Long> getDsDeptIds() {
        List<Long> ids = USER_DS_DEPT_IDS.get();
        return ids != null ? ids : Collections.emptyList();
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
        USER_PERMISSIONS.remove();
        AUTH_TOKEN.remove();
        USER_DS_TYPE.remove();
        USER_DS_DEPT_IDS.remove();
    }
}
