package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.service.IWorkflowService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * 工作流服务实现
 * 通过 Feign 远程调用工作流微服务
 */
@Slf4j
@Service
public class WorkflowServiceImpl implements IWorkflowService {

    @Autowired
    private RemoteWorkflowService remoteWorkflowService;

    @Override
    public R<?> startProcess(String processDefinitionKey, String businessKey, Map<String, Object> variables) {
        try {
            String processInstanceId = remoteWorkflowService.startProcess(processDefinitionKey, businessKey, variables);
            log.info("工作流启动成功，流程定义Key: {}, 业务Key: {}, 实例ID: {}", 
                processDefinitionKey, businessKey, processInstanceId);
            return R.ok(processInstanceId);
        } catch (Exception e) {
            log.error("工作流启动失败，流程定义Key: {}, 业务Key: {}", processDefinitionKey, businessKey, e);
            return R.fail("工作流启动失败: " + e.getMessage());
        }
    }

    @Override
    public R<?> completeTask(String taskId, Map<String, Object> variables) {
        try {
            remoteWorkflowService.completeTask(taskId, variables);
            log.info("任务完成成功，任务ID: {}", taskId);
            return R.ok();
        } catch (Exception e) {
            log.error("任务完成失败，任务ID: {}", taskId, e);
            return R.fail("任务完成失败: " + e.getMessage());
        }
    }

    @Override
    public R<String> getProcessStatus(String processInstanceId) {
        try {
            String status = remoteWorkflowService.getProcessStatus(processInstanceId);
            return R.ok(status);
        } catch (Exception e) {
            log.error("查询流程状态失败，实例ID: {}", processInstanceId, e);
            return R.fail("查询流程状态失败: " + e.getMessage());
        }
    }
}
