package com.cloudflow.crm.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.crm.domain.dto.WorkflowProcessStartDTO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class RemoteWorkflowFallbackFactory implements FallbackFactory<RemoteWorkflowService> {

    @Override
    public RemoteWorkflowService create(Throwable cause) {
        log.error("CRM 调用工作流服务失败: {}", cause.getMessage());
        return new RemoteWorkflowService() {
            @Override
            public R<?> startProcess(WorkflowProcessStartDTO req) {
                log.error("CRM 启动工作流失败，请求参数: {}", req);
                return R.fail("工作流服务暂时不可用，请稍后重试");
            }

            @Override
            public R<?> startProcessInternal(InternalWorkflowStartDTO req) {
                log.error("CRM 内部启动工作流失败，请求参数: {}", req);
                return R.fail("工作流服务暂时不可用，请稍后重试");
            }
        };
    }
}
