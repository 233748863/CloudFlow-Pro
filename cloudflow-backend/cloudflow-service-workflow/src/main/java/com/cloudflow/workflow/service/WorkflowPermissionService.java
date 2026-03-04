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
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 工作流权限校验服务
 */
@Service
public class WorkflowPermissionService {

    private static final Logger log = LoggerFactory.getLogger(WorkflowPermissionService.class);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

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

    /**
     * 校验当前用户是否有权限处理任务
     */
    public void checkTaskPermission(WfTask task) {
        Long currentUserId = UserContext.getUserId();
        if (currentUserId == null) {
            throw new PermissionDeniedException("用户未登录");
        }
        checkTenantIsolation(task.getTenantId(), "任务");
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
        if (!instance.getStartUserId().equals(currentUserId) && !isAdmin(currentUserId)) {
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
        checkTenantIsolation(task.getTenantId(), "任务");
        if (task.getAssignee() != null && !task.getAssignee().equals(currentUserId) && !isAdmin(currentUserId)) {
            throw new PermissionDeniedException("无权驳回此任务");
        }
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
        if (currentTenantId != null && instance.getTenantId() != null
                && !currentTenantId.equals(instance.getTenantId())) {
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
        Long todoCount = taskMapper.selectCount(
                new LambdaQueryWrapper<WfTask>()
                        .eq(WfTask::getInstanceId, instance.getInstanceId())
                        .eq(WfTask::getAssignee, currentUserId)
        );
        if (todoCount != null && todoCount > 0) {
            return;
        }

        // 历史处理人可查看（用于已办、轨迹回看）
        Long historyCount = taskHistoryMapper.selectCount(
                new LambdaQueryWrapper<WfTaskHistory>()
                        .eq(WfTaskHistory::getInstanceId, instance.getInstanceId())
                        .eq(WfTaskHistory::getOperatorId, currentUserId)
        );
        if (historyCount != null && historyCount > 0) {
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

    /**
     * 启动权限校验（ALL/ROLE/DEPT/USER）
     * 说明：permissionValue 同时兼容 JSON 数组与逗号分隔字符串。
     */
    public boolean canStartProcess(Long userId, String permissionType, String permissionValue) {
        if (userId == null) {
            return false;
        }
        if (!StringUtils.hasText(permissionType) || "ALL".equalsIgnoreCase(permissionType)) {
            return true;
        }

        Set<String> targets = parsePermissionValues(permissionValue);
        if (targets.isEmpty()) {
            return false;
        }

        String type = permissionType.trim().toUpperCase();
        switch (type) {
            case "USER":
                return targets.contains(String.valueOf(userId));
            case "DEPT": {
                SysUser user = sysUserMapper.selectById(userId);
                if (user == null || user.getDeptId() == null) {
                    return false;
                }
                return targets.contains(String.valueOf(user.getDeptId()));
            }
            case "ROLE": {
                List<SysRole> roles = getUserRoles(userId);
                for (SysRole role : roles) {
                    if (role == null) {
                        continue;
                    }
                    if (role.getRoleId() != null && targets.contains(String.valueOf(role.getRoleId()))) {
                        return true;
                    }
                    if (StringUtils.hasText(role.getRoleKey()) && targets.contains(role.getRoleKey())) {
                        return true;
                    }
                }
                return false;
            }
            default:
                log.warn("[canStartProcess] 未知启动权限类型: {}", permissionType);
                return false;
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
        List<SysUserRole> userRoles = sysUserRoleMapper.selectList(
                new LambdaQueryWrapper<SysUserRole>().eq(SysUserRole::getUserId, userId)
        );
        if (userRoles == null || userRoles.isEmpty()) {
            return Collections.emptyList();
        }
        List<Long> roleIds = userRoles.stream()
                .map(SysUserRole::getRoleId)
                .collect(Collectors.toList());
        if (roleIds.isEmpty()) {
            return Collections.emptyList();
        }
        List<SysRole> roles = sysRoleMapper.selectBatchIds(roleIds);
        return roles == null ? Collections.emptyList() : roles;
    }

    private Set<String> parsePermissionValues(String rawValue) {
        if (!StringUtils.hasText(rawValue)) {
            return Collections.emptySet();
        }

        String trimmed = rawValue.trim();
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            try {
                List<Object> arr = OBJECT_MAPPER.readValue(trimmed, new TypeReference<List<Object>>() {});
                return arr.stream()
                        .map(v -> normalizeToken(v == null ? "" : String.valueOf(v)))
                        .filter(StringUtils::hasText)
                        .collect(Collectors.toCollection(LinkedHashSet::new));
            } catch (Exception e) {
                log.warn("[parsePermissionValues] JSON 解析失败，将按逗号分隔处理, value={}", rawValue);
            }
        }

        return Arrays.stream(trimmed.split(","))
                .map(this::normalizeToken)
                .filter(StringUtils::hasText)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private String normalizeToken(String token) {
        String value = token == null ? "" : token.trim();
        if (value.length() >= 2) {
            if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.substring(1, value.length() - 1).trim();
            }
        }
        return value;
    }

    private void checkTenantIsolation(Long resourceTenantId, String resourceName) {
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && resourceTenantId != null && !currentTenantId.equals(resourceTenantId)) {
            throw new PermissionDeniedException("无权访问该租户" + resourceName);
        }
    }
}
