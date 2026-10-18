package com.cloudflow.common.security.oauth2;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@JsonSerialize(using = OAuthTransportSerializers.Identity.class)
public record OAuthIdentity(Long accessId, Long tenantId, Long clientId, Long userId, String tokenHash,
        String grantType, List<String> scopes, Long deptId, int dsType, List<Long> deptIds,
        Set<String> businessPermissions, long expiresAt) {
    public OAuthIdentity {
        Objects.requireNonNull(accessId);
        Objects.requireNonNull(tenantId);
        Objects.requireNonNull(clientId);
        Objects.requireNonNull(userId);
        if (accessId <= 0 || tenantId <= 0 || clientId <= 0 || userId <= 0 || dsType < 0 || dsType > 4
                || tokenHash == null || !tokenHash.matches("[0-9a-f]{64}")
                || !Set.of("authorization_code", "client_credentials").contains(grantType)) throw OAuthFailure.unauthenticated();
        scopes = List.copyOf(scopes);
        scopes.forEach(OAuthScope::require);
        deptIds = List.copyOf(deptIds);
        businessPermissions = Set.copyOf(businessPermissions);
    }

    @Override
    public String toString() { return "OAuthIdentity[accessId=" + accessId + ", tenantId=" + tenantId + "]"; }
}
