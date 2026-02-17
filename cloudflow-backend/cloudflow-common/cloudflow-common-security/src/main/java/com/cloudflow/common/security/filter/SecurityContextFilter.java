package com.cloudflow.common.security.filter;

import com.cloudflow.common.core.constant.CacheConstants;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.utils.RedisCache;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 安全上下文过滤器（统一版）
 * 
 * 从 X-Auth-Token 通过 Redis 读取完整用户信息，
 * 同时填充 UserContext 和 Spring Security Context。
 * 
 * 执行顺序：Filter（本类） → Interceptor（UserContextInterceptor）
 * 由于 Filter 先于 Interceptor 执行，本类负责主要的用户信息填充工作。
 * UserContextInterceptor 会检查 UserContext 是否已被填充，避免重复读取。
 * 
 * 注意：不使用 @Component，通过 SecurityFilterAutoConfig 条件化注册，
 * 仅在 classpath 存在 Spring Security 时才创建 Bean，
 * 避免 auth 等无 Spring Security 依赖的服务启动失败。
 * 
 * @author CloudFlow
 */
public class SecurityContextFilter extends OncePerRequestFilter {

    @Autowired
    private RedisCache redisCache;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        try {
            // 填充用户上下文
            populateContext(request);
            // 继续过滤器链
            filterChain.doFilter(request, response);
        } finally {
            // 请求结束后清理上下文
            UserContext.clear();
            SecurityContextHolder.clearContext();
        }
    }

    /**
     * 从 X-Auth-Token 或 Header 填充用户上下文
     */
    private void populateContext(HttpServletRequest request) {
        try {
            String authToken = request.getHeader("X-Auth-Token");

            if (StringUtils.hasText(authToken)) {
                // 通过 Token UUID 从 Redis 读取完整用户信息
                String userKey = CacheConstants.LOGIN_TOKEN_KEY + authToken;
                Map<String, Object> loginUser = redisCache.getCacheObject(userKey);

                if (loginUser != null) {
                    fillUserContext(loginUser, authToken);
                    fillSecurityContext(loginUser);
                    fillTenantFromRedis(loginUser, request);
                    return;
                }
            }

            // 回退：从 Header 获取租户ID（兼容白名单接口等场景）
            String tenantId = request.getHeader("X-User-Tenant-Id");
            if (StringUtils.hasText(tenantId)) {
                try {
                    UserContext.setTenantId(Long.valueOf(tenantId));
                } catch (NumberFormatException e) {
                    // ignore
                }
            }
        } catch (Exception e) {
            // 认证失败不阻断请求，由业务层判断是否需要登录
        }
    }

    /**
     * 从 Redis 中的 loginUser Map 填充 UserContext
     */
    private void fillUserContext(Map<String, Object> loginUser, String authToken) {
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

        // 角色
        Object rolesObj = loginUser.get("roles");
        if (rolesObj instanceof Collection) {
            Set<String> roles = new HashSet<>();
            for (Object r : (Collection<?>) rolesObj) {
                if (r != null) roles.add(String.valueOf(r));
            }
            UserContext.setRoles(roles);
        }

        // 权限
        Object permsObj = loginUser.get("permissions");
        if (permsObj instanceof Collection) {
            Set<String> permissions = new HashSet<>();
            for (Object p : (Collection<?>) permsObj) {
                if (p != null) permissions.add(String.valueOf(p));
            }
            UserContext.setPermissions(permissions);
        }
    }

    /**
     * 将用户信息同步到 Spring Security Context，支持 @PreAuthorize 注解
     */
    private void fillSecurityContext(Map<String, Object> loginUser) {
        List<GrantedAuthority> authorities = new ArrayList<>();

        // 角色 → ROLE_xxx（Spring Security 角色前缀约定）
        Object rolesObj = loginUser.get("roles");
        if (rolesObj instanceof Collection) {
            for (Object role : (Collection<?>) rolesObj) {
                if (role != null) {
                    authorities.add(new SimpleGrantedAuthority("ROLE_" + role));
                }
            }
        }

        // 权限 → 直接作为 authority（如 system:user:list）
        Object permsObj = loginUser.get("permissions");
        if (permsObj instanceof Collection) {
            for (Object perm : (Collection<?>) permsObj) {
                if (perm != null) {
                    authorities.add(new SimpleGrantedAuthority(String.valueOf(perm)));
                }
            }
        }

        Object usernameObj = loginUser.get("username");
        Object userIdObj = loginUser.get("userId");
        String principal = usernameObj != null ? String.valueOf(usernameObj) :
                          (userIdObj != null ? String.valueOf(userIdObj) : "anonymous");

        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(principal, null, authorities);
        authentication.setDetails(userIdObj != null ? toLong(userIdObj) : null);

        SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    /**
     * 填充租户信息
     */
    private void fillTenantFromRedis(Map<String, Object> loginUser, HttpServletRequest request) {
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
}
