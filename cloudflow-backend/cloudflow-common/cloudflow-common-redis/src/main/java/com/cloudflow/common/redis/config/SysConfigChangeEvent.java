package com.cloudflow.common.redis.config;

/**
 * sys_config change notification delivered through Redis pub/sub.
 */
public record SysConfigChangeEvent(String configKey, String scope, Long tenantId, String operation) {

    public String encode() {
        return nullToEmpty(configKey) + "|" + nullToEmpty(scope) + "|" + (tenantId == null ? "" : tenantId) + "|" + nullToEmpty(operation);
    }

    public static SysConfigChangeEvent decode(String message) {
        String[] parts = message == null ? new String[0] : message.split("\\|", -1);
        String key = parts.length > 0 && !parts[0].isBlank() ? parts[0] : null;
        String scope = parts.length > 1 && !parts[1].isBlank() ? parts[1] : null;
        Long tenantId = null;
        if (parts.length > 2 && !parts[2].isBlank()) {
            try {
                tenantId = Long.valueOf(parts[2]);
            } catch (NumberFormatException ignored) {
                tenantId = null;
            }
        }
        String operation = parts.length > 3 && !parts[3].isBlank() ? parts[3] : null;
        return new SysConfigChangeEvent(key, scope, tenantId, operation);
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
