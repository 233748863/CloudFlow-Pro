package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.vo.TaskDetailVO;
import com.cloudflow.workflow.domain.vo.ProcessInstanceVO;
import com.cloudflow.workflow.domain.vo.UserBriefVO;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 工作流批量查询服务接口
 * 用于优化批量数据查询性能，减少数据库查询次数
 * 
 * @author CloudFlow Team
 * @since 2026-02-21
 */
public interface IWorkflowBatchService {

    /**
     * 批量查询任务详情
     * 包含任务基本信息、审批人信息、候选人信息等
     * 
     * @param taskIds 任务ID列表
     * @return 任务详情列表
     */
    List<TaskDetailVO> batchGetTaskDetails(List<String> taskIds);

    /**
     * 批量查询流程实例
     * 包含流程实例基本信息、流程定义信息等
     * 
     * @param instanceIds 流程实例ID列表
     * @return 流程实例列表
     */
    List<ProcessInstanceVO> batchGetInstances(List<String> instanceIds);

    /**
     * 批量查询用户信息
     * 用于避免N+1查询问题
     * 
     * @param userIds 用户ID集合
     * @return 用户ID到用户信息的映射
     */
    Map<Long, UserBriefVO> batchGetUsers(Set<Long> userIds);

    /**
     * 批量查询任务的候选人
     * 
     * @param taskIds 任务ID列表
     * @return 任务ID到候选人列表的映射
     */
    Map<String, List<Long>> batchGetTaskCandidates(List<String> taskIds);

    /**
     * 批量查询任务的审批历史
     * 
     * @param instanceIds 流程实例ID列表
     * @return 实例ID到审批历史列表的映射
     */
    Map<String, List<TaskDetailVO>> batchGetTaskHistory(List<String> instanceIds);
}
