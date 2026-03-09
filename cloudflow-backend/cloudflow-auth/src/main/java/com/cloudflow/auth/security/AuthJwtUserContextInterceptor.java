package com.cloudflow.auth.security;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.utils.TokenService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * auth 服务专用用户上下文拦截器。
 *
 * auth 服务直接接收 Bearer JWT，请求不会经过基于 X-Auth-Token 的公共安全过滤器。
 * 这里负责把 JWT 对应的 loginUser 同步到 UserContext，供 @HasPermission 和租户过滤复用。
 */
@Component
public class AuthJwtUserContextInterceptor implements HandlerInterceptor {

    private final TokenService tokenService;

    public AuthJwtUserContextInterceptor(TokenService tokenService) {
        this.tokenService = tokenService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (UserContext.getUserId() != null) {
            return true;
        }

        String authorization = request.getHeader("Authorization");
        if (!StringUtils.hasText(authorization) || !authorization.startsWith("Bearer ")) {
            return true;
        }

        Map<String, Object> loginUser = tokenService.verifyToken(authorization.substring(7));
        if (loginUser == null || loginUser.isEmpty()) {
            return true;
        }

        fillUserContext(loginUser);
        return true;
    }

    private void fillUserContext(Map<String, Object> loginUser) {
        Object authToken = loginUser.get("token");
        if (authToken != null) {
            UserContext.setAuthToken(String.valueOf(authToken));
        }

        Object userIdObj = loginUser.get("userId");
        if (userIdObj != null) {
            UserContext.setUserId(toLong(userIdObj));
        }

        Object usernameObj = loginUser.get("username");
        if (usernameObj != null) {
            UserContext.setUserName(String.valueOf(usernameObj));
        }

        Object deptIdObj = loginUser.get("deptId");
        if (deptIdObj != null) {
            UserContext.setDeptId(toLong(deptIdObj));
        }

        Object deptNameObj = loginUser.get("deptName");
        if (deptNameObj != null) {
            UserContext.setDeptName(String.valueOf(deptNameObj));
        }

        Object rolesObj = loginUser.get("roles");
        if (rolesObj instanceof Collection<?>) {
            Set<String> roles = new HashSet<>();
            for (Object role : (Collection<?>) rolesObj) {
                if (role != null) {
                    roles.add(String.valueOf(role));
                }
            }
            UserContext.setRoles(roles);
        }

        Object permsObj = loginUser.get("permissions");
        if (permsObj instanceof Collection<?>) {
            Set<String> permissions = new HashSet<>();
            for (Object permission : (Collection<?>) permsObj) {
                if (permission != null) {
                    permissions.add(String.valueOf(permission));
                }
            }
            UserContext.setPermissions(permissions);
        }

        Object tenantIdObj = loginUser.get("tenantId");
        if (tenantIdObj != null) {
            UserContext.setTenantId(toLong(tenantIdObj));
        }

        Object dsTypeObj = loginUser.get("dsType");
        if (dsTypeObj instanceof Number) {
            UserContext.setDsType(((Number) dsTypeObj).intValue());
        }

        Object dsDeptIdsObj = loginUser.get("dsDeptIds");
        if (dsDeptIdsObj instanceof Collection<?>) {
            List<Long> dsDeptIds = new ArrayList<>();
            for (Object item : (Collection<?>) dsDeptIdsObj) {
                Long deptId = toLong(item);
                if (deptId != null) {
                    dsDeptIds.add(deptId);
                }
            }
            UserContext.setDsDeptIds(dsDeptIds);
        }
    }

    private Long toLong(Object obj) {
        if (obj instanceof Long) {
            return (Long) obj;
        }
        if (obj instanceof Number) {
            return ((Number) obj).longValue();
        }
        try {
            return Long.valueOf(String.valueOf(obj));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        UserContext.clear();
    }
}
