package com.cloudflow.auth.service.report;

import feign.Request;
import feign.Retryer;
import java.util.concurrent.TimeUnit;
import org.springframework.cloud.openfeign.FeignBuilderCustomizer;
import org.springframework.context.annotation.Bean;

public class ReportFeignConfiguration {
    @Bean
    public Request.Options reportOptions() {
        return new Request.Options(1000, TimeUnit.MILLISECONDS, 6500, TimeUnit.MILLISECONDS, false);
    }

    @Bean
    public Retryer reportRetryer() { return Retryer.NEVER_RETRY; }

    @Bean
    public FeignBuilderCustomizer reportDeadline() {
        return builder -> builder.options(reportOptions()).retryer(Retryer.NEVER_RETRY);
    }
}
