package com.cloudflow.common.security.service;

import cn.dev33.satoken.stp.StpInterface;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.security.core.TokenService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Sa-Token 权限数据提供器。
 *
 * 角色取自登录会话，内部权限按当前请求的租户套餐上限求交。
 */
@Component
public class CloudFlowStpInterface implements StpInterface {

    @Autowired
    private TokenService tokenService;

    @Autowired(required = false)
    private CurrentPermissionService currentPermissions;

    @Override
    public List<String> getPermissionList(Object loginId, String loginType) {
        if (com.cloudflow.common.security.oauth2.OAuthTokens.LOGIN_TYPE.equals(loginType)) {
            return com.cloudflow.common.security.oauth2.OAuthContext.permissions(loginId);
        }
        if (com.cloudflow.common.security.portal.PortalTokens.LOGIN_TYPE.equals(loginType)) {
            return com.cloudflow.common.security.portal.PortalContext.permissions(loginId);
        }
        if (!StpUtil.getLoginType().equals(loginType)) {
            return Collections.emptyList();
        }
        Map<String, Object> loginUser = tokenService.getLoginUserByLoginId(loginId);
        if (loginUser == null) {
            return Collections.emptyList();
        }
        if (currentPermissions == null) throw new com.cloudflow.common.core.exception.ServiceException("租户套餐权限暂不可用，请稍后重试", 503);
        return new ArrayList<>(currentPermissions.permissions(loginUser));
    }

    @Override
    public List<String> getRoleList(Object loginId, String loginType) {
        if (!StpUtil.getLoginType().equals(loginType)) {
            return Collections.emptyList();
        }
        Map<String, Object> loginUser = tokenService.getLoginUserByLoginId(loginId);
        if (loginUser == null) {
            return Collections.emptyList();
        }
        return toStringList(loginUser.get("roles"), true);
    }

    private List<String> toStringList(Object value, boolean normalizeLowerCase) {
        if (!(value instanceof Collection<?> collection)) {
            return Collections.emptyList();
        }

        List<String> result = new ArrayList<>();
        for (Object item : collection) {
            if (item == null) {
                continue;
            }
            String text = String.valueOf(item).trim();
            if (!StringUtils.hasText(text)) {
                continue;
            }
            result.add(normalizeLowerCase ? text.toLowerCase() : text);
        }
        return result;
    }
}
