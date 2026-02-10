package com.cloudflow.gateway.handler;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.reactive.error.ErrorWebExceptionHandler;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.buffer.DataBufferFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.HashMap;
import java.util.Map;

/**
 * Gateway 全局异常处理器（Reactive）
 * 基于 WebFlux 的 ErrorWebExceptionHandler，适用于响应式网关环境
 */
@Component
@Order(-1) // 优先级高于默认的 DefaultErrorWebExceptionHandler
public class GatewayExceptionHandler implements ErrorWebExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GatewayExceptionHandler.class);

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public Mono<Void> handle(ServerWebExchange exchange, Throwable ex) {
        ServerHttpResponse response = exchange.getResponse();

        if (response.isCommitted()) {
            return Mono.error(ex);
        }

        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);

        int code;
        String message;

        if (ex instanceof ResponseStatusException responseStatusException) {
            HttpStatus status = HttpStatus.resolve(responseStatusException.getStatusCode().value());
            code = status != null ? status.value() : 500;
            message = getResponseStatusMessage(code, responseStatusException.getReason());
        } else {
            code = HttpStatus.INTERNAL_SERVER_ERROR.value();
            message = "网关内部错误";
        }

        response.setStatusCode(HttpStatus.resolve(code) != null ? HttpStatus.resolve(code) : HttpStatus.INTERNAL_SERVER_ERROR);

        log.error("[网关异常处理] 请求路径: {}, 异常信息: {}", exchange.getRequest().getPath(), ex.getMessage(), ex);

        return response.writeWith(Mono.fromSupplier(() -> {
            DataBufferFactory bufferFactory = response.bufferFactory();
            try {
                Map<String, Object> result = new HashMap<>();
                result.put("code", code);
                result.put("msg", message);
                result.put("data", null);
                return bufferFactory.wrap(objectMapper.writeValueAsBytes(result));
            } catch (JsonProcessingException e) {
                log.error("序列化异常响应失败", e);
                String fallback = "{\"code\":500,\"msg\":\"系统异常\",\"data\":null}";
                return bufferFactory.wrap(fallback.getBytes());
            }
        }));
    }

    /**
     * 根据 HTTP 状态码返回友好的错误信息
     */
    private String getResponseStatusMessage(int code, String defaultReason) {
        return switch (code) {
            case 400 -> "错误的请求";
            case 401 -> "未授权，请先登录";
            case 403 -> "禁止访问";
            case 404 -> "请求的资源不存在";
            case 429 -> "请求过于频繁，请稍后再试";
            case 502 -> "网关错误，后端服务不可用";
            case 503 -> "服务暂时不可用";
            case 504 -> "网关超时";
            default -> defaultReason != null ? defaultReason : "网关异常";
        };
    }
}
