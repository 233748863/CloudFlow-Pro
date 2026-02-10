package com.cloudflow.workflow.service;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;

import java.util.Map;
import java.util.List;

public interface IWorkflowService {

    /**
     * 发起流程
     *
     * @param processDefKey 流程定义Key
     * @param businessKey   业务主键
     * @param variables     流程变量
     * @return 结果
     */
    R<?> startProcess(String processDefKey, String businessKey, Map<String, Object> variables);

    /**
     * 完成任务
     *
     * @param taskId    任务ID
     * @param action    动作 (APPROVE/REJECT)
     * @param comment   审批意见
     * @param variables 流程变量
     * @return 结果
     */
    R<?> completeTask(String taskId, String action, String comment, Map<String, Object> variables);

    /**
     * 驳回任务到指定节点
     * @param taskId 任务ID
     * @param targetNodeKey 目标节点Key
     * @param comment 意见
     * @return 结果
     */
    R<?> rejectTask(String taskId, String targetNodeKey, String comment);

    /**
     * 撤回流程
     * @param instanceId 实例ID
     * @return 结果
     */
    R<?> recallProcess(String instanceId);

    /**
     * 查询待办任务 (分页)
     * @param userId 用户ID
     * @param pageQuery 分页参数
     * @return 任务列表
     */
    PageResult<WfTask> getTodoTasks(Long userId, PageQuery pageQuery);
    
    /**
     * 查询实例详情
     * @param instanceId 实例ID
     * @return 实例信息
     */
    WfProcessInstance getProcessInstance(String instanceId);

    /**
     * 获取流程追踪信息
     * @param instanceId 实例ID
     * @return 追踪信息 { finished: [], active: [] }
     */
    Map<String, Object> getProcessTrace(String instanceId);

    /**
     * 查询我的发起 (分页)
     * @param userId 用户ID
     * @param pageQuery 分页参数
     * @return 实例列表
     */
    PageResult<WfProcessInstance> getMyInstances(Long userId, PageQuery pageQuery);

    /**
     * 查询流程定义列表 (分页)
     * @param pageQuery 分页参数
     * @return 流程定义列表
     */
    PageResult<com.cloudflow.workflow.domain.WfProcessDefinition> listProcessDefinitions(PageQuery pageQuery);

    /**
     * 保存流程定义
     * @param definition 流程定义对象
     * @return 结果
     */
    R<?> saveProcessDefinition(com.cloudflow.workflow.domain.WfProcessDefinition definition);

    /**
     * 发布流程定义
     * @param definitionId 流程定义ID
     * @return 结果
     */
    R<?> deployProcessDefinition(String definitionId);

    /**
     * 查询表单定义
     * @param formId 表单ID
     * @return 表单定义
     */
    com.cloudflow.workflow.domain.WfFormDefinition getFormDefinition(String formId);

    /**
     * 查询所有表单定义 (分页)
     * @param pageQuery 分页参数
     * @return 表单定义列表
     */
    PageResult<com.cloudflow.workflow.domain.WfFormDefinition> listFormDefinitions(PageQuery pageQuery);

    /**
     * 保存表单定义
     * @param definition 表单定义对象
     * @return 结果
     */
    R<?> saveFormDefinition(com.cloudflow.workflow.domain.WfFormDefinition definition);

    /**
     * Mark task as read
     */
    void readTask(String taskId, Long userId);

    /**
     * Urge task
     */
    R<?> urgeTask(String taskId, String reason);

    /**
     * 获取用户任务统计数量
     * @param userId 用户ID
     * @return 包含 todoCount, doneCount, myInstanceCount 等统计信息
     */
    Map<String, Integer> getTasksCount(Long userId);
}
