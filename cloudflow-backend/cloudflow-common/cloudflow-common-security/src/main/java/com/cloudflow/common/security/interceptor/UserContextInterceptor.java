package com.cloudflow.common.security.interceptor;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.utils.TokenService;
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

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (UserContext.getUserId() != null) {
            return true;
        }

        String token = resolveToken(request);
        if (StringUtils.hasText(token)) {
            Map<String, Object> loginUser = tokenService.verifyToken(token);
            if (loginUser != null) {
                fillContext(loginUser, token);
                fillTenant(loginUser, request);
                return true;
            }
        }

        fillTenantFromHeader(request);
        return true;
    }

    private String resolveToken(HttpServletRequest request) {
        String token = request.getHeader("Authorization");
        if (!StringUtils.hasText(token)) {
            token = request.getParameter("token");
        }
        if (StringUtils.hasText(token) && token.startsWith("Bearer ")) {
            return token.substring(7);
        }
        return token;
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
        fillTenantFromHeader(request);
    }

    private void fillTenantFromHeader(HttpServletRequest request) {
        if (UserContext.getTenantId() != null) {
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
