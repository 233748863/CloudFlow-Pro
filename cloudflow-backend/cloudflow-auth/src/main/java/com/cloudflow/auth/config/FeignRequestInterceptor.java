package com.cloudflow.auth.config;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.context.UserContext;
import feign.RequestInterceptor;
import feign.RequestTemplate;
import java.util.concurrent.ExecutorService;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.cloud.circuitbreaker.resilience4j.Resilience4JCircuitBreakerFactory;
import org.springframework.cloud.client.circuitbreaker.Customizer;
import org.springframework.context.annotation.Bean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * Auth Feign 请求拦截器。
 * 统一透传内部调用头、租户和当前登录态，供 HR / OA 等内部接口校验来源服务。
 */
@Component
public class FeignRequestInterceptor implements RequestInterceptor {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String AUTHORIZATION_HEADER = "Authorization";

    private final String applicationName;

    public FeignRequestInterceptor(@Value("${spring.application.name}") String applicationName) {
        this.applicationName = applicationName;
    }

    @Bean
    public Customizer<Resilience4JCircuitBreakerFactory> feignCircuitBreakerContext(
            @Qualifier("feignContextExecutor") ExecutorService executor) {
        return factory -> factory.configureExecutorService(executor);
    }

    @Override
    public void apply(RequestTemplate template) {
        template.removeHeader(com.cloudflow.common.core.context.TraceContext.HEADER);
        template.header(com.cloudflow.common.core.context.TraceContext.HEADER, com.cloudflow.common.core.context.TraceContext.currentOrCreate());
        template.header(SecurityConstants.INNER_CALL_HEADER, SecurityConstants.INNER_CALL_VALUE);
        template.header(SecurityConstants.FROM_SERVICE_HEADER, applicationName);

        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            template.header(SecurityConstants.TENANT_ID_HEADER, String.valueOf(tenantId));
        }

        if (template.path().equals("/inner/workflow/im-callback/complete") || template.path().equals("/inner/workflow/im-todo/project")
                || template.path().equals("/inner/workflow/im-todo/scan") || template.path().equals("/inner/workflow/im-todo/status")) {
            template.removeHeader(AUTHORIZATION_HEADER);
            template.removeHeader("Cookie");
            template.removeHeader(USER_ID_HEADER);
            return;
        }

        Long userId = UserContext.getUserId();
        if (userId != null) {
            template.header(USER_ID_HEADER, String.valueOf(userId));
        }
        String token = UserContext.getAuthToken();
        if (StringUtils.hasText(token)) {
            template.header(AUTHORIZATION_HEADER, "Bearer " + token);
        }
    }
}
