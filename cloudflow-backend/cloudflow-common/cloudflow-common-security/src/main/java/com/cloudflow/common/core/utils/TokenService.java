package com.cloudflow.common.core.utils;

import cn.dev33.satoken.session.SaSession;
import cn.dev33.satoken.stp.StpUtil;
import cn.dev33.satoken.stp.parameter.SaLoginParameter;
import com.cloudflow.common.config.properties.SecurityProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.Map;

/**
 * Token 服务。
 *
 * 说明：
 * - 对外继续保留原有方法签名，降低业务改造范围。
 * - 内部实现已完全切换为 Sa-Token，不再依赖 JWT。
 */
@Component
public class TokenService {

    public static final String LOGIN_USER_SESSION_KEY = "cloudflow:loginUser";

    private static final long MILLIS_SECOND = 1000L;
    private static final long SECONDS_PER_MINUTE = 60L;

    @Autowired
    private SecurityProperties securityProperties;

    @Autowired(required = false)
    private SysConfigHelper sysConfigHelper;

    /**
     * 获取 Token 过期时间，单位：分钟。
     */
    private int getExpiration() {
        if (sysConfigHelper != null) {
            return sysConfigHelper.getGlobalInt("sys.security.token.expiration",
                    securityProperties.getToken().getExpiration());
        }
        return securityProperties.getToken().getExpiration();
    }

    /**
     * 获取 Token 续期阈值，单位：分钟。
     */
    private int getRefreshTime() {
        if (sysConfigHelper != null) {
            return sysConfigHelper.getGlobalInt("sys.security.token.refreshTime",
                    securityProperties.getToken().getRefreshTime());
        }
        return securityProperties.getToken().getRefreshTime();
    }

    /**
     * 创建登录态并返回原始 Token。
     */
    public String createToken(Map<String, Object> loginUser) {
        if (loginUser == null || loginUser.isEmpty()) {
            throw new IllegalArgumentException("登录用户信息不能为空");
        }

        Long userId = toLong(loginUser.get("userId"));
        if (userId == null) {
            throw new IllegalArgumentException("登录用户缺少 userId");
        }

        long timeoutSeconds = getExpiration() * SECONDS_PER_MINUTE;

        SaLoginParameter loginParameter = new SaLoginParameter()
                .setTimeout(timeoutSeconds)
                .setIsConcurrent(false)
                .setIsShare(false);

        StpUtil.login(userId, loginParameter);

        String token = StpUtil.getTokenValue();
        Map<String, Object> sessionUser = new HashMap<>(loginUser);
        sessionUser.put("userId", userId);
        sessionUser.put("token", token);
        sessionUser.put("login_time", System.currentTimeMillis());
        sessionUser.put("expire_time", System.currentTimeMillis() + timeoutSeconds * MILLIS_SECOND);

        StpUtil.getSession().set(LOGIN_USER_SESSION_KEY, sessionUser);
        return token;
    }

    /**
     * 校验 Token 是否有效，并在接近过期时自动续期。
     */
    public Map<String, Object> verifyToken(String token) {
        String rawToken = normalizeToken(token);
        if (!StringUtils.hasText(rawToken)) {
            return null;
        }

        try {
            Object loginId = StpUtil.getLoginIdByToken(rawToken);
            if (loginId == null) {
                return null;
            }

            long remainingSeconds = StpUtil.getTokenTimeout(rawToken);
            if (remainingSeconds == -2) {
                return null;
            }

            long refreshThresholdSeconds = getRefreshTime() * SECONDS_PER_MINUTE;
            if (remainingSeconds > 0 && remainingSeconds <= refreshThresholdSeconds) {
                StpUtil.renewTimeout(rawToken, getExpiration() * SECONDS_PER_MINUTE);
                remainingSeconds = StpUtil.getTokenTimeout(rawToken);
            }

            Map<String, Object> loginUser = getLoginUserByLoginId(loginId);
            if (loginUser == null) {
                return null;
            }

            loginUser.put("token", rawToken);
            if (remainingSeconds >= 0) {
                loginUser.put("expire_time", System.currentTimeMillis() + remainingSeconds * MILLIS_SECOND);
            }
            return loginUser;
        } catch (Exception ignored) {
            return null;
        }
    }

    /**
     * 按登录 ID 获取登录用户信息。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getLoginUserByLoginId(Object loginId) {
        if (loginId == null) {
            return null;
        }

        SaSession session = StpUtil.getSessionByLoginId(loginId, false);
        if (session == null) {
            return null;
        }

        Object loginUser = session.get(LOGIN_USER_SESSION_KEY);
        if (!(loginUser instanceof Map<?, ?> userMap)) {
            return null;
        }

        return new HashMap<>((Map<String, Object>) userMap);
    }

    /**
     * 删除 Token，对应 Sa-Token 的登出动作。
     */
    public void deleteToken(String token) {
        String rawToken = normalizeToken(token);
        if (!StringUtils.hasText(rawToken)) {
            return;
        }
        StpUtil.logoutByTokenValue(rawToken);
    }

    private String normalizeToken(String token) {
        if (!StringUtils.hasText(token)) {
            return token;
        }
        return token.startsWith("Bearer ") ? token.substring(7) : token;
    }

    private Long toLong(Object obj) {
        if (obj instanceof Long value) {
            return value;
        }
        if (obj instanceof Number value) {
            return value.longValue();
        }
        if (obj == null) {
            return null;
        }
        try {
            return Long.valueOf(String.valueOf(obj));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
