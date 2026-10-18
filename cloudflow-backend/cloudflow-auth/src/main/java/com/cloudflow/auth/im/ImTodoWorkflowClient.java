package com.cloudflow.auth.im;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.im.ImTaskTodos;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "cloudflow-service-workflow", contextId = "imTodoWorkflow", path = "/inner/workflow/im-todo",
        configuration = ImCallbackWorkflowConfiguration.class)
public interface ImTodoWorkflowClient {
    @PostMapping("/project")
    R<ImTaskTodos.Projection> project(@RequestBody ImTaskTodos.Request request);
}
