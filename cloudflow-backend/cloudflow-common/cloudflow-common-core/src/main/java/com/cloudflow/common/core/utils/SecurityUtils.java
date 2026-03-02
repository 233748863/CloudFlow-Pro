package com.cloudflow.common.core.utils;

import com.cloudflow.common.core.context.UserContext;

import java.util.Set;

/**
 * 安全工具类 - 提供当前登录用户信息的便捷访问方法
 * 该类属于 core 模块，因为它只依赖 UserContext，不涉及 JWT/Token 等安全组件
 */
public class SecurityUtils {

    /**
     * 获取当前登录用户ID
     */
    public static Long getUserId() {
        return UserContext.getUserId();
    }

    /**
     * 获取当前登录用户名
     */
    public static String getUsername() {
        return UserContext.getUserName();
    }

    /**
     * 获取当前登录用户的租户ID
     */
    public static Long getTenantId() {
        return UserContext.getTenantId();
    }

    /**
     * 判断当前上下文是否为管理员
     */
    public static boolean isAdmin() {
        Set<String> roles = UserContext.getRoles();
        if (roles != null) {
            for (String role : roles) {
                if (role == null) {
                    continue;
                }
                String normalized = role.trim();
                if ("ADMIN".equalsIgnoreCase(normalized) || "administrator".equalsIgnoreCase(normalized)) {
                    return true;
                }
            }
        }
        // 兼容兜底：历史逻辑按 userId=1 视为管理员
        Long currentUserId = UserContext.getUserId();
        return currentUserId != null && currentUserId == 1L;
    }

    /**
     * 判断是否为管理员（优先按角色判定，并保留 userId=1 兼容兜底）
     */
    public static boolean isAdmin(Long userId) {
        Set<String> roles = UserContext.getRoles();
        if (roles != null) {
            for (String role : roles) {
                if (role == null) {
                    continue;
                }
                String normalized = role.trim();
                if ("ADMIN".equalsIgnoreCase(normalized) || "administrator".equalsIgnoreCase(normalized)) {
                    return true;
                }
            }
        }
        return userId != null && userId == 1L;
    }
}
