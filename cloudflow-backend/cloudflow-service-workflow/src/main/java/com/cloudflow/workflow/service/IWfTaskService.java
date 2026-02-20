package com.cloudflow.workflow.service;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfTask;

import java.util.Map;

/**
 * 任务操作服务接口
 * 负责任务的完成、驳回、转办、催办、已读等操作
 * 
 * 从 WorkflowServiceImpl 拆分而来，参考 RuoYi-Cloud-Plus IFlwTaskService 设计
 *
 * @author CloudFlow
 */
public interface IWfTaskService {

    /**
     * 完成任务（审批/拒绝/转办）
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
     *
     * @param taskId        任务ID
     * @param targetNodeKey 目标节点Key
     * @param comment       驳回意见（必填）
     * @return 结果
     */
    R<?> rejectTask(String taskId, String targetNodeKey, String comment);

    /**
     * 查询待办任务（分页）
     *
     * @param userId    用户ID
     * @param pageQuery 分页参数
     * @return 任务列表
     */
    PageResult<WfTask> getTodoTasks(Long userId, PageQuery pageQuery);

    /**
     * 标记任务为已读
     *
     * @param taskId 任务ID
     * @param userId 用户ID
     */
    void readTask(String taskId, Long userId);

    /**
     * 催办任务
     *
     * @param taskId 任务ID
     * @param reason 催办原因
     * @return 结果
     */
    R<?> urgeTask(String taskId, String reason);
}
