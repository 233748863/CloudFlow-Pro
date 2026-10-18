package com.cloudflow.common.security.portal;

import java.util.Map;

public record PortalIdentity(Long portalUserId, Long tenantId, Long customerId, Long contactId,
        int sessionVersion, int contactVersion) {
    public PortalIdentity {
        if (portalUserId == null || portalUserId <= 0 || tenantId == null || tenantId <= 0
                || customerId == null || customerId <= 0 || contactId == null || contactId <= 0
                || sessionVersion < 0 || contactVersion < 0) {
            throw new IllegalArgumentException("门户身份无效");
        }
    }

    public Map<String, Object> snapshot() {
        return Map.of("portalUserId", portalUserId, "tenantId", tenantId, "customerId", customerId,
                "contactId", contactId, "sessionVersion", sessionVersion, "contactVersion", contactVersion);
    }

    public static PortalIdentity from(Object value) {
        if (!(value instanceof Map<?, ?> fields)) return null;
        try {
            return new PortalIdentity(number(fields, "portalUserId"), number(fields, "tenantId"),
                    number(fields, "customerId"), number(fields, "contactId"),
                    Math.toIntExact(number(fields, "sessionVersion")), Math.toIntExact(number(fields, "contactVersion")));
        } catch (IllegalArgumentException | ArithmeticException invalid) {
            return null;
        }
    }

    private static Long number(Map<?, ?> fields, String key) {
        Object value = fields.get(key);
        if (value == null || !value.toString().matches("[0-9]{1,19}")) throw new IllegalArgumentException();
        return Long.valueOf(value.toString());
    }
}
