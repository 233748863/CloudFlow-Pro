package com.cloudflow.common.security.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.actuate.autoconfigure.web.ManagementContextConfiguration;
import org.springframework.boot.actuate.autoconfigure.web.ManagementContextType;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

@ManagementContextConfiguration(value = ManagementContextType.CHILD)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@ConditionalOnProperty(prefix = "cloudflow.security.prometheus", name = "enabled", havingValue = "true")
@EnableConfigurationProperties(PrometheusScrapeProperties.class)
public class PrometheusManagementServletConfiguration {

    @Bean
    public FilterRegistrationBean<OncePerRequestFilter> prometheusMetricsAuthFilterRegistration(
            PrometheusScrapeProperties properties) {
        validate(properties);
        String expectedAuthorization = buildExpectedAuthorization(properties);
        FilterRegistrationBean<OncePerRequestFilter> registration = new FilterRegistrationBean<>();
        registration.setName("prometheusMetricsAuthFilter");
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        registration.addUrlPatterns("/actuator/prometheus");
        registration.setFilter(new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(HttpServletRequest request,
                                            HttpServletResponse response,
                                            FilterChain filterChain) throws ServletException, IOException {
                String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
                if (expectedAuthorization.equals(authorization)) {
                    filterChain.doFilter(request, response);
                    return;
                }
                writeUnauthorized(response, properties.getRealm());
            }
        });
        return registration;
    }

    private void validate(PrometheusScrapeProperties properties) {
        if (!StringUtils.hasText(properties.getUsername()) || !StringUtils.hasText(properties.getPassword())) {
            throw new IllegalStateException("cloudflow.security.prometheus 已启用，但 username/password 未配置完整");
        }
    }

    private String buildExpectedAuthorization(PrometheusScrapeProperties properties) {
        String credentials = properties.getUsername() + ":" + properties.getPassword();
        String encoded = Base64.getEncoder().encodeToString(credentials.getBytes(StandardCharsets.UTF_8));
        return "Basic " + encoded;
    }

    private void writeUnauthorized(HttpServletResponse response, String realm) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Basic realm=\"" + realm + "\"");
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"code\":401,\"msg\":\"prometheus scrape unauthorized\"}");
    }
}
