package com.cloudflow.auth.im;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.im.ImTaskCallbacks;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "cloudflow-service-workflow", contextId = "imCallbackWorkflow", path = "/inner/workflow/im-callback",
        configuration = ImCallbackWorkflowConfiguration.class)
public interface ImCallbackWorkflowClient {
    @PostMapping("/complete")
    R<ImTaskCallbacks.Outcome> complete(@RequestBody ImTaskCallbacks.Request request);
}
