package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.system.SysDept;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.mapper.system.SysDeptMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;

import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

/** 同租户有效部门负责人；部门缺人时向父部门查找。 */
public final class WorkflowDepartmentLeaders {
    private WorkflowDepartmentLeaders() {
    }

    public static SysUser find(Long departmentId, Long tenantId, SysDeptMapper departments, SysUserMapper users) {
        if (tenantId == null) {
            return null;
        }
        Set<Long> visited = new HashSet<>();
        Long currentId = departmentId;
        while (currentId != null && currentId > 0 && visited.add(currentId)) {
            SysDept department = departments.selectById(currentId);
            if (department == null || !Objects.equals(tenantId, department.getTenantId())) {
                return null;
            }
            SysUser leader = activeLeader(department, users);
            if (leader != null) {
                return leader;
            }
            currentId = department.getParentId();
        }
        return null;
    }

    public static SysUser activeLeader(SysDept department, SysUserMapper users) {
        if (department == null || department.getTenantId() == null || department.getLeaderUserId() == null
                || !"0".equals(department.getStatus()) || !Integer.valueOf(0).equals(department.getDeleted())) {
            return null;
        }
        SysUser leader = users.selectById(department.getLeaderUserId());
        return leader != null && Objects.equals(department.getTenantId(), leader.getTenantId())
                && "0".equals(leader.getStatus()) && Integer.valueOf(0).equals(leader.getDeleted()) ? leader : null;
    }
}
