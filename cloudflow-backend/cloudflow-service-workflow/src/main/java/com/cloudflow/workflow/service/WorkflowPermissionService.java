package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.system.SysRole;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.mapper.WfProcessCopyMapper;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 工作流权限校验服务
 */
@Service
public class WorkflowPermissionService {

    private static final Logger log = LoggerFactory.getLogger(WorkflowPermissionService.class);

    @Autowired
    private SysUserRoleMapper sysUserRoleMapper;

    @Autowired
    private SysRoleMapper sysRoleMapper;

    @Autowired
    private SysUserMapper sysUserMapper;

    @Autowired
    private WfTaskMapper taskMapper;

    @Autowired
    private WfTaskHistoryMapper taskHistoryMapper;

    @Autowired
    private WfProcessCopyMapper processCopyMapper;

    @Autowired
    private WorkflowAgentService agents;

    /**
     * 校验当前用户是否有权限处理任务
     */
    public void checkTaskPermission(WfTask task) {
        Long currentUserId = UserContext.getUserId();
        if (currentUserId == null) {
            throw new PermissionDeniedException("用户未登录");
        }
        checkTenantIsolation(task.getTenantId(), "任务");
        if (task.getAssignee() == null) {
            throw new PermissionDeniedException("任务未认领，请先认领或由管理员指派");
        }
        if (!Objects.equals(task.getAssignee(), currentUserId) && Objects.equals(task.getProxyUserId(), currentUserId)) {
            agents.assertAgentAction(task, currentUserId);
            return;
        }
        if (task.getAssignee() != null && !task.getAssignee().equals(currentUserId) && !isAdmin(currentUserId)) {
            log.warn("用户 {} 尝试处理非本人任务 {}", currentUserId, task.getTaskId());
            throw new PermissionDeniedException("无权处理此任务");
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
        checkTenantIsolation(instance.getTenantId(), "流程实例");
        Long startUserId = instance.getStartUserId();
        if (!Objects.equals(startUserId, currentUserId) && !isAdmin(currentUserId)) {
            log.warn("用户 {} 尝试撤回非本人发起流程 {}", currentUserId, instance.getInstanceId());
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
        checkTenantIsolation(instance.getTenantId(), "流程实例");
        Long startUserId = instance.getStartUserId();
        if (!Objects.equals(startUserId, currentUserId) && !isAdmin(currentUserId)) {
            throw new PermissionDeniedException("仅发起人或管理员可催办");
        }
    }

    /**
     * 校验当前用户是否有权限驳回任务
     */
    public void checkRejectPermission(WfTask task) {
        checkTaskPermission(task);
    }

    public void checkTaskReadPermission(WfTask task) {
        if (!canReadTask(task)) throw new PermissionDeniedException("无权读取此任务");
    }

    public boolean canReadTask(WfTask task) {
        Long userId = UserContext.getUserId();
        return task != null && userId != null && Objects.equals(UserContext.getTenantId(), task.getTenantId())
                && (Objects.equals(task.getAssignee(), userId) || agents.canRead(task, userId) || isAdmin(userId));
    }

    /**
     * 校验当前用户是否有权限查看流程实例
     */
    public void checkViewInstancePermission(WfProcessInstance instance) {
        Long currentUserId = UserContext.getUserId();
        Long currentTenantId = UserContext.getTenantId();
        if (currentUserId == null) {
            throw new PermissionDeniedException("用户未登录");
        }

        // 先做租户隔离，防止跨租户通过 instanceId 直接探测数据
        if (currentTenantId != null && !Objects.equals(currentTenantId, instance.getTenantId())) {
            throw new PermissionDeniedException("无权访问该租户流程实例");
        }

        if (isAdmin(currentUserId)) {
            return;
        }

        // 发起人可查看自己的流程实例
        if (instance.getStartUserId() != null && instance.getStartUserId().equals(currentUserId)) {
            return;
        }

        // 当前待办处理人可查看
        LambdaQueryWrapper<WfTask> todoWrapper = new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getInstanceId, instance.getInstanceId())
                .eq(WfTask::getAssignee, currentUserId);
        if (currentTenantId != null) {
            todoWrapper.eq(WfTask::getTenantId, currentTenantId);
        }
        Long todoCount = taskMapper.selectCount(todoWrapper);
        if (todoCount != null && todoCount > 0) {
            return;
        }

        if (taskMapper.selectList(new LambdaQueryWrapper<WfTask>().eq(WfTask::getTenantId, instance.getTenantId())
                .eq(WfTask::getInstanceId, instance.getInstanceId()).eq(WfTask::getProxyUserId, currentUserId)
                .eq(WfTask::getStatus, "TODO")).stream().anyMatch(task -> agents.canRead(task, currentUserId))) return;

        // 历史处理人可查看（用于已办、轨迹回看）
        LambdaQueryWrapper<WfTaskHistory> historyWrapper = new LambdaQueryWrapper<WfTaskHistory>()
                .eq(WfTaskHistory::getInstanceId, instance.getInstanceId())
                .and(history -> history.eq(WfTaskHistory::getOperatorId, currentUserId)
                        .or().eq(WfTaskHistory::getOnBehalfOfUserId, currentUserId));
        if (currentTenantId != null) {
            historyWrapper.eq(WfTaskHistory::getTenantId, currentTenantId);
        }
        Long historyCount = taskHistoryMapper.selectCount(historyWrapper);
        if (historyCount != null && historyCount > 0) {
            return;
        }

        LambdaQueryWrapper<com.cloudflow.workflow.domain.WfProcessCopy> copyWrapper =
                new LambdaQueryWrapper<com.cloudflow.workflow.domain.WfProcessCopy>()
                        .eq(com.cloudflow.workflow.domain.WfProcessCopy::getInstanceId, instance.getInstanceId())
                        .eq(com.cloudflow.workflow.domain.WfProcessCopy::getUserId, currentUserId);
        if (currentTenantId != null) {
            copyWrapper.eq(com.cloudflow.workflow.domain.WfProcessCopy::getTenantId, currentTenantId);
        }
        Long copyCount = processCopyMapper.selectCount(copyWrapper);
        if (copyCount != null && copyCount > 0) {
            return;
        }

        log.warn("用户 {} 尝试查看无权限流程实例 {}", currentUserId, instance.getInstanceId());
        throw new PermissionDeniedException("无权查看此流程实例");
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

    /** 每次调用独立鉴权；列表入口显式复用同请求内的身份事实。 */
    public boolean canStartProcess(Long userId, String permissionType, String permissionValue) {
        return startPermissionCheck(userId).allows(permissionType, permissionValue);
    }

    public StartPermissionCheck startPermissionCheck(Long userId) {
        return new StartUserPermissions(userId);
    }

    @FunctionalInterface
    public interface StartPermissionCheck {
        boolean allows(String permissionType, String permissionValue);
    }

    private final class StartUserPermissions implements StartPermissionCheck {
        private final Long userId;
        private final Long tenantId = UserContext.getTenantId();
        private boolean departmentLoaded;
        private Long departmentId;
        private Set<Long> roleIds;

        private StartUserPermissions(Long userId) {
            this.userId = userId;
        }

        @Override
        public boolean allows(String permissionType, String permissionValue) {
            if (userId == null || permissionType == null) return false;
            if ("ALL".equals(permissionType)) return true;
            Set<Long> targets;
            try {
                targets = WorkflowStartPermissions.identifiers(permissionValue);
            } catch (com.cloudflow.workflow.exception.WorkflowException invalid) {
                log.warn("启动权限配置无效，拒绝发起: {}", invalid.getMessage());
                return false;
            }
            if (targets.isEmpty()) return false;
            return switch (permissionType) {
                case "USER" -> targets.contains(userId);
                case "DEPT" -> {
                    if (!departmentLoaded) {
                        SysUser user = sysUserMapper.selectById(userId);
                        if (user != null && (tenantId == null || Objects.equals(tenantId, user.getTenantId()))
                                && "0".equals(user.getStatus()) && Integer.valueOf(0).equals(user.getDeleted())) {
                            departmentId = user.getDeptId();
                        }
                        departmentLoaded = true;
                    }
                    yield departmentId != null && targets.contains(departmentId);
                }
                case "ROLE" -> {
                    if (roleIds == null) {
                        roleIds = getUserRoles(userId).stream().map(SysRole::getRoleId).collect(Collectors.toSet());
                    }
                    yield roleIds.stream().anyMatch(targets::contains);
                }
                default -> false;
            };
        }
    }

    /**
     * 判断用户是否为管理员
     */
    public boolean isAdmin(Long userId) {
        if (userId == null) {
            return false;
        }
        try {
            return getUserRoles(userId).stream()
                    .map(SysRole::getRoleKey)
                    .filter(StringUtils::hasText)
                    .anyMatch(roleKey -> "admin".equalsIgnoreCase(roleKey) || "administrator".equalsIgnoreCase(roleKey));
        } catch (Exception e) {
            log.error("[isAdmin] 查询用户角色失败, userId={}, error={}", userId, e.getMessage(), e);
            return false;
        }
    }

    private List<SysRole> getUserRoles(Long userId) {
        Long currentTenantId = UserContext.getTenantId();
        LambdaQueryWrapper<SysUserRole> userRoleWrapper =
                new LambdaQueryWrapper<SysUserRole>().eq(SysUserRole::getUserId, userId);
        if (currentTenantId != null) {
            userRoleWrapper.eq(SysUserRole::getTenantId, currentTenantId);
        }
        List<SysUserRole> userRoles = sysUserRoleMapper.selectList(userRoleWrapper);
        if (userRoles == null || userRoles.isEmpty()) {
            return Collections.emptyList();
        }
        List<Long> roleIds = userRoles.stream()
                .map(SysUserRole::getRoleId)
                .collect(Collectors.toList());
        if (roleIds.isEmpty()) {
            return Collections.emptyList();
        }
        LambdaQueryWrapper<SysRole> roleWrapper = new LambdaQueryWrapper<SysRole>()
                .in(SysRole::getRoleId, roleIds)
                .eq(SysRole::getStatus, "0")
                .eq(SysRole::getDeleted, 0);
        if (currentTenantId != null) {
            roleWrapper.eq(SysRole::getTenantId, currentTenantId);
        }
        List<SysRole> roles = sysRoleMapper.selectList(roleWrapper);
        return roles == null ? Collections.emptyList() : roles;
    }

    private void checkTenantIsolation(Long resourceTenantId, String resourceName) {
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && !Objects.equals(currentTenantId, resourceTenantId)) {
            throw new PermissionDeniedException("无权访问该租户" + resourceName);
        }
    }
}
