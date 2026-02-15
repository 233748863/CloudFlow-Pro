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
     * @param taskId         任务ID
     * @param action         动作 (APPROVE/REJECT/DELEGATE)
     * @param comment        审批意见
     * @param variables      流程变量
     * @param delegateUserId 转办目标用户ID（action=DELEGATE 时必填）
     * @return 结果
     */
    R<?> completeTask(String taskId, String action, String comment, Map<String, Object> variables, String delegateUserId);

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
     * 暂停流程
     * @param instanceId 实例ID
     * @return 结果
     */
    R<?> pauseProcess(String instanceId);

    /**
     * 恢复流程
     * @param instanceId 实例ID
     * @return 结果
     */
    R<?> resumeProcess(String instanceId);

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
     * 查询流程定义详情
     * @param definitionId 流程定义ID
     * @return 流程定义
     */
    com.cloudflow.workflow.domain.WfProcessDefinition getProcessDefinition(String definitionId);

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

    /**
     * 删除流程定义
     * @param definitionId 流程定义ID
     * @return 结果
     */
    R<?> deleteProcessDefinition(String definitionId);

    /**
     * 获取任务统计详情
     * 包括按时间段、状态、流程类型、处理人的统计，以及平均处理时长和完成率
     * @param userId 用户ID（可选，为空则统计所有用户）
     * @param startTime 开始时间（可选）
     * @param endTime 结束时间（可选）
     * @return 统计详情
     */
    Map<String, Object> getTaskStatistics(Long userId, java.time.LocalDateTime startTime, java.time.LocalDateTime endTime);

    /**
     * 获取任务分组信息
     * 按流程类型、状态、优先级、处理人等维度分组
     * @param userId 用户ID（可选，为空则统计所有用户）
     * @return 分组信息
     */
    Map<String, Object> getTaskGroups(Long userId);

    /**
     * 定时节点到期后继续流转
     * 由 TimerScanJob 调用，根据 instanceId 和 nodeKey 找到定时节点，
     * 然后通过 advanceAfterNode 继续执行后续节点（支持 branches 和 next）。
     *
     * @param instanceId 流程实例ID
     * @param nodeKey    定时节点Key
     * @param variables  定时任务中保存的流程变量（会与实例变量合并）
     */
    void continueFromTimerNode(String instanceId, String nodeKey, Map<String, Object> variables);
}
