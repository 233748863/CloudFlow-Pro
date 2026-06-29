package com.cloudflow.gateway.config;

import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.redis.config.SysConfigChangeEvent;
import com.cloudflow.common.redis.config.SysConfigChangeListener;
import com.cloudflow.common.redis.config.SysConfigKeys;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * 网关认证白名单配置（P2-2）
 *
 * 优先读取 sys_config 在线配置，未配置时回退到本类默认白名单。
 */
@Slf4j
@Component
public class GatewayAuthProperties implements SysConfigChangeListener {

    @Autowired(required = false)
    private RuntimeSysConfigService runtimeSysConfigService;

    private volatile List<String> effectiveWhitelist = DEFAULT_WHITELIST;

    /**
     * 默认白名单兜底：当外部配置缺失或被清空时，确保登录/注册/验证码/公告/WebSocket 不会被锁死。
     */
    public static final List<String> DEFAULT_WHITELIST = List.of(
            "/auth/login",
            "/auth/register",
            "/auth/tenant/options",
            "/auth/legal/public/**",
            "/auth/captcha/**",
            "/oa/announcement/public",
            "/oa/announcement/public/**",
            "/ws/**"
    );

    @PostConstruct
    public void init() {
        refreshWhitelist();
    }

    /**
     * 取生效白名单：请求链路只读本地缓存，避免 WebFlux 线程同步访问 Redis。
     */
    public List<String> effectiveWhitelist() {
        return effectiveWhitelist;
    }

    private void refreshWhitelist() {
        if (runtimeSysConfigService == null) {
            effectiveWhitelist = DEFAULT_WHITELIST;
            return;
        }
        List<String> configuredWhitelist = runtimeSysConfigService.getCsv(SysConfigKeys.GATEWAY_AUTH_WHITELIST, List.of());
        if (configuredWhitelist.isEmpty()) {
            effectiveWhitelist = DEFAULT_WHITELIST;
            return;
        }
        LinkedHashSet<String> mergedWhitelist = new LinkedHashSet<>(configuredWhitelist);
        mergedWhitelist.addAll(DEFAULT_WHITELIST);
        effectiveWhitelist = List.copyOf(mergedWhitelist);
    }

    @Override
    public void onSysConfigChanged(SysConfigChangeEvent event) {
        if (event == null || !SysConfigKeys.GATEWAY_AUTH_WHITELIST.equals(event.configKey())) {
            return;
        }
        CompletableFuture.runAsync(() -> {
            refreshWhitelist();
            log.info("网关认证白名单配置已刷新");
        });
    }
}
