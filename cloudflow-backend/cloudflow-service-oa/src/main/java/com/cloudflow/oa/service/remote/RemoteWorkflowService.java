package com.cloudflow.oa.service.remote;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

/**
 * 远程调用工作流服务
 * 
 * @author CloudFlow
 */
@FeignClient(
    name = "cloudflow-workflow",
    fallbackFactory = RemoteWorkflowFallbackFactory.class
)
public interface RemoteWorkflowService {
    
    /**
     * 启动工作流实例
     * 
     * @param processDefinitionKey 流程定义Key
     * @param businessKey 业务Key
     * @param variables 流程变量
     * @return 流程实例ID
     */
    @PostMapping("/workflow/process/start")
    String startProcess(
        @RequestParam("processDefinitionKey") String processDefinitionKey,
        @RequestParam("businessKey") String businessKey,
        @RequestBody Object variables
    );
    
    /**
     * 完成任务
     * 
     * @param taskId 任务ID
     * @param variables 任务变量
     */
    @PostMapping("/workflow/task/complete/{taskId}")
    void completeTask(
        @PathVariable("taskId") String taskId,
        @RequestBody Object variables
    );
    
    /**
     * 查询流程实例状态
     * 
     * @param processInstanceId 流程实例ID
     * @return 流程状态
     */
    @GetMapping("/workflow/process/status/{processInstanceId}")
    String getProcessStatus(@PathVariable("processInstanceId") String processInstanceId);
}
