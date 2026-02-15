package com.cloudflow.workflow.strategy.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.system.SysDept;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.mapper.system.SysDeptMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.strategy.AssignUserStrategy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

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

        // 通过部门 leader 字段查找对应用户
        String leaderUsername = dept.getLeader();
        if (!StringUtils.hasText(leaderUsername)) {
            log.warn("[DeptManagerAssignStrategy] 部门 {} 未设置负责人", dept.getDeptName());
            return null;
        }

        SysUser leader = sysUserMapper.selectOne(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getUserName, leaderUsername));
        if (leader == null) {
            log.warn("[DeptManagerAssignStrategy] 部门负责人用户不存在: {}", leaderUsername);
            return null;
        }

        return leader.getUserId();
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
}
