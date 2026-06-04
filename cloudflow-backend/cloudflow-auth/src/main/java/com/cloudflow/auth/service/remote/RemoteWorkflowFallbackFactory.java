package com.cloudflow.auth.service.remote;

import com.cloudflow.common.core.domain.R;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class RemoteWorkflowFallbackFactory implements FallbackFactory<RemoteWorkflowService> {

    @Override
    public RemoteWorkflowService create(Throwable cause) {
        return req -> {
            log.error("启动字典审批工作流失败, request={}", req, cause);
            return R.fail("工作流服务暂时不可用，请稍后重试");
        };
    }
}
