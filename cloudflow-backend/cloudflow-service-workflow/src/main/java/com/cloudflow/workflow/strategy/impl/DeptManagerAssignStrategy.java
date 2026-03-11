package com.cloudflow.workflow.strategy.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.system.SysDept;
import com.cloudflow.workflow.domain.system.SysRole;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.mapper.system.SysDeptMapper;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.cloudflow.workflow.strategy.AssignUserStrategy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 部门经理/直属领导分配策略
 * approverType = "DEPT_MANAGER" 或 "DIRECT_LEADER"
 *
 * 逻辑：根据流程发起人所在部门，查找该部门的 leader 字段对应的用户
 * 借鉴 poco-flow 的 AssignUserLeaderStrategyImpl 设计
 */
@Component
public class DeptManagerAssignStrategy implements AssignUserStrategy {

    private static final Logger log = LoggerFactory.getLogger(DeptManagerAssignStrategy.class);

    @Autowired
    private SysUserMapper sysUserMapper;

    @Autowired
    private SysDeptMapper sysDeptMapper;

    @Autowired
    private SysUserRoleMapper sysUserRoleMapper;

    @Autowired
    private SysRoleMapper sysRoleMapper;

    @Override
    public Long resolve(WfNodeConfig node, WfProcessInstance instance) {
        Long startUserId = instance.getStartUserId();
        if (startUserId == null) {
            log.warn("[DeptManagerAssignStrategy] 流程发起人ID为空");
            return null;
        }

        // 查询发起人信息
        SysUser startUser = sysUserMapper.selectById(startUserId);
        if (startUser == null || startUser.getDeptId() == null) {
            log.warn("[DeptManagerAssignStrategy] 发起人不存在或未分配部门, userId={}", startUserId);
            return null;
        }

        // 查询部门信息
        SysDept dept = sysDeptMapper.selectById(startUser.getDeptId());
        if (dept == null) {
            log.warn("[DeptManagerAssignStrategy] 部门不存在, deptId={}", startUser.getDeptId());
            return null;
        }

        // 优先使用部门 leader 字段；兼容 leader 可能存 userId / userName / nickName 的情况。
        Long leaderUserId = resolveLeaderFromDeptField(dept);
        if (leaderUserId != null) {
            return leaderUserId;
        }

        // 兜底策略：如果 leader 字段不可用，则回退到“当前部门/上级部门的 manager 用户”。
        Long managerUserId = resolveManagerFromDeptChain(startUser.getDeptId(), new HashSet<>());
        if (managerUserId != null) {
            return managerUserId;
        }

        log.warn("[DeptManagerAssignStrategy] 无法为部门 {} 解析经理审批人", dept.getDeptName());
        return null;
    }

    @Override
    public List<Long> resolveMultiple(WfNodeConfig node, WfProcessInstance instance) {
        List<Long> list = new ArrayList<>();
        Long id = resolve(node, instance);
        if (id != null) {
            list.add(id);
        }
        return list;
    }

    @Override
    public boolean supports(String approverType) {
        return "DEPT_MANAGER".equals(approverType) || "DIRECT_LEADER".equals(approverType);
    }

    @Override
    public String getDescription(String approverType, String approverValue) {
        if ("DIRECT_LEADER".equals(approverType)) {
            return "直属领导";
        }
        return "部门经理";
    }

    private Long resolveLeaderFromDeptField(SysDept dept) {
        String leaderValue = dept.getLeader();
        if (!StringUtils.hasText(leaderValue)) {
            log.warn("[DeptManagerAssignStrategy] 部门 {} 未设置负责人", dept.getDeptName());
            return null;
        }

        String normalized = leaderValue.trim();
        try {
            SysUser leaderById = sysUserMapper.selectById(Long.valueOf(normalized));
            if (leaderById != null) {
                return leaderById.getUserId();
            }
        } catch (NumberFormatException ignored) {
        }

        SysUser leader = sysUserMapper.selectOne(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getUserName, normalized)
                .or()
                .eq(SysUser::getNickName, normalized)
                .last("LIMIT 1"));
        if (leader != null) {
            return leader.getUserId();
        }

        log.warn("[DeptManagerAssignStrategy] 部门负责人无法映射到系统用户: {}", normalized);
        return null;
    }

    private Long resolveManagerFromDeptChain(Long deptId, Set<Long> visitedDeptIds) {
        if (deptId == null || !visitedDeptIds.add(deptId)) {
            return null;
        }

        List<Long> managerRoleIds = sysRoleMapper.selectList(new LambdaQueryWrapper<SysRole>()
                        .eq(SysRole::getRoleKey, "manager"))
                .stream()
                .map(SysRole::getRoleId)
                .collect(Collectors.toList());
        if (!managerRoleIds.isEmpty()) {
            List<Long> managerUserIds = sysUserRoleMapper.selectList(new LambdaQueryWrapper<SysUserRole>()
                            .in(SysUserRole::getRoleId, managerRoleIds))
                    .stream()
                    .map(SysUserRole::getUserId)
                    .distinct()
                    .collect(Collectors.toList());
            if (!managerUserIds.isEmpty()) {
                List<SysUser> deptManagers = sysUserMapper.selectList(new LambdaQueryWrapper<SysUser>()
                                .eq(SysUser::getDeptId, deptId)
                                .in(SysUser::getUserId, managerUserIds))
                        .stream()
                        .sorted(Comparator.comparing(SysUser::getUserId))
                        .collect(Collectors.toList());
                if (!deptManagers.isEmpty()) {
                    return deptManagers.get(0).getUserId();
                }
            }
        }

        SysDept currentDept = sysDeptMapper.selectById(deptId);
        if (currentDept == null || currentDept.getParentId() == null || currentDept.getParentId() <= 0) {
            return null;
        }
        return resolveManagerFromDeptChain(currentDept.getParentId(), visitedDeptIds);
    }
}
