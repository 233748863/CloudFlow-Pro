package com.cloudflow.common.job.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.env.Environment;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;

@Configuration(proxyBeanMethods = false)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class JobInternalAuthenticationConfiguration {
    @Bean
    public JobRequestSignature jobRequestSignature(Environment environment) {
        Map<String, String> keys = new LinkedHashMap<>();
        for (String service : JobRequestSignature.SERVICES) {
            keys.put(service, environment.getProperty("cloudflow.job.internal-auth.keys." + service, ""));
        }
        return new JobRequestSignature(environment.getRequiredProperty("spring.application.name"), keys, Clock.systemUTC());
    }

    @Bean
    public FilterRegistrationBean<JobInternalAuthenticationFilter> jobInternalAuthenticationFilter(
            JobRequestSignature signature, StringRedisTemplate redis, ObjectMapper json) {
        FilterRegistrationBean<JobInternalAuthenticationFilter> registration = new FilterRegistrationBean<>(
                new JobInternalAuthenticationFilter(signature, redis, json));
        registration.setName("jobInternalAuthenticationFilter");
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 5);
        registration.addUrlPatterns("/*");
        return registration;
    }
}
