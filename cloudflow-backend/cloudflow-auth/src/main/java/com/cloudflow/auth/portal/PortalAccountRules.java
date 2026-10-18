package com.cloudflow.auth.portal;

import com.cloudflow.auth.domain.SysPortalUser;
import com.cloudflow.common.security.portal.PortalIdentity;
import java.time.LocalDateTime;
import java.util.Objects;

public final class PortalAccountRules {
    public static final int MAX_FAILURES = 5;
    public static final int LOCK_MINUTES = 15;
    public static final int ACTIVATION_MINUTES = 15;

    private PortalAccountRules() { }

    public static boolean customerAccount(SysPortalUser user) {
        return user != null && Integer.valueOf(0).equals(user.getDeleted())
                && "CUSTOMER_CONTACT".equals(user.getUserType()) && "CRM_CONTACT".equals(user.getRefBizType());
    }

    public static boolean canAttempt(SysPortalUser user, LocalDateTime now) {
        return customerAccount(user) && ("ACTIVE".equals(user.getStatus())
                || "LOCKED".equals(user.getStatus()) && user.getLockedUntil() != null && !user.getLockedUntil().isAfter(now));
    }

    public static int nextFailures(SysPortalUser user, LocalDateTime now) {
        int previous = "LOCKED".equals(user.getStatus()) && user.getLockedUntil() != null && !user.getLockedUntil().isAfter(now)
                ? 0 : user.getFailCount() == null ? 0 : user.getFailCount();
        return Math.min(MAX_FAILURES, Math.max(0, previous) + 1);
    }

    public static boolean canActivate(SysPortalUser user, String tokenHash, LocalDateTime now) {
        return customerAccount(user) && "PENDING".equals(user.getStatus()) && tokenHash != null
                && tokenHash.equals(user.getActivateTokenHash()) && user.getActivateConsumedTime() == null
                && user.getActivateExpireTime() != null && user.getActivateExpireTime().isAfter(now);
    }

    public static boolean accepts(SysPortalUser user, PortalIdentity identity) {
        return customerAccount(user) && "ACTIVE".equals(user.getStatus()) && identity != null
                && Objects.equals(user.getPortalUserId(), identity.portalUserId())
                && Objects.equals(user.getTenantId(), identity.tenantId())
                && Objects.equals(user.getCustomerId(), identity.customerId())
                && Objects.equals(user.getRefBizId(), identity.contactId())
                && Objects.equals(user.getSessionVersion(), identity.sessionVersion());
    }
}
