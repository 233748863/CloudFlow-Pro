package com.cloudflow.gateway.config;

import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.redis.config.SysConfigKeys;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 网关认证白名单配置（P2-2）
 *
 * 优先读取 sys_config 在线配置，未配置时回退到本类默认白名单。
 */
@Component
public class GatewayAuthProperties {

    @Autowired(required = false)
    private RuntimeSysConfigService runtimeSysConfigService;

    /**
     * 默认白名单兜底：当外部配置缺失或被清空时，确保登录/注册/验证码/公告/WebSocket 不会被锁死。
     */
    public static final List<String> DEFAULT_WHITELIST = List.of(
            "/auth/login",
            "/auth/register",
            "/auth/tenant/options",
            "/auth/captcha/**",
            "/oa/announcement/public",
            "/oa/announcement/public/**",
            "/ws/**"
    );

    /**
     * 取生效白名单：在线配置非空则用在线配置，否则用默认。
     */
    public List<String> effectiveWhitelist() {
        if (runtimeSysConfigService == null) {
            return DEFAULT_WHITELIST;
        }
        return runtimeSysConfigService.getCsv(SysConfigKeys.GATEWAY_AUTH_WHITELIST, DEFAULT_WHITELIST);
    }
}
