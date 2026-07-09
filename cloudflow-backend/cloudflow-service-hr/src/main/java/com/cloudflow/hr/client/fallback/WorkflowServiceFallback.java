package com.cloudflow.hr.client.fallback;

import com.cloudflow.common.core.domain.ProcessFallbackResponse;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.workflow.WorkflowFallbackRetryPublisher;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.WorkflowInvalidateRequest;
import com.cloudflow.hr.client.dto.WorkflowStartRequest;
import com.cloudflow.hr.client.vo.ProcessInstanceVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Workflow 服务降级处理
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WorkflowServiceFallback implements WorkflowServiceClient {

    private final WorkflowFallbackRetryPublisher retryPublisher;

    @Override
    @SuppressWarnings({"rawtypes", "unchecked"})
    public R<Map<String, String>> startProcessInternal(WorkflowStartRequest request) {
        log.error("Workflow 服务调用失败: 启动流程失败, processDefKey={}, businessKey={}",
                request != null ? request.getProcessDefKey() : null,
                request != null ? request.getBusinessKey() : null);
        retryPublisher.publish("cloudflow-hr", "startProcessInternal", request, null);
        R response = R.fail("workflow service unavailable, retry submitted to outbox");
        response.setData(ProcessFallbackResponse.retry(
                "workflow service unavailable",
                request != null ? request.getProcessDefKey() : null,
                request != null ? request.getBusinessKey() : null));
        return response;
    }

    @Override
    public R<ProcessInstanceVO> getProcessInstance(String processInstanceId) {
        log.error("Workflow 服务调用失败: 查询流程实例失败, processInstanceId={}", processInstanceId);
        return R.fail("工作流服务暂时不可用，无法查询流程状态");
    }

    @Override
    public R<?> invalidateProcess(WorkflowInvalidateRequest request) {
        log.error("Workflow 服务调用失败: 作废流程失败, processInstanceId={}", request != null ? request.getProcessInstanceId() : null);
        return R.fail("工作流服务暂时不可用，无法撤销流程，请稍后重试");
    }
}
