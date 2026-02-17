package com.cloudflow.common.security.interceptor;

import com.cloudflow.common.core.constant.CacheConstants;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.utils.RedisCache;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Collection;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * 用户信息拦截器（安全增强版）
 * 
 * 从 X-Auth-Token（Token UUID）通过 Redis 读取完整用户信息，
 * 避免 Header 伪造风险和中文编码问题。
 * 
 * @author CloudFlow
 */
@Component
public class UserContextInterceptor implements HandlerInterceptor {

    @Autowired
    private RedisCache redisCache;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // 如果 SecurityContextFilter 已经填充了 UserContext，跳过重复读取
        if (UserContext.getUserId() != null) {
            return true;
        }

        String authToken = request.getHeader("X-Auth-Token");

        if (StringUtils.hasText(authToken)) {
            // 通过 Token UUID 从 Redis 读取完整用户信息
            String userKey = CacheConstants.LOGIN_TOKEN_KEY + authToken;
            Map<String, Object> loginUser = redisCache.getCacheObject(userKey);
            if (loginUser != null) {
                fillContext(loginUser, authToken);
                fillTenant(loginUser, request);
                return true;
            }
        }

        // 回退：从 Header 中获取租户ID（兼容白名单接口等场景）
        String tenantId = request.getHeader("X-User-Tenant-Id");
        if (StringUtils.hasText(tenantId) && UserContext.getTenantId() == null) {
            try {
                UserContext.setTenantId(Long.valueOf(tenantId));
            } catch (NumberFormatException e) {
                // ignore
            }
        }
        return true;
    }

    /**
     * 从 Redis 中的 loginUser Map 填充 UserContext
     */
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
        if (rolesObj instanceof Collection) {
            Set<String> roles = new HashSet<>();
            for (Object r : (Collection<?>) rolesObj) {
                if (r != null) roles.add(String.valueOf(r));
            }
            UserContext.setRoles(roles);
        }

        Object permsObj = loginUser.get("permissions");
        if (permsObj instanceof Collection) {
            Set<String> permissions = new HashSet<>();
            for (Object p : (Collection<?>) permsObj) {
                if (p != null) permissions.add(String.valueOf(p));
            }
            UserContext.setPermissions(permissions);
        }
    }

    private void fillTenant(Map<String, Object> loginUser, HttpServletRequest request) {
        Object tenantIdObj = loginUser.get("tenantId");
        if (tenantIdObj != null) {
            UserContext.setTenantId(toLong(tenantIdObj));
        } else {
            String tenantId = request.getHeader("X-User-Tenant-Id");
            if (StringUtils.hasText(tenantId)) {
                try {
                    UserContext.setTenantId(Long.valueOf(tenantId));
                } catch (NumberFormatException e) {
                    // ignore
                }
            }
        }
    }

    private Long toLong(Object obj) {
        if (obj instanceof Long) return (Long) obj;
        if (obj instanceof Number) return ((Number) obj).longValue();
        try {
            return Long.valueOf(String.valueOf(obj));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) throws Exception {
        UserContext.clear();
    }
}
