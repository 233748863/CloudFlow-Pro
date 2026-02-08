package com.cloudflow.workflow.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 工作流权限校验服务
 * 
 * P0修复：添加完整的权限控制
 * 
 * @author CloudFlow
 */
@Service
public class WorkflowPermissionService {

    private static final Logger log = LoggerFactory.getLogger(WorkflowPermissionService.class);

    /**
     * 校验当前用户是否有权限处理任务
     */
    public void checkTaskPermission(WfTask task) {
        Long currentUserId = UserContext.getUserId();
        if (currentUserId == null) {
            throw new PermissionDeniedException("用户未登录");
        }
        if (task.getAssignee() != null && !task.getAssignee().equals(currentUserId)) {
            // 检查是否是管理员
            if (!isAdmin(currentUserId)) {
                log.warn("用户 {} 尝试处理非自己的任务 {}", currentUserId, task.getTaskId());
                throw new PermissionDeniedException("无权处理此任务");
            }
        }
    }

    /**
     * 校验当前用户是否有权限撤回流程
     */
    public void checkRecallPermission(WfProcessInstance instance) {
        Long currentUserId = UserContext.getUserId();
        if (currentUserId == null) {
            throw new PermissionDeniedException("用户未登录");
        }
        if (!instance.getStartUserId().equals(currentUserId) && !isAdmin(currentUserId)) {
            log.warn("用户 {} 尝试撤回非自己发起的流程 {}", currentUserId, instance.getInstanceId());
            throw new PermissionDeniedException("非发起人无法撤回");
        }
    }

    /**
     * 校验当前用户是否有权限催办
     */
    public void checkUrgePermission(WfProcessInstance instance) {
        Long currentUserId = UserContext.getUserId();
        if (currentUserId == null) {
            throw new PermissionDeniedException("用户未登录");
        }
        if (!instance.getStartUserId().equals(currentUserId) && !isAdmin(currentUserId)) {
            throw new PermissionDeniedException("仅发起人或管理员可催办");
        }
    }

    /**
     * 校验当前用户是否有权限驳回任务
     */
    public void checkRejectPermission(WfTask task) {
        Long currentUserId = UserContext.getUserId();
        if (currentUserId == null) {
            throw new PermissionDeniedException("用户未登录");
        }
        if (task.getAssignee() != null && !task.getAssignee().equals(currentUserId)) {
            if (!isAdmin(currentUserId)) {
                throw new PermissionDeniedException("无权驳回此任务");
            }
        }
    }

    /**
     * 校验当前用户是否有权限查看流程实例
     */
    public void checkViewInstancePermission(WfProcessInstance instance) {
        Long currentUserId = UserContext.getUserId();
        if (currentUserId == null) {
            throw new PermissionDeniedException("用户未登录");
        }
        // 发起人、管理员可查看
        if (!instance.getStartUserId().equals(currentUserId) && !isAdmin(currentUserId)) {
            log.warn("用户 {} 尝试查看非自己的流程实例 {}", currentUserId, instance.getInstanceId());
            throw new PermissionDeniedException("无权查看此流程实例");
        }
    }

    /**
     * 校验当前用户是否有权限操作流程定义
     */
    public void checkDefinitionPermission(String operation) {
        Long currentUserId = UserContext.getUserId();
        if (currentUserId == null) {
            throw new PermissionDeniedException("用户未登录");
        }
        if (!isAdmin(currentUserId)) {
            throw new PermissionDeniedException("仅管理员可" + operation + "流程定义");
        }
    }

    /**
     * 判断用户是否是管理员
     * 简化实现：userId=1 为管理员，实际应查询角色表
     */
    private boolean isAdmin(Long userId) {
        // TODO: 实际应查询 sys_user_role 表判断是否有管理员角色
        return userId != null && userId == 1L;
    }
}
