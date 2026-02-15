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
import java.util.stream.Collectors;

/**
 * 按部门分配策略 —— 查找指定部门下的所有用户
 * approverType = "DEPT", approverValue = "部门ID"
 *
 * 单人模式：返回部门下第一个用户
 * 多人模式：返回部门下所有用户（用于会签）
 */
@Component
public class DeptAssignStrategy implements AssignUserStrategy {

    private static final Logger log = LoggerFactory.getLogger(DeptAssignStrategy.class);

    @Autowired
    private SysUserMapper sysUserMapper;

    @Autowired
    private SysDeptMapper sysDeptMapper;

    @Override
    public Long resolve(WfNodeConfig node, WfProcessInstance instance) {
        List<Long> ids = resolveMultiple(node, instance);
        return ids.isEmpty() ? null : ids.get(0);
    }

    @Override
    public List<Long> resolveMultiple(WfNodeConfig node, WfProcessInstance instance) {
        String value = node.getApproverValue();
        if (!StringUtils.hasText(value)) {
            return new ArrayList<>();
        }

        try {
            Long deptId = Long.valueOf(value.trim());
            List<SysUser> users = sysUserMapper.selectList(
                    new LambdaQueryWrapper<SysUser>().eq(SysUser::getDeptId, deptId));
            if (users == null || users.isEmpty()) {
                log.warn("[DeptAssignStrategy] 部门 {} 下无用户", deptId);
                return new ArrayList<>();
            }
            return users.stream()
                    .map(SysUser::getUserId)
                    .collect(Collectors.toList());
        } catch (NumberFormatException e) {
            log.warn("[DeptAssignStrategy] 无效的部门ID: {}", value);
            return new ArrayList<>();
        }
    }

    @Override
    public boolean supports(String approverType) {
        return "DEPT".equals(approverType);
    }

    @Override
    public String getDescription(String approverType, String approverValue) {
        if (!StringUtils.hasText(approverValue)) {
            return "按部门";
        }
        try {
            SysDept dept = sysDeptMapper.selectById(Long.valueOf(approverValue));
            if (dept != null) {
                return dept.getDeptName() + " (全部门)";
            }
        } catch (Exception e) {
            log.warn("[DeptAssignStrategy] 查询部门失败: {}", e.getMessage());
        }
        return "按部门";
    }
}
