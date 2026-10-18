package com.cloudflow.workflow.strategy.impl;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.system.SysDept;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.mapper.system.SysDeptMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.strategy.AssignUserStrategy;
import com.cloudflow.workflow.strategy.AssigneeResolutionException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class MultiLevelManagerAssignStrategy implements AssignUserStrategy {
    public static final int MAX_LEVEL = 10;
    private final SysUserMapper userMapper;
    private final SysDeptMapper deptMapper;
    private final DeptManagerAssignStrategy deptManagerStrategy;

    @Override
    public Long resolve(WfNodeConfig node, WfProcessInstance instance) {
        int targetLevel = node.getDirectorLevel() == null ? 1 : node.getDirectorLevel();
        if (targetLevel < 1 || targetLevel > MAX_LEVEL) {
            throw new AssigneeResolutionException("主管层级必须在1至10之间");
        }
        SysUser starter = instance.getStartUserId() == null ? null : userMapper.selectById(instance.getStartUserId());
        Long deptId = starter != null && Objects.equals(starter.getTenantId(), instance.getTenantId())
                ? starter.getDeptId() : null;
        Set<Long> visited = new HashSet<>();
        Long highestLeader = null;
        int foundLevel = 0;
        while (deptId != null && visited.size() < MAX_LEVEL && visited.add(deptId)) {
            SysDept dept = deptMapper.selectById(deptId);
            if (dept == null || !Objects.equals(dept.getTenantId(), instance.getTenantId())) {
                break;
            }
            Long leaderId = deptManagerStrategy.resolveLeaderFromDeptField(dept);
            SysUser leader = leaderId == null ? null : userMapper.selectById(leaderId);
            if (leader != null && Objects.equals(leader.getTenantId(), instance.getTenantId())) {
                highestLeader = leaderId;
                if (++foundLevel == targetLevel) {
                    return leaderId;
                }
            }
            deptId = dept.getParentId();
        }
        String fallback = node.getDirectorFallback() == null ? "TOP_LEVEL" : node.getDirectorFallback();
        return switch (fallback) {
            case "TOP_LEVEL" -> highestLeader;
            case "SKIP" -> null;
            case "FAIL" -> throw new AssigneeResolutionException("节点[" + node.getTitle() + "]主管层级不足");
            default -> throw new AssigneeResolutionException("未知主管层级不足策略: " + fallback);
        };
    }

    @Override
    public List<Long> resolveMultiple(WfNodeConfig node, WfProcessInstance instance) {
        Long assignee = resolve(node, instance);
        return assignee == null ? List.of() : List.of(assignee);
    }

    @Override
    public boolean supports(String approverType) {
        return "MULTI_LEVEL_MANAGER".equals(approverType);
    }

    @Override
    public String getDescription(String approverType, String approverValue) {
        return "多级主管";
    }
}
