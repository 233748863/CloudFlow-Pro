package com.cloudflow.common.security.portal;

import com.cloudflow.common.core.exception.ServiceException;
import java.util.List;
import java.util.Objects;

public final class PortalContext {
    private static final ThreadLocal<PortalIdentity> IDENTITY = new ThreadLocal<>();
    private static final List<String> PERMISSIONS = List.of("crm:portal:session", "crm:portal:ticket:list",
            "crm:portal:ticket:add", "crm:portal:contract:list", "crm:portal:finance:list",
            "oa:portal:knowledge:list", "system:portal:file:access");

    private PortalContext() { }

    public static void setVerified(PortalIdentity identity) { IDENTITY.set(Objects.requireNonNull(identity)); }

    public static PortalIdentity require() {
        PortalIdentity identity = IDENTITY.get();
        if (identity == null) throw new ServiceException("门户登录状态已失效", 401);
        return identity;
    }

    public static List<String> permissions(Object loginId) {
        PortalIdentity identity = IDENTITY.get();
        return identity != null && identity.portalUserId().toString().equals(String.valueOf(loginId))
                ? PERMISSIONS : List.of();
    }

    public static void clear() { IDENTITY.remove(); }
}
