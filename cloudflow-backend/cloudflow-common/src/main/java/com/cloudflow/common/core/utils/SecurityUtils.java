package com.cloudflow.common.core.utils;

import com.cloudflow.common.core.context.UserContext;

public class SecurityUtils {
    public static boolean isAdmin(Long userId) {
        return userId != null && userId == 1L;
    }
}
