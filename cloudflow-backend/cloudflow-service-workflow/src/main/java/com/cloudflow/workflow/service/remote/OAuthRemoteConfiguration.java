package com.cloudflow.workflow.service.remote;

import com.cloudflow.common.security.oauth2.OAuthFailure;
import feign.Feign;
import feign.Request;
import feign.Retryer;
import java.util.concurrent.TimeUnit;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Scope;

public class OAuthRemoteConfiguration {
    @Bean
    @Scope("prototype")
    public Feign.Builder oauthReadBuilder() {
        return Feign.builder().options(new Request.Options(3000, TimeUnit.MILLISECONDS, 3000, TimeUnit.MILLISECONDS, false))
                .retryer(Retryer.NEVER_RETRY).errorDecoder((method, response) -> response.status() == 401 ? OAuthFailure.unauthenticated()
                        : response.status() == 403 ? OAuthFailure.forbidden()
                        : new OAuthFailure("temporarily_unavailable", "第三方授权核验暂不可用", 503));
    }
}
