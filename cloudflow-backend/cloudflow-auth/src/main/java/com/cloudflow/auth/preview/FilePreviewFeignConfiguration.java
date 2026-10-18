package com.cloudflow.auth.preview;

import feign.Logger;
import feign.Request;
import feign.Retryer;
import java.util.concurrent.TimeUnit;
import org.springframework.cloud.openfeign.FeignBuilderCustomizer;
import org.springframework.context.annotation.Bean;

public class FilePreviewFeignConfiguration {
    @Bean
    public FeignBuilderCustomizer filePreviewTransport() {
        return builder -> builder.options(new Request.Options(5000, TimeUnit.MILLISECONDS, 15000, TimeUnit.MILLISECONDS, false))
                .retryer(Retryer.NEVER_RETRY).logLevel(Logger.Level.NONE);
    }
}
