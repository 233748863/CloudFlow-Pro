package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

class OaOrganizationLeaderTest {
    private final OaIdentityReferenceMapper identities = mock(OaIdentityReferenceMapper.class);
    private final OaOrganizationService service = new OaOrganizationService(identities);

    @AfterEach
    void clearContext() {
        UserContext.clear();
        TenantContext.clear();
    }

    @Test
    void resolvesLeaderByIdWithinCurrentTenant() {
        UserContext.setTenantId(100001L);
        OaIdentityReference person = user(7L, 10L);
        OaIdentityReference manager = user(42L, 20L);
        when(identities.user(7L, 100001L)).thenReturn(person);
        when(identities.department(10L, 100001L)).thenReturn(department(10L, 0L, 42L));
        when(identities.user(42L, 100001L)).thenReturn(manager);

        assertSame(manager, service.manager(7L));

        verify(identities).user(7L, 100001L);
        verify(identities).department(10L, 100001L);
        verify(identities).user(42L, 100001L);
        verifyNoMoreInteractions(identities);
    }

    @Test
    void skipsSelfAndInvalidLeaderThenFindsParentManager() {
        UserContext.setTenantId(100001L);
        when(identities.user(7L, 100001L)).thenReturn(user(7L, 10L));
        when(identities.department(10L, 100001L)).thenReturn(department(10L, 20L, 7L));
        when(identities.department(20L, 100001L)).thenReturn(department(20L, 30L, 88L));
        when(identities.user(88L, 100001L)).thenReturn(null);
        when(identities.department(30L, 100001L)).thenReturn(department(30L, 0L, 42L));
        OaIdentityReference manager = user(42L, 30L);
        when(identities.user(42L, 100001L)).thenReturn(manager);

        assertSame(manager, service.manager(7L));

        verify(identities, times(1)).user(7L, 100001L);
        verify(identities).user(88L, 100001L);
        verify(identities).user(42L, 100001L);
        verify(identities, never()).user(88L, 100000L);
    }

    @Test
    void missingTenantStopsBeforeReadingOrganization() {
        UserContext.clear();
        TenantContext.clear();
        assertThrows(IllegalArgumentException.class, () -> service.manager(7L));
        verifyNoInteractions(identities);
    }

    private OaIdentityReference user(Long id, Long deptId) {
        OaIdentityReference user = new OaIdentityReference();
        user.setId(id);
        user.setTenantId(100001L);
        user.setDeptId(deptId);
        return user;
    }

    private OaIdentityReference department(Long id, Long parentId, Long leaderUserId) {
        OaIdentityReference department = new OaIdentityReference();
        department.setId(id);
        department.setParentId(parentId);
        department.setLeaderUserId(leaderUserId);
        return department;
    }
}
