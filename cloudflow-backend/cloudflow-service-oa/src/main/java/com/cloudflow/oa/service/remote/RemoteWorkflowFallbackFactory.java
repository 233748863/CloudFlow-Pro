package com.cloudflow.oa.service.remote;

import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

/**
 * 远程工作流服务降级处理
 * 
 * @author CloudFlow
 */
@Slf4j
@Component
public class RemoteWorkflowFallbackFactory implements FallbackFactory<RemoteWorkflowService> {
    
    @Override
    public RemoteWorkflowService create(Throwable cause) {
        log.error("工作流服务调用失败: {}", cause.getMessage());
        
        return new RemoteWorkflowService() {
            @Override
            public String startProcess(String processDefinitionKey, String businessKey, Object variables) {
                log.error("启动工作流失败，流程定义Key: {}, 业务Key: {}", processDefinitionKey, businessKey);
                throw new RuntimeException("工作流服务暂时不可用，请稍后重试");
            }
            
            @Override
            public void completeTask(String taskId, Object variables) {
                log.error("完成任务失败，任务ID: {}", taskId);
                throw new RuntimeException("工作流服务暂时不可用，请稍后重试");
            }
            
            @Override
            public String getProcessStatus(String processInstanceId) {
                log.error("查询流程状态失败，流程实例ID: {}", processInstanceId);
                return "UNKNOWN";
            }
        };
    }
}
