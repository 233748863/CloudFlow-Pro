package com.cloudflow.auth.im;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.im.ImTaskTodos;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "cloudflow-service-workflow", contextId = "imTodoStatus", path = "/inner/workflow/im-todo",
        configuration = ImCallbackWorkflowConfiguration.class)
public interface ImTodoStatusClient {
    @PostMapping("/status")
    R<ImTaskTodos.Status> status(@RequestBody ImTaskTodos.Request request);
}
