package com.cloudflow.hr.client.fallback;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.client.vo.ProcessInstanceVO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Workflow服务降级处理
 * 当Workflow服务不可用时，返回降级响应
 *
 * @author CloudFlow
 * @since 1.0.0
 */
@Slf4j
@Component
public class WorkflowServiceFallback implements WorkflowServiceClient {
    
    @Override
    public R<String> startProcess(ProcessStartDTO dto) {
        log.error("Workflow服务调用失败：启动流程失败，业务类型={}，业务ID={}", 
            dto.getBusinessType(), dto.getBusinessId());
        return R.fail("工作流服务暂时不可用，无法启动审批流程，请稍后重试");
    }
    
    @Override
    public R<ProcessInstanceVO> getProcessInstance(String processInstanceId) {
        log.error("Workflow服务调用失败：查询流程实例失败，流程实例ID={}", processInstanceId);
        return R.fail("工作流服务暂时不可用，无法查询流程状态");
    }
    
    @Override
    public R<Void> cancelProcess(String processInstanceId) {
        log.error("Workflow服务调用失败：撤销流程失败，流程实例ID={}", processInstanceId);
        return R.fail("工作流服务暂时不可用，无法撤销流程，请稍后重试");
    }
}
