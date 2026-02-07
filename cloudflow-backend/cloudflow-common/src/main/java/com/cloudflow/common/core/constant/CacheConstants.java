package com.cloudflow.common.core.constant;

public class CacheConstants {
    /**
     * 登录用户 Redis Key 前缀
     */
    public static final String LOGIN_TOKEN_KEY = "login_tokens:";

    /**
     * 用户 Tokens 集合 Key 前缀 (Reverse Index)
     */
    public static final String USER_TOKENS_KEY = "user_tokens:";
    
    // EXPIRATION and REFRESH_TIME have been migrated to SecurityProperties (Nacos)
}
