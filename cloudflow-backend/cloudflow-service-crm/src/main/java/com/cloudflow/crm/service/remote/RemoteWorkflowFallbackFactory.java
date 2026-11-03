package com.cloudflow.crm.service.remote;

import com.cloudflow.common.core.domain.ProcessStartResult;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.workflow.WorkflowFallbackRetryPublisher;
import com.cloudflow.crm.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.crm.domain.dto.WorkflowProcessStartDTO;
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
        log.error("CRM 调用工作流服务失败: {}", cause.getMessage());
        return new RemoteWorkflowService() {
            @Override
            public R<ProcessStartResult> startProcess(WorkflowProcessStartDTO req) {
                log.error("CRM 启动工作流失败，请求参数: {}", req);
                retryPublisher.publish("cloudflow-crm", "startProcess", req, cause);
                return R.fail("workflow service unavailable, retry submitted to outbox");
            }

            @Override
            public R<ProcessStartResult> startProcessInternal(InternalWorkflowStartDTO req) {
                log.error("CRM 内部启动工作流失败，请求参数: {}", req);
                retryPublisher.publish("cloudflow-crm", "startProcessInternal", req, cause);
                return R.fail("workflow service unavailable, retry submitted to outbox");
            }
        };
    }

}
