package com.cloudflow.common.core.utils;

import com.cloudflow.common.core.context.UserContext;

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
     * 判断是否为管理员
     */
    public static boolean isAdmin(Long userId) {
        return userId != null && userId == 1L;
    }
}
