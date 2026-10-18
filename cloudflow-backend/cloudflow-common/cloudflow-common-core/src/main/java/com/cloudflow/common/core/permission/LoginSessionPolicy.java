package com.cloudflow.common.core.permission;

public interface LoginSessionPolicy {
    boolean accepts(long ownerTenantId, long tenantId, long userId, int userVersion);
}
