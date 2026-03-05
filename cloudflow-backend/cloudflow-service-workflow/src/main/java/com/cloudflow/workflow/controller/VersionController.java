package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WorkflowVersion;
import com.cloudflow.workflow.domain.dto.ErrorResponse;
import com.cloudflow.workflow.domain.dto.RollbackVersionRequest;
import com.cloudflow.workflow.domain.dto.VersionComparisonDTO;
import com.cloudflow.workflow.domain.dto.VersionDTO;
import com.cloudflow.workflow.domain.dto.VersionDetailDTO;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WorkflowVersionMapper;
import com.cloudflow.workflow.service.IVersionComparisonService;
import com.cloudflow.workflow.service.IVersionService;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Workflow version controller.
 */
@Slf4j
@RestController
@RequestMapping("/versions")
public class VersionController {

    @Autowired
    private IVersionService versionService;

    @Autowired
    private IVersionComparisonService comparisonService;

    @Autowired
    private WfProcessDefinitionMapper definitionMapper;

    @Autowired
    private WorkflowVersionMapper workflowVersionMapper;

    @Autowired
    private WorkflowPermissionService permissionService;

    @GetMapping("/workflow/{workflowId}")
    public R<List<VersionDTO>> getVersionHistory(@PathVariable String workflowId) {
        log.info("Query workflow version history, workflowId={}", workflowId);

        ensureWorkflowOwnerOrAdmin(workflowId);
        List<VersionDTO> versions = versionService.getVersionHistory(workflowId);
        return R.ok(versions);
    }

    @GetMapping("/{versionId}")
    public R<VersionDetailDTO> getVersionDetail(@PathVariable String versionId) {
        log.info("Query version detail, versionId={}", versionId);

        WorkflowVersion version = workflowVersionMapper.selectById(versionId);
        if (version == null) {
            throw new WorkflowException("Version not found: " + versionId);
        }
        ensureWorkflowOwnerOrAdmin(version.getWorkflowId());

        VersionDetailDTO detail = versionService.getVersionDetail(versionId);
        return R.ok(detail);
    }

    @GetMapping("/compare")
    public R<VersionComparisonDTO> compareVersions(
            @RequestParam String fromVersionId,
            @RequestParam String toVersionId) {
        log.info("Compare versions, fromVersionId={}, toVersionId={}", fromVersionId, toVersionId);

        WorkflowVersion fromVersion = workflowVersionMapper.selectById(fromVersionId);
        WorkflowVersion toVersion = workflowVersionMapper.selectById(toVersionId);
        if (fromVersion == null) {
            throw new WorkflowException("Version not found: " + fromVersionId);
        }
        if (toVersion == null) {
            throw new WorkflowException("Version not found: " + toVersionId);
        }
        if (!Objects.equals(fromVersion.getWorkflowId(), toVersion.getWorkflowId())) {
            throw WorkflowException.validationError("Only versions of the same workflow can be compared");
        }

        ensureWorkflowOwnerOrAdmin(fromVersion.getWorkflowId());
        VersionComparisonDTO comparison = comparisonService.compareVersions(fromVersionId, toVersionId);
        return R.ok(comparison);
    }

    @PostMapping("/rollback")
    public ResponseEntity<?> rollbackToVersion(@RequestBody RollbackVersionRequest request) {
        log.info("Rollback workflow version, workflowId={}, targetVersionId={}",
            request.getWorkflowId(), request.getTargetVersionId());

        // 权限口径统一：仅流程创建者或管理员可回滚
        ensureWorkflowOwnerOrAdmin(request.getWorkflowId());

        String operatorId = UserContext.getUserId() != null
            ? UserContext.getUserId().toString()
            : "system";

        boolean hasRunning = versionService.hasRunningInstances(request.getWorkflowId());
        if (hasRunning && !Boolean.TRUE.equals(request.getForceRollback())) {
            Map<String, Object> warningData = new HashMap<>();
            warningData.put("hasRunningInstances", true);
            warningData.put("requireConfirmation", true);
            warningData.put("affectedWorkflows", List.of(request.getWorkflowId()));

            ErrorResponse errorResponse = ErrorResponse.builder()
                .code("RUNNING_INSTANCES_WARNING")
                .message("The workflow has running instances. Rollback may impact running processes")
                .data(warningData)
                .build();

            return ResponseEntity.status(HttpStatus.CONFLICT).body(errorResponse);
        }

        WorkflowVersion newVersion = versionService.rollbackToVersion(
            request.getWorkflowId(),
            request.getTargetVersionId(),
            request.getReason(),
            request.getForceRollback(),
            operatorId
        );

        Map<String, Object> result = new HashMap<>();
        result.put("versionId", newVersion.getId());
        result.put("versionNumber", newVersion.getVersionNumber());
        result.put("message", "Version rollback successful");

        return ResponseEntity.ok(R.ok(result));
    }

    @GetMapping("/check-running/{workflowId}")
    public R<Map<String, Object>> checkRunningInstances(@PathVariable String workflowId) {
        log.info("Check workflow running instances, workflowId={}", workflowId);

        // 仅流程创建者或管理员可查看运行实例状态，避免越权探测流程活跃情况
        ensureWorkflowOwnerOrAdmin(workflowId);
        boolean hasRunning = versionService.hasRunningInstances(workflowId);

        Map<String, Object> result = new HashMap<>();
        result.put("hasRunningInstances", hasRunning);
        result.put("workflowId", workflowId);

        return R.ok(result);
    }

    private void ensureWorkflowOwnerOrAdmin(String workflowId) {
        Long currentUserId = UserContext.getUserId();
        Long currentTenantId = UserContext.getTenantId();
        if (currentUserId == null) {
            throw new PermissionDeniedException("User not logged in");
        }

        WfProcessDefinition definition = definitionMapper.selectById(workflowId);
        if (definition == null) {
            throw WorkflowException.processNotFound(workflowId);
        }
        if (currentTenantId != null && !Objects.equals(currentTenantId, definition.getTenantId())) {
            throw new PermissionDeniedException("Tenant mismatch");
        }

        boolean isCreator = Objects.equals(currentUserId.toString(), definition.getCreateBy());
        boolean isAdmin = permissionService.isAdmin(currentUserId);
        if (!isCreator && !isAdmin) {
            throw new PermissionDeniedException("Only workflow owner or admin can access version data");
        }
    }
}
