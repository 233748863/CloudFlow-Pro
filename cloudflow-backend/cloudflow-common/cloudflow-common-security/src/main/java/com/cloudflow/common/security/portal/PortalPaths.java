package com.cloudflow.common.security.portal;

public final class PortalPaths {
    private static final String TENANT = "[A-Za-z0-9][A-Za-z0-9_-]{0,49}";

    private PortalPaths() { }

    public static boolean portal(String path) {
        return path != null && (path.equals("/portal") || path.startsWith("/portal/"));
    }

    public static boolean publicEndpoint(String method, String path) {
        return path != null && ("POST".equals(method)
                && path.matches("/portal/" + TENANT + "/(login|register|activate)")
                || "GET".equals(method) && path.matches("/portal/" + TENANT + "/status"));
    }

    public static boolean supported(String method, String path) {
        return publicEndpoint(method, path) || "GET".equals(method) && "/portal/session".equals(path)
                || "POST".equals(method) && "/portal/logout".equals(path)
                || "GET".equals(method) && path != null && path.matches("/portal/oa/knowledge/(list|[1-9][0-9]{0,18})")
                || "GET".equals(method) && path != null && path.matches("/portal/crm/contract/(list|[1-9][0-9]{0,18})")
                || ticketEndpoint(method, path)
                || "GET".equals(method) && path != null && path.matches("/portal/crm/(receivable|invoice)/(list|[1-9][0-9]{0,18})")
                || fileEndpoint(method, path);
    }

    public static boolean fileEndpoint(String method, String path) {
        return "POST".equals(method) && ("/portal/crm/finance/file/access".equals(path) || "/portal/crm/finance/file/content".equals(path)
                || "/portal/file/access".equals(path) || "/portal/file/download".equals(path) || "/portal/file/upload".equals(path))
                || "GET".equals(method) && path != null && path.matches("/portal/file/upload/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
                || "DELETE".equals(method) && path != null && path.matches("/portal/file/[1-9][0-9]{0,18}");
    }

    private static boolean ticketEndpoint(String method, String path) {
        return "POST".equals(method) && "/portal/crm/ticket".equals(path)
                || "GET".equals(method) && path != null && (path.matches("/portal/crm/ticket/(list|[1-9][0-9]{0,18})")
                    || path.matches("/portal/crm/ticket/submission/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"));
    }

    public static String publicGroup(String path) {
        return path.endsWith("/login") ? "login" : path.endsWith("/status") ? "status" : "activate";
    }
}
