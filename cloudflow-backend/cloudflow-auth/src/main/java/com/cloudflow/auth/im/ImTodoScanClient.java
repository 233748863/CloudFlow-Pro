package com.cloudflow.auth.im;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.im.ImTaskTodos;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "cloudflow-service-workflow", contextId = "imTodoScan", path = "/inner/workflow/im-todo",
        configuration = ImCallbackWorkflowConfiguration.class)
public interface ImTodoScanClient {
    @PostMapping("/scan")
    R<ImTaskTodos.Page> scan(@RequestBody ImTaskTodos.Scan request);
}
