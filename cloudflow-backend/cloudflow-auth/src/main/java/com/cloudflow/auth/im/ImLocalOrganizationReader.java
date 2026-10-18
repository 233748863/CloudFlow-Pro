package com.cloudflow.auth.im;

import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.auth.oauth2.OAuthProperties;
import com.cloudflow.auth.platform.PlatformAccessProperties;
import java.util.HashSet;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImLocalOrganizationReader {
    private final PlatformAccessProperties platform;
    private final OAuthProperties oauth;

    public ImLocalOrganization read(ImMapper mapper, long tenantId, long configId) {
        Set<Long> protectedUsers = new HashSet<>(mapper.protectedOrganizationUsers(tenantId));
        if (oauth.getServiceUserIds() != null) protectedUsers.addAll(oauth.getServiceUserIds());
        if (Long.valueOf(tenantId).equals(platform.getManagementTenantId()) && platform.getAdministratorUserIds() != null) {
            protectedUsers.addAll(platform.getAdministratorUserIds());
        }
        return new ImLocalOrganization(tenantId,
                mapper.organizationDepartments(tenantId, ImLocalOrganization.MAX_LOCAL_DEPARTMENTS + 1),
                mapper.organizationUsers(tenantId, ImLocalOrganization.MAX_LOCAL_USERS + 1),
                mapper.organizationDepartmentMappings(tenantId, configId, ImLocalOrganization.MAX_LOCAL_DEPARTMENTS + 1),
                mapper.organizationUserMappings(tenantId, configId, ImLocalOrganization.MAX_LOCAL_USERS + 1), protectedUsers);
    }
}
