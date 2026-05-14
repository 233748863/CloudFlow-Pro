package com.cloudflow.common.security.service;

import cn.dev33.satoken.stp.StpInterface;
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
 * 权限和角色统一从当前登录会话中读取，避免每次鉴权重复查库。
 */
@Component
public class CloudFlowStpInterface implements StpInterface {

    @Autowired
    private TokenService tokenService;

    @Override
    public List<String> getPermissionList(Object loginId, String loginType) {
        Map<String, Object> loginUser = tokenService.getLoginUserByLoginId(loginId);
        if (loginUser == null) {
            return Collections.emptyList();
        }
        return toStringList(loginUser.get("permissions"), false);
    }

    @Override
    public List<String> getRoleList(Object loginId, String loginType) {
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
