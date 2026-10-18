package com.cloudflow.common.security.oauth2;

public interface OAuthIdentityVerifier {
    OAuthIdentity verifyHash(String tokenHash);
    void recordAccess(OAuthIdentity identity, int status);
}

