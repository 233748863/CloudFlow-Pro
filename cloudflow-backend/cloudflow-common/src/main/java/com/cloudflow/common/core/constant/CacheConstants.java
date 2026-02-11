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

    /**
     * 菜单信息缓存（按 roleId 缓存）
     */
    public static final String MENU_DETAILS = "menu_details";

    /**
     * 用户信息缓存（按 username 缓存，含角色+权限）
     */
    public static final String USER_DETAILS = "user_details";

    /**
     * 用户菜单树缓存（按 userId 缓存）
     */
    public static final String USER_MENUS = "user_menus";
}
