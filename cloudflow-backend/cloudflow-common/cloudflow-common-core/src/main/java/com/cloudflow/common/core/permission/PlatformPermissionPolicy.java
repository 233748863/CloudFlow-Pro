package com.cloudflow.common.core.permission;

import java.util.Set;

public interface PlatformPermissionPolicy {
    Set<String> controlPermissions(Long userId, Long tenantId);
}
