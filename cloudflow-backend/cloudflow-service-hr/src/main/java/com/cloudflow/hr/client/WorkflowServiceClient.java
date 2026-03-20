package com.cloudflow.hr.client;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.client.fallback.WorkflowServiceFallback;
import com.cloudflow.hr.client.vo.ProcessInstanceVO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

/**
 * Workflow服务Feign客户端
 * 用于调用工作流服务的流程管理接口
 *
 * @author CloudFlow
 * @since 1.0.0
 */
@FeignClient(
    name = "cloudflow-service-workflow",
    path = "/api/workflow",
    fallback = WorkflowServiceFallback.class
)
public interface WorkflowServiceClient {
    
    /**
     * 启动流程
     *
     * @param dto 流程启动DTO
     * @return 流程实例ID
     */
    @PostMapping("/process/start")
    R<String> startProcess(@RequestBody ProcessStartDTO dto);
    
    /**
     * 查询流程实例
     *
     * @param processInstanceId 流程实例ID
     * @return 流程实例信息
     */
    @GetMapping("/process/{processInstanceId}")
    R<ProcessInstanceVO> getProcessInstance(@PathVariable("processInstanceId") String processInstanceId);
    
    /**
     * 撤销流程
     *
     * @param processInstanceId 流程实例ID
     * @return 操作结果
     */
    @PostMapping("/process/{processInstanceId}/cancel")
    R<Void> cancelProcess(@PathVariable("processInstanceId") String processInstanceId);
}
