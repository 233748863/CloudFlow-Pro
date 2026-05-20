package com.cloudflow.crm.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.domain.dto.WorkflowProcessStartDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(
        name = "cloudflow-service-workflow",
        fallbackFactory = RemoteWorkflowFallbackFactory.class
)
public interface RemoteWorkflowService {

    @PostMapping("/wf/start")
    R<?> startProcess(@RequestBody WorkflowProcessStartDTO req);
}
