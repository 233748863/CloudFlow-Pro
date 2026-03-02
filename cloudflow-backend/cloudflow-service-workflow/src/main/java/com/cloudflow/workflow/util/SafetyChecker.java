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
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Batch operation safety checker.
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
     * Check whether workflows are safe for archive/permanent delete operations.
     */
    public SafetyCheckResultDTO checkSafety(List<String> workflowIds) {
        log.info("Start safety check, workflowCount={}", workflowIds == null ? 0 : workflowIds.size());

        SafetyCheckResultDTO result = SafetyCheckResultDTO.builder()
            .safe(true)
            .build();

        if (workflowIds == null || workflowIds.isEmpty()) {
            result.setSafe(false);
            result.getErrors().add("workflowIds is empty");
            generateMessage(result);
            return result;
        }

        checkWorkflowsExist(workflowIds, result);
        checkRunningInstances(workflowIds, result);
        checkDependencies(workflowIds, result);
        checkPermissions(workflowIds, result);
        generateMessage(result);

        log.info("Safety check complete, safe={}, warnings={}, errors={}",
            result.getSafe(), result.getWarnings().size(), result.getErrors().size());

        return result;
    }

    private void checkWorkflowsExist(List<String> workflowIds, SafetyCheckResultDTO result) {
        for (String workflowId : workflowIds) {
            WfProcessDefinition definition = definitionMapper.selectById(workflowId);
            if (definition == null) {
                result.setSafe(false);
                result.getErrors().add("Workflow not found: " + workflowId);
                result.getDetails().put(workflowId, "Workflow not found");
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
                    "Workflow %s has %d running instances", workflowId, runningCount));
                result.getDetails().put(workflowId,
                    String.format("Has %d running instances", runningCount));
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
                    "Workflow %s is referenced by %d workflows", workflowId, referencingNames.size()));
                result.getDetails().put(workflowId,
                    "Referenced by workflows: " + String.join(", ", referencingNames));
            }
        }
    }

    private void checkPermissions(List<String> workflowIds, SafetyCheckResultDTO result) {
        Long currentUserId = UserContext.getUserId();
        Long currentTenantId = UserContext.getTenantId();

        if (currentUserId == null) {
            result.setSafe(false);
            result.getErrors().add("Current user not found in context");
            return;
        }

        boolean isAdmin = permissionService.isAdmin(currentUserId);

        for (String workflowId : workflowIds) {
            WfProcessDefinition definition = definitionMapper.selectById(workflowId);
            if (definition == null) {
                continue;
            }

            if (currentTenantId != null && definition.getTenantId() != null
                    && !currentTenantId.equals(definition.getTenantId())) {
                result.setSafe(false);
                result.getWorkflowsWithoutPermission().add(workflowId);
                result.getErrors().add("No permission for workflow (tenant mismatch): " + workflowId);
                result.getDetails().put(workflowId, "No permission: tenant mismatch");
                continue;
            }

            if (!isAdmin) {
                boolean isCreator = currentUserId.toString().equals(definition.getCreateBy());
                if (!isCreator) {
                    result.setSafe(false);
                    result.getWorkflowsWithoutPermission().add(workflowId);
                    result.getErrors().add("No permission for workflow: " + workflowId);
                    result.getDetails().put(workflowId, "No permission: not owner or admin");
                }
            }
        }
    }

    private void generateMessage(SafetyCheckResultDTO result) {
        if (Boolean.TRUE.equals(result.getSafe())) {
            if (result.getWarnings().isEmpty()) {
                result.setMessage("Safety check passed");
            } else {
                result.setMessage(String.format("Safety check passed with %d warnings", result.getWarnings().size()));
            }
        } else {
            result.setMessage(String.format("Safety check failed with %d errors", result.getErrors().size()));
        }
    }

    public SafetyCheckResultDTO checkSafety(String workflowId) {
        List<String> workflowIds = new ArrayList<>();
        workflowIds.add(workflowId);
        return checkSafety(workflowIds);
    }
}

