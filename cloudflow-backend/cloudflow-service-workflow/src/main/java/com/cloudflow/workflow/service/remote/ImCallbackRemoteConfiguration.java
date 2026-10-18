package com.cloudflow.workflow.service.remote;

import com.cloudflow.common.core.exception.ServiceException;
import feign.Feign;
import feign.Request;
import feign.Retryer;
import java.util.concurrent.TimeUnit;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Scope;

public class ImCallbackRemoteConfiguration {
    @Bean
    @Scope("prototype")
    public Feign.Builder imCallbackVerifierBuilder() {
        return Feign.builder().options(new Request.Options(3000, TimeUnit.MILLISECONDS, 3000, TimeUnit.MILLISECONDS, false))
                .retryer(Retryer.NEVER_RETRY).errorDecoder((method, response) -> new ServiceException("企业通信审批身份核验失败",
                        response.status() == 403 || response.status() == 409 ? response.status() : 503));
    }
}
