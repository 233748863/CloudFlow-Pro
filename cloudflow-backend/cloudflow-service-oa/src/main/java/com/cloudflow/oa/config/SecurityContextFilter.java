package com.cloudflow.oa.config;

import com.cloudflow.common.core.context.UserContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.util.StringUtils;

/**
 * 从网关传递的请求头中提取用户信息，填充 UserContext 和 Spring Security Context。
 * 
 * 网关 AuthFilter 验证 Token 后，会将用户信息通过以下请求头传递到下游服务：
 * - X-User-Id: 用户ID
 * - X-User-Name: 用户名
 * - X-User-Roles: 角色列表（逗号分隔）
 * - X-User-Dept-Id: 部门ID
 * - X-User-Tenant-Id: 租户ID
 */
@Configuration
public class SecurityContextFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        try {
            String userIdStr = request.getHeader("X-User-Id");

            if (StringUtils.hasText(userIdStr)) {
                String userName = request.getHeader("X-User-Name");
                String rolesStr = request.getHeader("X-User-Roles");
                String deptIdStr = request.getHeader("X-User-Dept-Id");
                String tenantIdStr = request.getHeader("X-User-Tenant-Id");

                Long userId = Long.valueOf(userIdStr);

                // 填充 UserContext
                UserContext.setUserId(userId);
                UserContext.setUserName(userName);

                if (StringUtils.hasText(deptIdStr) && !"null".equals(deptIdStr)) {
                    try {
                        UserContext.setDeptId(Long.valueOf(deptIdStr));
                    } catch (NumberFormatException e) {
                        // ignore
                    }
                }

                if (StringUtils.hasText(tenantIdStr) && !"null".equals(tenantIdStr)) {
                    try {
                        UserContext.setTenantId(Long.valueOf(tenantIdStr));
                    } catch (NumberFormatException e) {
                        // ignore
                    }
                }

                Set<String> roles = new HashSet<>();
                if (StringUtils.hasText(rolesStr)) {
                    roles = StringUtils.commaDelimitedListToSet(rolesStr);
                    UserContext.setRoles(roles);
                }

                // 填充 Spring Security Context
                List<GrantedAuthority> authorities = new ArrayList<>();
                if (!roles.isEmpty()) {
                    authorities = roles.stream()
                            .map(role -> new SimpleGrantedAuthority("ROLE_" + role))
                            .collect(Collectors.toList());
                }

                UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                        userName != null ? userName : userId.toString(),
                        null,
                        authorities);
                authentication.setDetails(userId);

                SecurityContextHolder.getContext().setAuthentication(authentication);
            }

            filterChain.doFilter(request, response);
        } finally {
            UserContext.clear();
            SecurityContextHolder.clearContext();
        }
    }
}
