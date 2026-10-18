package com.cloudflow.common.log.web;

import com.cloudflow.common.log.config.CloudFlowLogProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import java.util.List;

@Configuration
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(prefix = "cloudflow.log", name = "enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@Import(ApiResultCodeAdvice.class)
public class ApiLogWebConfiguration implements WebMvcConfigurer {
    private final ApplicationEventPublisher publisher;
    private final CloudFlowLogProperties properties;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new ApiAccessLogInterceptor(publisher, properties)).order(100)
                .excludePathPatterns("/actuator/**", "/inner/auth/observability/**");
    }

    @Override
    public void extendHandlerExceptionResolvers(List<HandlerExceptionResolver> resolvers) {
        resolvers.add(0, new ApiErrorLogResolver(publisher));
    }
}
