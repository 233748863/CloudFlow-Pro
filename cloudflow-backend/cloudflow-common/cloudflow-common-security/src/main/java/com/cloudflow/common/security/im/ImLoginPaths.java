package com.cloudflow.common.security.im;

import java.util.Set;

public final class ImLoginPaths {
    private ImLoginPaths() { }

    public static String normalized(String path) {
        return path != null && path.startsWith("/auth/im") ? path.substring(5) : path;
    }

    public static boolean namespace(String path) {
        String normal = normalized(path);
        return normal != null && (normal.equals("/im") || normal.startsWith("/im/"));
    }

    public static boolean publicEndpoint(String method, String path) {
        String normal = normalized(path);
        return normal != null && (callbackEndpoint(method, path) || "GET".equals(method) && Set.of("/im/WECOM/availability", "/im/WECOM/auth-url", "/im/WECOM/callback", "/im/WECOM/binding-callback").contains(normal)
                || "POST".equals(method) && "/im/WECOM/totp".equals(normal));
    }

    public static boolean callbackEndpoint(String method, String path) {
        String normal = normalized(path);
        if (!("GET".equals(method) || "POST".equals(method)) || normal == null || !normal.matches("/im/callback/[1-9][0-9]{0,18}")) return false;
        try { return Long.parseLong(normal.substring("/im/callback/".length())) > 0; }
        catch (NumberFormatException failure) { return false; }
    }
}
