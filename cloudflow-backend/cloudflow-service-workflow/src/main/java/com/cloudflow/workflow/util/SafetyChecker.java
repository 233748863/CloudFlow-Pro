package com.cloudflow.workflow.util;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.dto.SafetyCheckResultDTO;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 批量操作安全检查器。
 */
@Slf4j
@Component
public class SafetyChecker {

    @Autowired
    private WfProcessDefinitionMapper definitionMapper;

    @Autowired
    private WfProcessInstanceMapper instanceMapper;

    @Autowired
    private WorkflowPermissionService permissionService;

    /**
     * 检查流程是否可安全归档或永久删除。
     */
    public SafetyCheckResultDTO checkSafety(List<String> workflowIds) {
        log.info("开始安全检查, workflowCount={}", workflowIds == null ? 0 : workflowIds.size());

        SafetyCheckResultDTO result = SafetyCheckResultDTO.builder()
            .safe(true)
            .build();

        if (workflowIds == null || workflowIds.isEmpty()) {
            result.setSafe(false);
            result.getErrors().add("流程 ID 列表不能为空");
            generateMessage(result);
            return result;
        }

        checkWorkflowsExist(workflowIds, result);
        checkRunningInstances(workflowIds, result);
        checkDependencies(workflowIds, result);
        checkPermissions(workflowIds, result);
        generateMessage(result);

        log.info("安全检查完成, safe={}, warnings={}, errors={}",
            result.getSafe(), result.getWarnings().size(), result.getErrors().size());

        return result;
    }

    private void checkWorkflowsExist(List<String> workflowIds, SafetyCheckResultDTO result) {
        for (String workflowId : workflowIds) {
            WfProcessDefinition definition = definitionMapper.selectById(workflowId);
            if (definition == null) {
                result.setSafe(false);
                result.getErrors().add("流程不存在: " + workflowId);
                result.getDetails().put(workflowId, "流程不存在");
            }
        }
    }

    private void checkRunningInstances(List<String> workflowIds, SafetyCheckResultDTO result) {
        for (String workflowId : workflowIds) {
            WfProcessDefinition definition = definitionMapper.selectById(workflowId);
            if (definition == null) {
                continue;
            }

            LambdaQueryWrapper<WfProcessInstance> queryWrapper = new LambdaQueryWrapper<>();
            queryWrapper.eq(WfProcessInstance::getDefinitionId, workflowId)
                .in(WfProcessInstance::getStatus, "RUNNING", "SUSPENDED");

            Long runningCount = instanceMapper.selectCount(queryWrapper);
            if (runningCount != null && runningCount > 0) {
                result.getWorkflowsWithRunningInstances().add(workflowId);
                result.getWarnings().add(String.format(
                    "流程 %s 存在 %d 个运行中的实例", workflowId, runningCount));
                result.getDetails().put(workflowId,
                    String.format("存在 %d 个运行中的实例", runningCount));
            }
        }
    }

    private void checkDependencies(List<String> workflowIds, SafetyCheckResultDTO result) {
        Set<String> selectedWorkflowIds = new HashSet<>(workflowIds);

        for (String workflowId : workflowIds) {
            WfProcessDefinition definition = definitionMapper.selectById(workflowId);
            if (definition == null) {
                continue;
            }

            LambdaQueryWrapper<WfProcessDefinition> queryWrapper = new LambdaQueryWrapper<>();
            queryWrapper.ne(WfProcessDefinition::getDefinitionId, workflowId)
                .like(WfProcessDefinition::getModelJson, workflowId)
                .and(w -> w
                    .isNull(WfProcessDefinition::getIsArchived)
                    .or()
                    .eq(WfProcessDefinition::getIsArchived, 0));

            List<WfProcessDefinition> referencedBy = definitionMapper.selectList(queryWrapper).stream()
                .filter(item -> !selectedWorkflowIds.contains(item.getDefinitionId()))
                .collect(Collectors.toList());

            if (!referencedBy.isEmpty()) {
                List<String> referencingNames = referencedBy.stream()
                    .map(item -> item.getProcessName() != null ? item.getProcessName() : item.getDefinitionId())
                    .collect(Collectors.toList());

                result.getWorkflowsWithDependencies().add(workflowId);
                result.getWarnings().add(String.format(
                    "流程 %s 被 %d 个流程引用", workflowId, referencingNames.size()));
                result.getDetails().put(workflowId,
                    "被以下流程引用: " + String.join(", ", referencingNames));
            }
        }
    }

    private void checkPermissions(List<String> workflowIds, SafetyCheckResultDTO result) {
        Long currentUserId = UserContext.getUserId();
        Long currentTenantId = UserContext.getTenantId();

        if (currentUserId == null) {
            result.setSafe(false);
            result.getErrors().add("当前用户上下文不存在");
            return;
        }

        boolean isAdmin = permissionService.isAdmin(currentUserId);

        for (String workflowId : workflowIds) {
            WfProcessDefinition definition = definitionMapper.selectById(workflowId);
            if (definition == null) {
                continue;
            }

            if (currentTenantId != null && !Objects.equals(currentTenantId, definition.getTenantId())) {
                result.setSafe(false);
                result.getWorkflowsWithoutPermission().add(workflowId);
                result.getErrors().add("无流程操作权限（租户不匹配）: " + workflowId);
                result.getDetails().put(workflowId, "无权限：租户不匹配");
                continue;
            }

            if (!isAdmin) {
                boolean isCreator = currentUserId.toString().equals(definition.getCreateBy());
                if (!isCreator) {
                    result.setSafe(false);
                    result.getWorkflowsWithoutPermission().add(workflowId);
                    result.getErrors().add("无流程操作权限: " + workflowId);
                    result.getDetails().put(workflowId, "无权限：非创建者或管理员");
                }
            }
        }
    }

    private void generateMessage(SafetyCheckResultDTO result) {
        if (Boolean.TRUE.equals(result.getSafe())) {
            if (result.getWarnings().isEmpty()) {
                result.setMessage("安全检查通过");
            } else {
                result.setMessage(String.format("安全检查通过，存在 %d 条警告", result.getWarnings().size()));
            }
        } else {
            result.setMessage(String.format("安全检查失败，存在 %d 个错误", result.getErrors().size()));
        }
    }

    public SafetyCheckResultDTO checkSafety(String workflowId) {
        List<String> workflowIds = new ArrayList<>();
        workflowIds.add(workflowId);
        return checkSafety(workflowIds);
    }
}

