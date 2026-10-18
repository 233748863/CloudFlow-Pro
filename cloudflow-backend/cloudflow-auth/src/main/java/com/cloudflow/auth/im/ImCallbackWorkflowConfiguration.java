package com.cloudflow.auth.im;

import feign.Feign;
import feign.Request;
import feign.Retryer;
import java.util.concurrent.TimeUnit;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Scope;

public class ImCallbackWorkflowConfiguration {
    @Bean
    @Scope("prototype")
    public Feign.Builder imCallbackWorkflowBuilder() {
        return Feign.builder().options(new Request.Options(3000, TimeUnit.MILLISECONDS, 15000, TimeUnit.MILLISECONDS, false))
                .retryer(Retryer.NEVER_RETRY).errorDecoder((method, response) -> ImFailure.callbackUnavailable());
    }
}
