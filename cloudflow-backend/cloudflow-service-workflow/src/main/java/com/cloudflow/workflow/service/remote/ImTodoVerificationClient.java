package com.cloudflow.workflow.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.im.ImTaskTodos;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "cloudflow-auth", contextId = "workflowImTodoVerifier", path = "/inner/auth/im-todo",
        configuration = ImCallbackRemoteConfiguration.class)
public interface ImTodoVerificationClient {
    @PostMapping("/verify")
    R<ImTaskTodos.Actor> verify(@RequestBody ImTaskTodos.Request request);
}
