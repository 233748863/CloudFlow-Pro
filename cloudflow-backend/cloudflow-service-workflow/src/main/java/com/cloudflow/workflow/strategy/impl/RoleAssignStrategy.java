package com.cloudflow.workflow.strategy.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.system.SysRole;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.cloudflow.workflow.strategy.AssignUserStrategy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 角色分配策略 —— 根据角色Key查找该角色下的用户
 * approverType = "ROLE", approverValue = "角色Key（如 finance_manager）"
 *
 * 单人模式：返回该角色下的第一个用户（后续可扩展为任务池/轮询）
 * 多人模式：返回该角色下的所有用户（用于会签）
 */
@Component
public class RoleAssignStrategy implements AssignUserStrategy {

    private static final Logger log = LoggerFactory.getLogger(RoleAssignStrategy.class);

    @Autowired
    private SysRoleMapper sysRoleMapper;

    @Autowired
    private SysUserRoleMapper sysUserRoleMapper;

    @Override
    public Long resolve(WfNodeConfig node, WfProcessInstance instance) {
        List<Long> userIds = resolveMultiple(node, instance);
        // 单人模式返回第一个用户，后续可扩展为轮询或负载均衡
        return userIds.isEmpty() ? null : userIds.get(0);
    }

    @Override
    public List<Long> resolveMultiple(WfNodeConfig node, WfProcessInstance instance) {
        String roleKey = node.getApproverValue();
        if (!StringUtils.hasText(roleKey)) {
            return new ArrayList<>();
        }

        SysRole role = sysRoleMapper.selectOne(
                new LambdaQueryWrapper<SysRole>().eq(SysRole::getRoleKey, roleKey));
        if (role == null) {
            log.warn("[RoleAssignStrategy] 角色不存在: {}", roleKey);
            return new ArrayList<>();
        }

        List<SysUserRole> userRoles = sysUserRoleMapper.selectList(
                new LambdaQueryWrapper<SysUserRole>().eq(SysUserRole::getRoleId, role.getRoleId()));
        if (userRoles == null || userRoles.isEmpty()) {
            log.warn("[RoleAssignStrategy] 角色 {} 下无用户", roleKey);
            return new ArrayList<>();
        }

        return userRoles.stream()
                .map(SysUserRole::getUserId)
                .collect(Collectors.toList());
    }

    @Override
    public boolean supports(String approverType) {
        return "ROLE".equals(approverType);
    }

    @Override
    public String getDescription(String approverType, String approverValue) {
        if (!StringUtils.hasText(approverValue)) {
            return "指定角色";
        }
        try {
            SysRole role = sysRoleMapper.selectOne(
                    new LambdaQueryWrapper<SysRole>().eq(SysRole::getRoleKey, approverValue));
            if (role != null) {
                return role.getRoleName();
            }
        } catch (Exception e) {
            log.warn("[RoleAssignStrategy] 查询角色失败: {}", e.getMessage());
        }
        return "指定角色";
    }
}
