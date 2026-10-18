package com.cloudflow.common.security.oauth2;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import java.util.Set;
import java.util.function.Supplier;

public final class OAuthResourceContext {
    private OAuthResourceContext() { }

    public static <Result> Result read(OAuthIdentity identity, String scope, Supplier<Result> operation) {
        if (identity == null || !identity.scopes().contains(scope)) throw OAuthFailure.forbidden();
        if (!identity.businessPermissions().containsAll(OAuthScope.require(scope).businessPermissions())) throw OAuthFailure.forbidden();
        UserContext.clear();
        TenantContext.clear();
        OAuthContext.setVerified(identity);
        UserContext.setUserId(identity.userId());
        UserContext.setTenantId(identity.tenantId());
        UserContext.setUserName("oauth2:" + identity.userId());
        UserContext.setDeptId(identity.deptId());
        UserContext.setDsType(identity.dsType());
        UserContext.setDsDeptIds(identity.deptIds());
        UserContext.setRoles(Set.of());
        UserContext.setPermissions(identity.businessPermissions());
        TenantContext.setTenantId(identity.tenantId());
        try { return operation.get(); }
        finally { OAuthContext.clear(); UserContext.clear(); TenantContext.clear(); }
    }
}

