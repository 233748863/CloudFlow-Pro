package com.cloudflow.auth.security;

import com.cloudflow.auth.domain.dto.UserInfo;
import com.cloudflow.auth.service.ISysUserService;
import com.cloudflow.common.core.context.UserContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.PatternMatchUtils;

import java.util.Set;

/**
 * 权限校验服务（参考 Poco 的 PermissionService）
 * 从 Spring Cache 中获取用户权限进行匹配
 * 
 * 在 Controller 中可通过 SpEL 使用：
 * @PreAuthorize("@pms.hasPermission('system:user:list')")
 * 或通过 @HasPermission 注解 + AOP 切面使用
 */
@Component("pms")
public class PermissionService {

    @Autowired
    private ISysUserService userService;

    /**
     * 判断当前用户是否拥有任一指定权限
     */
    public boolean hasPermission(String... permissions) {
        if (permissions == null || permissions.length == 0) {
            return false;
        }

        String username = UserContext.getUserName();
        if (username == null) {
            return false;
        }

        // 从 Spring Cache 获取用户信息（含权限集合）
        UserInfo userInfo = userService.findUserInfo(username);
        if (userInfo == null) {
            return false;
        }

        Set<String> userPerms = userInfo.getPermissions();
        if (userPerms == null || userPerms.isEmpty()) {
            return false;
        }

        // 管理员拥有所有权限
        if (userPerms.contains("*:*:*")) {
            return true;
        }

        // 任一权限匹配即通过（支持通配符）
        for (String perm : permissions) {
            if (userPerms.stream().anyMatch(userPerm -> PatternMatchUtils.simpleMatch(perm, userPerm))) {
                return true;
            }
        }
        return false;
    }

    /**
     * 判断当前用户是否拥有指定角色
     */
    public boolean hasRole(String... roles) {
        if (roles == null || roles.length == 0) {
            return false;
        }

        String username = UserContext.getUserName();
        if (username == null) {
            return false;
        }

        UserInfo userInfo = userService.findUserInfo(username);
        if (userInfo == null) {
            return false;
        }

        Set<String> userRoles = userInfo.getRoles();
        if (userRoles == null || userRoles.isEmpty()) {
            return false;
        }

        for (String role : roles) {
            if (userRoles.contains(role)) {
                return true;
            }
        }
        return false;
    }
}
