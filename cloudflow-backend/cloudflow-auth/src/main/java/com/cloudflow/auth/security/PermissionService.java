package com.cloudflow.auth.security;

import com.cloudflow.common.core.context.UserContext;
import org.springframework.stereotype.Component;
import org.springframework.util.PatternMatchUtils;

import java.util.Set;

/**
 * 权限校验服务。
 */
@Component("pms")
public class PermissionService {

    /**
     * 判断当前用户是否拥有任一指定权限。
     */
    public boolean hasPermission(String... permissions) {
        if (permissions == null || permissions.length == 0) {
            return false;
        }
        return matchAnyPermission(UserContext.getPermissions(), permissions);
    }

    /**
     * 判断当前用户是否拥有任一指定角色。
     */
    public boolean hasRole(String... roles) {
        if (roles == null || roles.length == 0) {
            return false;
        }
        return matchAnyRole(UserContext.getRoles(), roles);
    }

    private boolean matchAnyPermission(Set<String> userPerms, String... permissions) {
        if (userPerms == null || userPerms.isEmpty()) {
            return false;
        }

        if (userPerms.contains("*:*:*")) {
            return true;
        }

        for (String requiredPerm : permissions) {
            for (String userPerm : userPerms) {
                if (PatternMatchUtils.simpleMatch(userPerm, requiredPerm)
                        || PatternMatchUtils.simpleMatch(requiredPerm, userPerm)) {
                    return true;
                }
            }
        }
        return false;
    }

    private boolean matchAnyRole(Set<String> userRoles, String... roles) {
        if (userRoles == null || userRoles.isEmpty()) {
            return false;
        }

        for (String requiredRole : roles) {
            for (String userRole : userRoles) {
                if (userRole != null && userRole.equalsIgnoreCase(requiredRole)) {
                    return true;
                }
            }
        }
        return false;
    }
}
