package com.cloudflow.oa.service;

import com.cloudflow.common.core.domain.R;

import java.util.Map;

/**
 * 工作流服务接口
 * OA模块本地工作流服务抽象，通过远程调用工作流微服务实现
 */
public interface IWorkflowService {

    /**
     * 启动工作流实例
     *
     * @param processDefinitionKey 流程定义Key
     * @param businessKey          业务Key
     * @param variables            流程变量
     * @return 结果
     */
    R<?> startProcess(String processDefinitionKey, String businessKey, Map<String, Object> variables);

    R<?> startProcess(String processDefinitionKey, String businessKey, Long startUserId,
                      String startUserName, Map<String, Object> variables);

    /**
     * 完成任务
     *
     * @param taskId    任务ID
     * @param variables 任务变量
     * @return 结果
     */
    R<?> completeTask(String taskId, Map<String, Object> variables);

    /**
     * 查询流程实例状态
     *
     * @param processInstanceId 流程实例ID
     * @return 流程状态
     */
    R<String> getProcessStatus(String processInstanceId);
}
