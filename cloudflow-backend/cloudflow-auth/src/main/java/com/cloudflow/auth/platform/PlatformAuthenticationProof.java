package com.cloudflow.auth.platform;

public record PlatformAuthenticationProof(Long userId, Long tenantId, String credentialStamp,
        long authenticatedAt, long expiresAt) {
    @Override
    public String toString() {
        return "PlatformAuthenticationProof[userId=" + userId + ", tenantId=" + tenantId
                + ", expiresAt=" + expiresAt + "]";
    }
}
