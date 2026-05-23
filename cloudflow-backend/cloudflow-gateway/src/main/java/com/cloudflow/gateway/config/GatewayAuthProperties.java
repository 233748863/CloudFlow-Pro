package com.cloudflow.gateway.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 网关认证白名单配置（P2-2）
 *
 * 抽取 AuthFilter 原硬编码 whiteList 为外部可配置项，
 * 支持 Nacos config/cloudflow-gateway.yaml 动态新增/移除而不需要重启网关。
 *
 * 示例：
 * cloudflow:
 *   gateway:
 *     auth:
 *       whitelist:
 *         - /auth/login
 *         - /auth/tenant/options
 *         - /oa/announcement/public/**
 *         - /ws/**
 */
@Data
@Component
@RefreshScope
@ConfigurationProperties(prefix = "cloudflow.gateway.auth")
public class GatewayAuthProperties {

    /**
     * 网关认证白名单路径列表（Ant 路径，支持 ** 通配）。
     * 未配置时回退到 defaultWhitelist 保证基础登录链路可用。
     */
    private List<String> whitelist = new ArrayList<>();

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
     * 取生效白名单：外部配置非空则用外部，否则用默认。
     */
    public List<String> effectiveWhitelist() {
        return (whitelist == null || whitelist.isEmpty()) ? DEFAULT_WHITELIST : whitelist;
    }
}
