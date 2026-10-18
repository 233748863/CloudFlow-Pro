package com.cloudflow.auth.platform;

import com.cloudflow.common.core.permission.PlatformPermissionPolicy;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class PlatformControlPermissionService implements PlatformPermissionPolicy {
    private final PlatformAccessService access;

    @Override
    public Set<String> controlPermissions(Long userId, Long tenantId) { return access.controlPermissions(userId, tenantId); }
}
