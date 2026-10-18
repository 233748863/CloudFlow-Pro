package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTaskCandidate;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfTaskCandidateMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.model.WorkflowRuntimeGraph;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class InitiatorSelectionService {
    private final WfTaskCandidateMapper candidateMapper;
    private final SysUserMapper userMapper;
    private final SysUserRoleMapper userRoleMapper;
    private final WorkflowGraphModelResolver graphResolver;

    public void saveSelections(WfProcessInstance instance, String modelJson, Map<String, List<Long>> nodeAssignees) {
        if (!StringUtils.hasText(modelJson)) {
            if (nodeAssignees != null && !nodeAssignees.isEmpty()) {
                throw WorkflowException.validationError("流程未配置可选审批节点");
            }
            return;
        }
        WorkflowRuntimeGraph graph = graphResolver.parseRuntimeGraph(modelJson);
        Map<String, List<Long>> selections = nodeAssignees == null ? Map.of() : nodeAssignees;
        Set<String> selectableNodes = new HashSet<>();
        List<WfTaskCandidate> snapshots = new ArrayList<>();
        for (String nodeId : graph.getNodeIds()) {
            WfNodeConfig node = graph.getNode(nodeId);
            if (!"INITIATOR_SELECTED".equals(node.getApproverType())) {
                continue;
            }
            selectableNodes.add(nodeId);
            WorkflowNodePolicy.assertAllowed(node, "allowSelection");
            List<Long> selected = selections.get(nodeId);
            if (selected == null || selected.isEmpty() || selected.stream().anyMatch(Objects::isNull)) {
                throw WorkflowException.validationError("请为节点[" + node.getTitle() + "]选择审批人");
            }
            if (new HashSet<>(selected).size() != selected.size()) {
                throw WorkflowException.validationError("节点审批人不能重复");
            }
            if (!StringUtils.hasText(node.getSignType()) && selected.size() != 1) {
                throw WorkflowException.validationError("普通审批节点只能选择一位审批人");
            }
            String snapshotPrefix = UUID.randomUUID().toString();
            LocalDateTime selectedAt = LocalDateTime.now();
            for (int selectedIndex = 0; selectedIndex < selected.size(); selectedIndex++) {
                Long userId = selected.get(selectedIndex);
                SysUser user = userMapper.selectById(userId);
                if (user == null || !Objects.equals(user.getTenantId(), instance.getTenantId())
                        || Integer.valueOf(1).equals(user.getDeleted()) || !"0".equals(user.getStatus())) {
                    throw WorkflowException.validationError("选择的审批人不存在、已停用或不属于当前租户");
                }
                assertSelectable(node, user, instance.getTenantId());
                WfTaskCandidate candidate = new WfTaskCandidate();
                candidate.setCandidateId(snapshotPrefix + "-" + String.format("%010d", selectedIndex));
                candidate.setTenantId(instance.getTenantId());
                candidate.setInstanceId(instance.getInstanceId());
                candidate.setNodeKey(nodeId);
                candidate.setSource("INITIATOR_SELECTED");
                candidate.setUserId(userId);
                candidate.setUserName(StringUtils.hasText(user.getNickName()) ? user.getNickName() : user.getUserName());
                candidate.setCandidateType("USER");
                candidate.setStatus("PENDING");
                candidate.setCreateTime(selectedAt);
                snapshots.add(candidate);
            }
        }
        if (!selectableNodes.containsAll(selections.keySet())) {
            throw WorkflowException.validationError("提交的选人节点不存在或不允许发起人选人");
        }
        snapshots.forEach(candidateMapper::insert);
    }

    public void assertSelectable(WfNodeConfig node, SysUser user, Long tenantId) {
        Map<String, Object> scope = node.getSelectableScope();
        if (scope == null || scope.isEmpty()) {
            return;
        }
        if (!Set.of("roleIds", "deptIds").containsAll(scope.keySet())) {
            throw WorkflowException.validationError("可选范围仅支持roleIds和deptIds");
        }
        List<Long> deptIds = scopeIds(scope.get("deptIds"));
        if (!deptIds.isEmpty() && !deptIds.contains(user.getDeptId())) {
            throw WorkflowException.validationError("选择的审批人不在节点限定部门内");
        }
        List<Long> roleIds = scopeIds(scope.get("roleIds"));
        if (!roleIds.isEmpty() && userRoleMapper.selectCount(new LambdaQueryWrapper<SysUserRole>()
                .eq(SysUserRole::getTenantId, tenantId).eq(SysUserRole::getUserId, user.getUserId())
                .in(SysUserRole::getRoleId, roleIds)) == 0) {
            throw WorkflowException.validationError("选择的审批人不具备节点限定角色");
        }
    }

    public List<SysUser> selectableUsers(WfNodeConfig node, Long tenantId) {
        Map<String, Object> scope = node.getSelectableScope() == null ? Map.of() : node.getSelectableScope();
        List<Long> roleIds = scopeIds(scope.get("roleIds"));
        List<Long> deptIds = scopeIds(scope.get("deptIds"));
        LambdaQueryWrapper<SysUser> query = new LambdaQueryWrapper<SysUser>().eq(SysUser::getTenantId, tenantId)
                .eq(SysUser::getStatus, "0").eq(SysUser::getDeleted, 0);
        if (!deptIds.isEmpty()) query.in(SysUser::getDeptId, deptIds);
        if (!roleIds.isEmpty()) {
            List<Long> userIds = userRoleMapper.selectList(new LambdaQueryWrapper<SysUserRole>()
                    .eq(SysUserRole::getTenantId, tenantId).in(SysUserRole::getRoleId, roleIds)).stream()
                    .map(SysUserRole::getUserId).distinct().toList();
            if (userIds.isEmpty()) return List.of();
            query.in(SysUser::getUserId, userIds);
        }
        return userMapper.selectList(query.orderByAsc(SysUser::getUserId));
    }

    public static List<Long> scopeIds(Object value) {
        if (value == null) {
            return List.of();
        }
        if (!(value instanceof Collection<?> values)) {
            throw WorkflowException.validationError("可选范围必须为ID数组");
        }
        try {
            List<Long> ids = values.stream().map(item -> Long.valueOf(String.valueOf(item))).toList();
            if (ids.stream().anyMatch(identifier -> identifier <= 0)) {
                throw WorkflowException.validationError("可选范围包含无效ID");
            }
            return ids;
        } catch (NumberFormatException exception) {
            throw WorkflowException.validationError("可选范围包含无效ID");
        }
    }
}
