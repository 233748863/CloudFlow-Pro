package com.cloudflow.gateway.config;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.utils.IpUtils;
import org.springframework.cloud.gateway.filter.ratelimit.KeyResolver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.util.StringUtils;
import reactor.core.publisher.Mono;

@Configuration
public class RateLimitConfig {

    /**
     * IP Key Resolver
     */
    @Bean
    @Primary
    public KeyResolver ipKeyResolver() {
        return exchange -> Mono.just(resolveClientIp(exchange));
    }

    /**
     * User Key Resolver
     * 优先根据 Bearer Token 解析登录用户，拿不到再回退 IP。
     */
    @Bean
    public KeyResolver userKeyResolver() {
        return exchange -> {
            String authorization = exchange.getRequest().getHeaders().getFirst("Authorization");
            if (StringUtils.hasText(authorization) && authorization.startsWith("Bearer ")) {
                String rawToken = authorization.substring(7);
                try {
                    Object loginId = StpUtil.getLoginIdByToken(rawToken);
                    if (loginId != null) {
                        return Mono.just(String.valueOf(loginId));
                    }
                } catch (Exception ignored) {
                }
            }
            return Mono.just(resolveClientIp(exchange));
        };
    }

    private String resolveClientIp(org.springframework.web.server.ServerWebExchange exchange) {
        if (exchange.getRequest().getRemoteAddress() == null || exchange.getRequest().getRemoteAddress().getAddress() == null) {
            return "unknown";
        }
        String remoteAddr = IpUtils.normalizeIpAddress(exchange.getRequest().getRemoteAddress().getAddress().getHostAddress());
        if (!IpUtils.isTrustedProxy(remoteAddr)) {
            return remoteAddr;
        }

        HttpHeaders headers = exchange.getRequest().getHeaders();
        String forwardedIp = firstValidIp(
            headers.getFirst("X-Forwarded-For"),
            headers.getFirst("X-Real-IP")
        );
        return StringUtils.hasText(forwardedIp) ? IpUtils.normalizeIpAddress(forwardedIp) : remoteAddr;
    }

    private String firstValidIp(String... candidates) {
        for (String candidate : candidates) {
            if (!StringUtils.hasText(candidate)) {
                continue;
            }
            if (candidate.contains(",")) {
                for (String value : candidate.split(",")) {
                    String ip = value.trim();
                    if (StringUtils.hasText(ip) && !"unknown".equalsIgnoreCase(ip)) {
                        return ip;
                    }
                }
                continue;
            }
            if (!"unknown".equalsIgnoreCase(candidate.trim())) {
                return candidate.trim();
            }
        }
        return null;
    }
}
