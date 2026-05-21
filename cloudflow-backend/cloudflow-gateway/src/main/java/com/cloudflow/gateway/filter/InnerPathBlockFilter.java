package com.cloudflow.gateway.filter;

import com.cloudflow.common.core.constant.SecurityConstants;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;

/**
 * /inner/** 路径全局拦截与内部调用头剥离
 *
 * 双重防线说明：
 * 1) 任何到达网关的 /inner/** 请求一律 403（合法的服务间调用走 Feign + LoadBalancer 直连服务实例，不经过网关）
 * 2) 对所有其他请求统一剥离 X-Inner-Call / X-From-Service 头，防止外部攻击者伪造内部调用绕过 @Inner 切面
 *
 * 本过滤器顺序 -200，先于 AuthFilter (-100) 执行；AuthFilter 的 mutate 阶段对鉴权通过的请求做第二道剥离。
 *
 * @author CloudFlow
 */
@Component
public class InnerPathBlockFilter implements GlobalFilter, Ordered {

    private static final String INNER_PATH_PREFIX = "/inner/";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getURI().getPath();

        if (path != null && path.startsWith(INNER_PATH_PREFIX)) {
            return forbidden(exchange);
        }

        boolean carriesInnerHeader = request.getHeaders().containsKey(SecurityConstants.INNER_CALL_HEADER)
                || request.getHeaders().containsKey(SecurityConstants.FROM_SERVICE_HEADER);
        if (!carriesInnerHeader) {
            return chain.filter(exchange);
        }

        ServerHttpRequest sanitized = request.mutate()
                .headers(headers -> {
                    headers.remove(SecurityConstants.INNER_CALL_HEADER);
                    headers.remove(SecurityConstants.FROM_SERVICE_HEADER);
                })
                .build();
        return chain.filter(exchange.mutate().request(sanitized).build());
    }

    private Mono<Void> forbidden(ServerWebExchange exchange) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.FORBIDDEN);
        response.getHeaders().setContentType(new MediaType("application", "json", StandardCharsets.UTF_8));
        String body = "{\"code\":403,\"msg\":\"内部路径禁止外部访问\"}";
        DataBuffer buffer = response.bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8));
        return response.writeWith(Mono.just(buffer));
    }

    @Override
    public int getOrder() {
        return -200;
    }
}
