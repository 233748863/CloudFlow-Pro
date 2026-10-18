package com.cloudflow.common.security.portal;

public interface PortalRequestAudit {
    void record(PortalIdentity identity, String path, String method, String clientIp, int status);
}
