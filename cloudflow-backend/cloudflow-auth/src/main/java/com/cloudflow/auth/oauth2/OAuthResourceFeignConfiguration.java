package com.cloudflow.auth.oauth2;

import com.cloudflow.common.security.oauth2.OAuthFailure;
import feign.Feign;
import feign.Request;
import feign.Retryer;
import java.util.concurrent.TimeUnit;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Scope;

public class OAuthResourceFeignConfiguration {
    @Bean
    @Scope("prototype")
    public Feign.Builder oauthResourceBuilder() {
        return Feign.builder().options(new Request.Options(3000, TimeUnit.MILLISECONDS, 3000, TimeUnit.MILLISECONDS, false))
                .retryer(Retryer.NEVER_RETRY).errorDecoder((method, response) ->
                        response.status() == 401 ? OAuthFailure.unauthenticated()
                                : response.status() == 403 || response.status() == 404 ? OAuthFailure.forbidden()
                                : new OAuthFailure("temporarily_unavailable", "授权业务查询暂不可用", 503));
    }
}
