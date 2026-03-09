package com.cloudflow.auth.security;

import com.cloudflow.auth.domain.dto.UserInfo;
import com.cloudflow.auth.service.ISysUserService;
import com.cloudflow.common.core.context.UserContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.PatternMatchUtils;

import java.util.Set;

/**
 * 权限校验服务。
 */
@Component("pms")
public class PermissionService {

    @Autowired
    private ISysUserService userService;

    /**
     * 判断当前用户是否拥有任一指定权限。
     */
    public boolean hasPermission(String... permissions) {
        if (permissions == null || permissions.length == 0) {
            return false;
        }

        // 先用当前 token 已携带的权限做判断，避免切租户后再按目标租户重算权限。
        if (matchAnyPermission(UserContext.getPermissions(), permissions)) {
            return true;
        }

        String username = UserContext.getUserName();
        if (username == null) {
            return false;
        }

        UserInfo userInfo = userService.findUserInfo(username);
        if (userInfo == null) {
            return false;
        }

        return matchAnyPermission(userInfo.getPermissions(), permissions);
    }

    /**
     * 判断当前用户是否拥有任一指定角色。
     */
    public boolean hasRole(String... roles) {
        if (roles == null || roles.length == 0) {
            return false;
        }

        if (matchAnyRole(UserContext.getRoles(), roles)) {
            return true;
        }

        String username = UserContext.getUserName();
        if (username == null) {
            return false;
        }

        UserInfo userInfo = userService.findUserInfo(username);
        if (userInfo == null) {
            return false;
        }

        return matchAnyRole(userInfo.getRoles(), roles);
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
