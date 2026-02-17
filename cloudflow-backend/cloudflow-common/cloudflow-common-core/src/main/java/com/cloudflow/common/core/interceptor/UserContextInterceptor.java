package com.cloudflow.common.core.interceptor;

import com.cloudflow.common.core.context.UserContext;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 用户信息拦截器
 */
public class UserContextInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String userId = request.getHeader("X-User-Id");
        String userName = request.getHeader("X-User-Name");
        String roles = request.getHeader("X-User-Roles");
        String deptId = request.getHeader("X-User-Dept-Id");
        String deptName = request.getHeader("X-User-Dept-Name");
        String tenantId = request.getHeader("X-User-Tenant-Id");

        if (StringUtils.hasText(userId)) {
            try {
                UserContext.setUserId(Long.valueOf(userId));
            } catch (NumberFormatException e) {
                // ignore
            }
        }
        if (StringUtils.hasText(userName)) {
            UserContext.setUserName(userName);
        }
        if (StringUtils.hasText(roles)) {
            UserContext.setRoles(StringUtils.commaDelimitedListToSet(roles));
        }
        if (StringUtils.hasText(deptId)) {
            try {
                UserContext.setDeptId(Long.valueOf(deptId));
            } catch (NumberFormatException e) {
                // ignore
            }
        }
        if (StringUtils.hasText(deptName)) {
            // 部门名称可能经过URL编码，需要解码
            try {
                UserContext.setDeptName(java.net.URLDecoder.decode(deptName, "UTF-8"));
            } catch (Exception e) {
                UserContext.setDeptName(deptName);
            }
        }
        if (StringUtils.hasText(tenantId)) {
            try {
                UserContext.setTenantId(Long.valueOf(tenantId));
            } catch (NumberFormatException e) {
                // ignore
            }
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) throws Exception {
        UserContext.clear();
    }
}
