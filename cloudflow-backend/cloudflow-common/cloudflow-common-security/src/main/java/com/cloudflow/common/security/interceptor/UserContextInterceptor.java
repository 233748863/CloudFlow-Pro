package com.cloudflow.common.security.interceptor;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.context.UserDataScopeSnapshot;
import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.exception.ErrorCodeConstants;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.redis.core.UserDataScopeStore;
import com.cloudflow.common.security.cookie.AuthCookieSupport;
import com.cloudflow.common.security.core.TokenService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 用户上下文拦截器。
 *
 * 认证状态由 Sa-Token 托管，这里只负责把当前请求的登录信息同步到 UserContext，
 * 供租户隔离、数据权限和业务代码统一读取。
 */
@Component
public class UserContextInterceptor implements HandlerInterceptor {

    @Autowired
    private TokenService tokenService;

    @Autowired(required = false)
    private UserDataScopeStore userDataScopeStore;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (UserContext.getUserId() != null) {
            return true;
        }

        String token = AuthCookieSupport.resolveRawToken(request);
        if (StringUtils.hasText(token)) {
            Map<String, Object> loginUser = tokenService.verifyToken(token);
            if (loginUser != null) {
                refreshDynamicDataScope(loginUser);
                fillContext(loginUser, token);
                fillTenant(loginUser, request);
                return true;
            }
        }

        fillTenantFromTrustedInnerRequest(request);
        return true;
    }

    private void refreshDynamicDataScope(Map<String, Object> loginUser) {
        if (userDataScopeStore == null || loginUser == null) {
            return;
        }
        Long userId = toLong(loginUser.get("userId"));
        Long tenantId = toLong(loginUser.get("tenantId"));
        if (userId == null || tenantId == null) {
            return;
        }
        UserDataScopeSnapshot snapshot = userDataScopeStore.get(tenantId, userId);
        if (snapshot == null) {
            return;
        }
        if (snapshot.getDsType() != null) {
            loginUser.put("dsType", snapshot.getDsType());
        }
        if (snapshot.getDsDeptIds() != null) {
            loginUser.put("dsDeptIds", snapshot.getDsDeptIds());
        }
        if (snapshot.getTenantId() != null) {
            loginUser.put("tenantId", snapshot.getTenantId());
        }
    }

    private void fillContext(Map<String, Object> loginUser, String authToken) {
        UserContext.setAuthToken(authToken);

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
        if (rolesObj instanceof Collection<?> collection) {
            Set<String> roles = new HashSet<>();
            for (Object role : collection) {
                if (role != null) {
                    roles.add(String.valueOf(role));
                }
            }
            UserContext.setRoles(roles);
        }

        Object permsObj = loginUser.get("permissions");
        if (permsObj instanceof Collection<?> collection) {
            Set<String> permissions = new HashSet<>();
            for (Object permission : collection) {
                if (permission != null) {
                    permissions.add(String.valueOf(permission));
                }
            }
            UserContext.setPermissions(permissions);
        }

        Object dsTypeObj = loginUser.get("dsType");
        if (dsTypeObj instanceof Number number) {
            UserContext.setDsType(number.intValue());
        }

        Object dsDeptIdsObj = loginUser.get("dsDeptIds");
        if (dsDeptIdsObj instanceof Collection<?> collection) {
            List<Long> dsDeptIds = new ArrayList<>();
            for (Object id : collection) {
                Long deptId = toLong(id);
                if (deptId != null) {
                    dsDeptIds.add(deptId);
                }
            }
            UserContext.setDsDeptIds(dsDeptIds);
        }
    }

    private void fillTenant(Map<String, Object> loginUser, HttpServletRequest request) {
        Object tenantIdObj = loginUser.get("tenantId");
        if (tenantIdObj != null) {
            UserContext.setTenantId(toLong(tenantIdObj));
            return;
        }
        if (isTrustedInnerRequest(request)) {
            fillTenantFromTrustedInnerRequest(request);
            return;
        }
        throw new ServiceException("登录会话缺少租户信息", ErrorCodeConstants.UNAUTHORIZED);
    }

    private void fillTenantFromTrustedInnerRequest(HttpServletRequest request) {
        if (UserContext.getTenantId() != null) {
            return;
        }

        if (!isTrustedInnerRequest(request)) {
            return;
        }

        String tenantId = request.getHeader("X-Tenant-Id");
        if (StringUtils.hasText(tenantId)) {
            try {
                UserContext.setTenantId(Long.valueOf(tenantId));
            } catch (NumberFormatException ignored) {
            }
        }
    }

    private boolean isTrustedInnerRequest(HttpServletRequest request) {
        return request != null
                && request.getRequestURI().startsWith("/inner/")
                && SecurityConstants.INNER_CALL_VALUE.equals(
                request.getHeader(SecurityConstants.INNER_CALL_HEADER));
    }

    private Long toLong(Object obj) {
        if (obj instanceof Long value) {
            return value;
        }
        if (obj instanceof Number value) {
            return value.longValue();
        }
        if (obj == null) {
            return null;
        }
        try {
            return Long.valueOf(String.valueOf(obj));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        UserContext.clear();
    }
}
