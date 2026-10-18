package com.cloudflow.common.security.oauth2;

import java.util.Set;

public final class OAuthPaths {
    private OAuthPaths() { }

    public static String normalized(String path) {
        return path != null && path.startsWith("/auth/oauth2") ? path.substring(5) : path;
    }

    public static boolean namespace(String path) {
        String normal = normalized(path);
        return normal != null && (normal.equals("/oauth2") || normal.startsWith("/oauth2/"));
    }

    public static boolean authorization(String path) { return "/oauth2/authorize".equals(normalized(path)); }

    public static boolean publicEndpoint(String method, String path) {
        return "POST".equals(method) && Set.of("/oauth2/token", "/oauth2/revoke").contains(normalized(path));
    }

    public static boolean resource(String method, String path) {
        if (!"GET".equals(method)) return false;
        String normal = normalized(path);
        return normal != null && (Set.of("/oauth2/userinfo", "/oauth2/api/system/tenant", "/oauth2/api/crm/customer").contains(normal)
                || normal.matches("/oauth2/api/crm/customer/[1-9][0-9]{0,18}")
                || normal.matches("/oauth2/api/workflow/instance/[A-Za-z0-9_-]{1,64}"));
    }

    public static String scope(String path) {
        String normal = normalized(path);
        if ("/oauth2/userinfo".equals(normal)) return "profile";
        if ("/oauth2/api/system/tenant".equals(normal)) return "system.tenant.read";
        if (normal != null && normal.startsWith("/oauth2/api/crm/customer")) return "crm.customer.read";
        if (normal != null && normal.startsWith("/oauth2/api/workflow/instance/")) return "workflow.instance.read";
        throw OAuthFailure.forbidden();
    }

    public static boolean offloaded(String path) { return namespace(path) && !authorization(path); }
}

