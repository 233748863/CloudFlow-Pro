package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.system.SysRole;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

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
    
    @Autowired
    private SysUserRoleMapper sysUserRoleMapper;
    
    @Autowired
    private SysRoleMapper sysRoleMapper;

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
     * 通过查询sys_user_role和sys_role表判断用户是否拥有管理员角色
     * 管理员角色的判断标准：roleKey为'admin'或'administrator'
     */
    public boolean isAdmin(Long userId) {
        if (userId == null) {
            return false;
        }
        
        try {
            // 1. 查询用户的所有角色ID
            List<SysUserRole> userRoles = sysUserRoleMapper.selectList(
                new LambdaQueryWrapper<SysUserRole>()
                    .eq(SysUserRole::getUserId, userId)
            );
            
            if (userRoles == null || userRoles.isEmpty()) {
                return false;
            }
            
            // 2. 提取角色ID列表
            List<Long> roleIds = userRoles.stream()
                .map(SysUserRole::getRoleId)
                .collect(Collectors.toList());
            
            // 3. 查询这些角色的详细信息
            List<SysRole> roles = sysRoleMapper.selectBatchIds(roleIds);
            
            if (roles == null || roles.isEmpty()) {
                return false;
            }
            
            // 4. 判断是否包含管理员角色
            // 管理员角色的roleKey通常为'admin'或'administrator'
            boolean hasAdminRole = roles.stream()
                .anyMatch(role -> {
                    String roleKey = role.getRoleKey();
                    return roleKey != null && 
                           (roleKey.equalsIgnoreCase("admin") || 
                            roleKey.equalsIgnoreCase("administrator"));
                });
            
            if (hasAdminRole) {
                log.debug("[isAdmin] 用户 {} 拥有管理员角色", userId);
            }
            
            return hasAdminRole;
            
        } catch (Exception e) {
            log.error("[isAdmin] 查询用户角色失败, userId={}, error={}", userId, e.getMessage(), e);
            // 查询失败时，为了安全起见，返回false
            return false;
        }
    }
}
