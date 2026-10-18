package com.cloudflow.common.security.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.core.TokenService;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** Requires a live employee session, including on internal multipart endpoints. */
@Component
@org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication(type = org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication.Type.SERVLET)
@RequiredArgsConstructor
public class PortalFinanceActor {
    private final TokenService tokens;
    private final CurrentPermissionService permissions;

    public void require() {
        Map<String, Object> identity = tokens.verifyToken(UserContext.getAuthToken());
        if (identity == null || UserContext.getUserId() == null || UserContext.getTenantId() == null
                || UserContext.getUserName() == null || UserContext.getUserName().isBlank()
                || !Objects.equals(String.valueOf(identity.get("userId")), UserContext.getUserId().toString())
                || !Objects.equals(String.valueOf(identity.get("tenantId")), UserContext.getTenantId().toString())
                || !Objects.equals(identity.get("username"), UserContext.getUserName())) {
            throw new ServiceException("请使用有效的内部账号登录后办理财务公开", 401);
        }
        Set<String> granted = permissions.permissions(identity);
        if (!granted.contains("crm:portal-finance:manage") && !granted.contains("*:*:*")) {
            throw new ServiceException("无权办理财务公开", 403);
        }
    }
}
