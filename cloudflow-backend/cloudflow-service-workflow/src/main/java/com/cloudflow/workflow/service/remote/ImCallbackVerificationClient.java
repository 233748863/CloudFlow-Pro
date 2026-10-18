package com.cloudflow.workflow.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.im.ImTaskCallbacks;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "cloudflow-auth", contextId = "workflowImCallbackVerifier", path = "/inner/auth/im-callback",
        configuration = ImCallbackRemoteConfiguration.class)
public interface ImCallbackVerificationClient {
    @PostMapping("/verify")
    R<ImTaskCallbacks.Actor> verify(@RequestBody ImTaskCallbacks.Request request);
}
