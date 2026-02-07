package com.cloudflow.common.core.context;

import java.util.Set;

/**
 * 用户上下文
 */
public class UserContext {
    private static final ThreadLocal<Long> USER_ID = new ThreadLocal<>();
    private static final ThreadLocal<String> USER_NAME = new ThreadLocal<>();
    private static final ThreadLocal<Set<String>> USER_ROLES = new ThreadLocal<>();
    // 新增部门ID
    private static final ThreadLocal<Long> USER_DEPT_ID = new ThreadLocal<>();
    // 新增租户ID
    private static final ThreadLocal<Long> USER_TENANT_ID = new ThreadLocal<>();

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

    // 新增 Getter/Setter
    public static void setDeptId(Long deptId) {
        USER_DEPT_ID.set(deptId);
    }

    public static Long getDeptId() {
        return USER_DEPT_ID.get();
    }

    public static void setTenantId(Long tenantId) {
        USER_TENANT_ID.set(tenantId);
    }

    public static Long getTenantId() {
        return USER_TENANT_ID.get();
    }

    public static void clear() {
        USER_ID.remove();
        USER_NAME.remove();
        USER_ROLES.remove();
        USER_DEPT_ID.remove();
        USER_TENANT_ID.remove();
    }
}
