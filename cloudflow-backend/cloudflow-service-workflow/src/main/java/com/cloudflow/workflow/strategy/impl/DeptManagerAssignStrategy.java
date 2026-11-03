package com.cloudflow.workflow.strategy.impl;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.system.SysDept;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.mapper.system.SysDeptMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.service.WorkflowDepartmentLeaders;
import com.cloudflow.workflow.strategy.AssignUserStrategy;
import com.cloudflow.workflow.strategy.AssigneeResolutionException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Objects;

/** 部门缺少有效负责人时逐级找上级负责人，仍无人则阻止发起。 */
@Component
public class DeptManagerAssignStrategy implements AssignUserStrategy {
    @Autowired
    private SysUserMapper sysUserMapper;
    @Autowired
    private SysDeptMapper sysDeptMapper;

    @Override
    public Long resolve(WfNodeConfig node, WfProcessInstance instance) {
        SysUser starter = instance.getStartUserId() == null ? null : sysUserMapper.selectById(instance.getStartUserId());
        if (starter == null || !Objects.equals(starter.getTenantId(), instance.getTenantId())
                || !"0".equals(starter.getStatus()) || !Integer.valueOf(0).equals(starter.getDeleted())) {
            throw new AssigneeResolutionException("流程发起人不存在或已停用");
        }
        SysUser leader = WorkflowDepartmentLeaders.find(starter.getDeptId(), instance.getTenantId(), sysDeptMapper, sysUserMapper);
        if (leader == null) {
            throw new AssigneeResolutionException("本部门及上级部门均无有效负责人，请补齐部门负责人后发起");
        }
        return leader.getUserId();
    }

    public Long resolveLeaderFromDeptField(SysDept department) {
        SysUser leader = WorkflowDepartmentLeaders.activeLeader(department, sysUserMapper);
        return leader == null ? null : leader.getUserId();
    }

    @Override
    public List<Long> resolveMultiple(WfNodeConfig node, WfProcessInstance instance) {
        return List.of(resolve(node, instance));
    }

    @Override
    public boolean supports(String approverType) {
        return "DEPT_MANAGER".equals(approverType) || "DIRECT_LEADER".equals(approverType);
    }

    @Override
    public String getDescription(String approverType, String approverValue) {
        return "DIRECT_LEADER".equals(approverType) ? "直属领导" : "部门经理";
    }
}
