package com.cloudflow.common.security.oauth2;

import java.util.List;
import java.util.Objects;

public final class OAuthContext {
    private static final ThreadLocal<OAuthIdentity> CURRENT = new ThreadLocal<>();

    private OAuthContext() { }

    public static void setVerified(OAuthIdentity identity) { CURRENT.set(Objects.requireNonNull(identity)); }

    public static OAuthIdentity require() {
        OAuthIdentity identity = CURRENT.get();
        if (identity == null) throw OAuthFailure.unauthenticated();
        return identity;
    }

    public static void requireScope(String scope) {
        if (!require().scopes().contains(scope)) throw OAuthFailure.forbidden();
    }

    public static List<String> permissions(Object loginId) {
        OAuthIdentity identity = CURRENT.get();
        return identity != null && identity.accessId().toString().equals(String.valueOf(loginId))
                ? identity.scopes().stream().map(OAuthScope::require).map(OAuthScope::authority).toList() : List.of();
    }

    public static void clear() { CURRENT.remove(); }
}

