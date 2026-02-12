package com.cloudflow.gateway.filter;

import lombok.extern.slf4j.Slf4j;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;
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
    
    private static final String TENANT_HEADER = "X-Tenant-Id";
    
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        // 从请求头获取租户ID
        String tenantId = exchange.getRequest().getHeaders().getFirst(TENANT_HEADER);
        
        if (tenantId != null && !tenantId.isEmpty()) {
            log.debug("从请求头获取租户ID: {}", tenantId);
            // 将租户ID添加到响应式上下文中，供下游使用
            return chain.filter(exchange)
                .contextWrite(ctx -> ctx.put("tenantId", tenantId));
        } else {
            // 使用默认租户ID
            log.debug("未找到租户ID，使用默认值: 100000");
            return chain.filter(exchange)
                .contextWrite(ctx -> ctx.put("tenantId", "100000"));
        }
    }
    
    @Override
    public int getOrder() {
        // 设置较高优先级，确保在其他过滤器之前执行
        return Ordered.HIGHEST_PRECEDENCE + 100;
    }
}
