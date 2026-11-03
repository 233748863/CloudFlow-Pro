package com.cloudflow.auth.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.domain.ProcessStartResult;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(
        name = "cloudflow-service-workflow",
        contextId = "authRemoteWorkflowService",
        fallbackFactory = RemoteWorkflowFallbackFactory.class
)
public interface RemoteWorkflowService {

    @PostMapping("/inner/workflow/process/start")
    R<ProcessStartResult> startProcessInternal(@RequestBody InternalWorkflowStartDTO req);
}
