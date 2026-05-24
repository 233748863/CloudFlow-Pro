package com.cloudflow.gateway.config;

import com.cloudflow.common.core.constant.SecurityConstants;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * 给 TenantStatusChecker 用的负载均衡 WebClient。
 *
 * 通过 @LoadBalanced 让 WebClient 支持 lb://cloudflow-auth/... 形式的服务发现路由，
 * 默认头里固定带上 X-Inner-Call + X-From-Service=cloudflow-gateway，
 * 使得 auth 服务侧 @Inner(allowedServices=cloudflow-gateway) 校验通过。
 */
@Configuration
public class TenantStatusWebClientConfig {

    public static final String GATEWAY_SERVICE_NAME = "cloudflow-gateway";

    @Bean
    @LoadBalanced
    public WebClient.Builder tenantStatusWebClientBuilder() {
        return WebClient.builder()
                .defaultHeader(SecurityConstants.INNER_CALL_HEADER, SecurityConstants.INNER_CALL_VALUE)
                .defaultHeader(SecurityConstants.FROM_SERVICE_HEADER, GATEWAY_SERVICE_NAME);
    }
}
