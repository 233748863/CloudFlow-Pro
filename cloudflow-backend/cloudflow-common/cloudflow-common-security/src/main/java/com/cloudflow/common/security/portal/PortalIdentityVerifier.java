package com.cloudflow.common.security.portal;

public interface PortalIdentityVerifier {
    PortalIdentity verifyCurrent(PortalIdentity identity);
}
