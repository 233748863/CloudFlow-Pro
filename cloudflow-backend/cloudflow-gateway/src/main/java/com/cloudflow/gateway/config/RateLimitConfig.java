package com.cloudflow.gateway.config;

import cn.dev33.satoken.stp.StpUtil;
import org.springframework.cloud.gateway.filter.ratelimit.KeyResolver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
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
        return exchange.getRequest().getRemoteAddress().getAddress().getHostAddress();
    }
}
