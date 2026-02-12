package com.cloudflow.common.core.constant;

public class CacheConstants {

    /**
     * 全局缓存前缀标识
     * 以此前缀开头的缓存不会自动追加租户ID前缀（跨租户共享）
     * 例如：GLOBALLY::sys_config 不会变成 1::sys_config
     */
    public static final String GLOBALLY = "GLOBALLY";

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

    /**
     * 角色信息缓存
     */
    public static final String ROLE_DETAILS = "role_details";

    /**
     * 租户信息缓存（全局共享，不按租户隔离）
     */
    public static final String TENANT_DETAILS = GLOBALLY + "::tenant_details";
}
