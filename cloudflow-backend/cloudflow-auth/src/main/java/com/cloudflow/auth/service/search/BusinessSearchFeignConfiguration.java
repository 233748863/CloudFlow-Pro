package com.cloudflow.auth.service.search;

import feign.Request;
import feign.Retryer;
import java.util.concurrent.TimeUnit;
import org.springframework.cloud.openfeign.FeignBuilderCustomizer;
import org.springframework.context.annotation.Bean;

public class BusinessSearchFeignConfiguration {
    @Bean
    public Request.Options businessSearchOptions() {
        return new Request.Options(2000, TimeUnit.MILLISECONDS, 2000, TimeUnit.MILLISECONDS, false);
    }

    @Bean
    public Retryer businessSearchRetryer() { return Retryer.NEVER_RETRY; }

    @Bean
    public FeignBuilderCustomizer businessSearchDeadline() {
        return builder -> builder.options(businessSearchOptions()).retryer(Retryer.NEVER_RETRY);
    }
}
