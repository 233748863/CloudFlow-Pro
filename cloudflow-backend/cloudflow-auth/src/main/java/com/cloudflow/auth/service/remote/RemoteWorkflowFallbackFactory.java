package com.cloudflow.auth.service.remote;

import com.cloudflow.common.core.domain.ProcessFallbackResponse;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.workflow.WorkflowFallbackRetryPublisher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class RemoteWorkflowFallbackFactory implements FallbackFactory<RemoteWorkflowService> {

    private final WorkflowFallbackRetryPublisher retryPublisher;

    @Override
    public RemoteWorkflowService create(Throwable cause) {
        return req -> {
            log.error("启动字典审批工作流失败, request={}", req, cause);
            retryPublisher.publish("cloudflow-auth", "startProcessInternal", req, cause);
            R<ProcessFallbackResponse> response = R.fail("workflow service unavailable, retry submitted to outbox");
            response.setData(ProcessFallbackResponse.retry(
                    "workflow service unavailable",
                    req != null ? req.getProcessDefKey() : null,
                    req != null ? req.getBusinessKey() : null));
            return response;
        };
    }
}
