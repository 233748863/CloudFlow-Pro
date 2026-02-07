package com.cloudflow.workflow.config;

import com.cloudflow.common.core.context.UserContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.util.StringUtils;
import java.util.Arrays;
import java.util.HashSet;

import com.cloudflow.common.core.utils.TokenService;
import java.util.Map;
import java.util.Collection;

/**
 * 将 UserContext 同步到 Spring Security Context 以支持 @PreAuthorize
 * 支持两种模式：
 * 1. 网关模式：从 X-User-* 头读取用户信息
 * 2. 直连模式：从 Authorization 头读取 Token 并查询 Redis
 */
@Configuration
public class SecurityContextFilter extends OncePerRequestFilter {

    @Autowired
    private TokenService tokenService;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        try {
            // 1. 尝试从网关头提取信息
            String userIdStr = request.getHeader("X-User-Id");
            
            if (StringUtils.hasText(userIdStr)) {
                // 网关模式
                String userName = request.getHeader("X-User-Name");
                String rolesStr = request.getHeader("X-User-Roles");
                String deptIdStr = request.getHeader("X-User-Dept-Id");
                
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
                
                Set<String> roles = new HashSet<>();
                if (StringUtils.hasText(rolesStr)) {
                    roles = StringUtils.commaDelimitedListToSet(rolesStr);
                    UserContext.setRoles(roles);
                }

                // 填充 Spring Security
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
                
            } else {
                // 2. 尝试从 Authorization 头提取 Token (直连模式)
                String token = request.getHeader("Authorization");
                if (StringUtils.hasText(token) && token.startsWith("Bearer ")) {
                    token = token.substring(7);
                    
                    Map<String, Object> userMap = tokenService.verifyToken(token);
                    if (userMap != null) {
                        Object userIdObj = userMap.get("userId");
                        Long userId = null;
                        if (userIdObj instanceof Integer) {
                             userId = ((Integer) userIdObj).longValue();
                        } else if (userIdObj instanceof Long) {
                             userId = (Long) userIdObj;
                        }
                        
                        String userName = (String) userMap.get("username");
                        
                        // 填充 UserContext
                        if (userId != null) UserContext.setUserId(userId);
                        UserContext.setUserName(userName);

                        Object deptIdObj = userMap.get("deptId");
                        if (deptIdObj != null) {
                            if (deptIdObj instanceof Integer) {
                                UserContext.setDeptId(((Integer) deptIdObj).longValue());
                            } else if (deptIdObj instanceof Long) {
                                UserContext.setDeptId((Long) deptIdObj);
                            }
                        }
                        
                        // 处理角色和权限
                        List<GrantedAuthority> authorities = new ArrayList<>();
                        
                        // Roles -> ROLE_XXX
                        Object rolesObj = userMap.get("roles");
                        if (rolesObj instanceof Collection) {
                            for (Object role : (Collection<?>) rolesObj) {
                                authorities.add(new SimpleGrantedAuthority("ROLE_" + role));
                                // Also add to UserContext
                            }
                            // Convert to Set<String> for UserContext
                            UserContext.setRoles(new HashSet<>((Collection<String>) rolesObj));
                        }
                        
                        // Permissions -> system:user:list
                        Object permsObj = userMap.get("permissions");
                        if (permsObj instanceof Collection) {
                            for (Object perm : (Collection<?>) permsObj) {
                                authorities.add(new SimpleGrantedAuthority((String) perm));
                            }
                        }

                        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                                userName != null ? userName : userId.toString(), 
                                null, 
                                authorities);
                        authentication.setDetails(userId);
                        
                        SecurityContextHolder.getContext().setAuthentication(authentication);
                    }
                }
            }
            
            filterChain.doFilter(request, response);
        } finally {
            UserContext.clear();
            SecurityContextHolder.clearContext();
        }
    }
}
