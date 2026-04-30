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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
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
        List<String> roleKeys = parseRoleKeys(node.getApproverValue());
        if (roleKeys.isEmpty()) {
            return new ArrayList<>();
        }

        Set<Long> userIds = new LinkedHashSet<>();
        for (String roleKey : roleKeys) {
            String normalizedRoleKey = roleKey.trim().toLowerCase(Locale.ROOT);
            SysRole role = sysRoleMapper.selectOne(
                    new LambdaQueryWrapper<SysRole>().eq(SysRole::getRoleKey, normalizedRoleKey));
            if (role == null) {
                log.warn("[RoleAssignStrategy] 角色不存在: {}", roleKey);
                continue;
            }

            List<SysUserRole> userRoles = sysUserRoleMapper.selectList(
                    new LambdaQueryWrapper<SysUserRole>().eq(SysUserRole::getRoleId, role.getRoleId()));
            if (userRoles == null || userRoles.isEmpty()) {
                log.warn("[RoleAssignStrategy] 角色 {} 下无用户", roleKey);
                continue;
            }
            userRoles.stream()
                    .map(SysUserRole::getUserId)
                    .forEach(userIds::add);
        }

        return new ArrayList<>(userIds);
    }

    @Override
    public boolean supports(String approverType) {
        return "ROLE".equals(approverType);
    }

    @Override
    public String getDescription(String approverType, String approverValue) {
        List<String> roleKeys = parseRoleKeys(approverValue);
        if (roleKeys.isEmpty()) {
            return "指定角色";
        }
        try {
            List<String> roleNames = new ArrayList<>();
            for (String roleKey : roleKeys) {
                String normalizedRoleKey = roleKey.trim().toLowerCase(Locale.ROOT);
                SysRole role = sysRoleMapper.selectOne(
                        new LambdaQueryWrapper<SysRole>().eq(SysRole::getRoleKey, normalizedRoleKey));
                roleNames.add(role != null ? role.getRoleName() : roleKey);
            }
            return String.join(" / ", roleNames);
        } catch (Exception e) {
            log.warn("[RoleAssignStrategy] 查询角色失败: {}", e.getMessage());
        }
        return "指定角色";
    }

    private List<String> parseRoleKeys(String approverValue) {
        if (!StringUtils.hasText(approverValue)) {
            return new ArrayList<>();
        }
        return java.util.Arrays.stream(approverValue.split(","))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .collect(Collectors.toList());
    }
}
