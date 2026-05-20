package com.cloudflow.gateway.filter;

import com.cloudflow.common.core.constant.SecurityConstants;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

/**
 * WebFlux 租户过滤器 - 用于 Gateway
 * 从请求头中提取租户ID并传递给下游服务
 * 
 * @author CloudFlow
 */
@Slf4j
@Component
public class TenantWebFilter implements WebFilter, Ordered {

    /** 默认租户ID，从配置文件读取，未配置时使用 100000 */
    @Value("${cloudflow.tenant.default-tenant-id:100000}")
    private String defaultTenantId;
    
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String resolvedTenantId = exchange.getRequest().getHeaders().getFirst(SecurityConstants.TENANT_ID_HEADER);
        if (!StringUtils.hasText(resolvedTenantId)) {
            resolvedTenantId = defaultTenantId;
            log.debug("未找到租户ID，使用默认值: {}", resolvedTenantId);
        } else {
            log.debug("从请求头获取租户ID: {}", resolvedTenantId);
        }

        final String tenantId = resolvedTenantId;
        ServerHttpRequest request = exchange.getRequest().mutate()
                .headers(headers -> headers.set(SecurityConstants.TENANT_ID_HEADER, tenantId))
                .build();
        return chain.filter(exchange.mutate().request(request).build())
                .contextWrite(ctx -> ctx.put("tenantId", tenantId));
    }
    
    @Override
    public int getOrder() {
        // 设置较高优先级，确保在其他过滤器之前执行
        return Ordered.HIGHEST_PRECEDENCE + 100;
    }
}
