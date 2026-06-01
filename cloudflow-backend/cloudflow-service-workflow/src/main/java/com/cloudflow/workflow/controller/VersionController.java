package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WorkflowVersion;
import com.cloudflow.workflow.domain.dto.RollbackVersionRequest;
import com.cloudflow.workflow.domain.dto.VersionComparisonDTO;
import com.cloudflow.workflow.domain.dto.VersionDTO;
import com.cloudflow.workflow.domain.dto.VersionDetailDTO;
import com.cloudflow.workflow.domain.vo.DynamicMapVO;
import com.cloudflow.workflow.domain.vo.WorkflowErrorVO;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WorkflowVersionMapper;
import com.cloudflow.workflow.service.IVersionComparisonService;
import com.cloudflow.workflow.service.IVersionService;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import lombok.extern.slf4j.Slf4j;
import cn.dev33.satoken.annotation.SaCheckPermission;
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

import java.io.Serializable;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;

/**
 * 流程版本控制器。
 */
@Slf4j
@RestController
@RequestMapping("/versions")
public class VersionController {

    @Autowired
    private IVersionService versionService;

    @Autowired
    private IVersionComparisonService versionComparisonService;

    @Autowired
    private WfProcessDefinitionMapper definitionMapper;

    @Autowired
    private WorkflowVersionMapper workflowVersionMapper;

    @Autowired
    private WorkflowPermissionService permissionService;

    @GetMapping("/workflow/{workflowId}")
    @SaCheckPermission("workflow:definition:view")
    public R<List<VersionDTO>> getVersionHistory(@PathVariable String workflowId) {
        log.info("查询流程版本历史, workflowId={}", workflowId);

        ensureWorkflowOwnerOrAdmin(workflowId);
        List<VersionDTO> versions = versionService.getVersionHistory(workflowId);
        return R.ok(versions);
    }

    @GetMapping("/{versionId}")
    @SaCheckPermission("workflow:definition:view")
    public R<VersionDetailDTO> getVersionDetail(@PathVariable String versionId) {
        log.info("查询版本详情, versionId={}", versionId);

        WorkflowVersion version = workflowVersionMapper.selectById(versionId);
        if (version == null) {
            throw new WorkflowException("版本不存在: " + versionId);
        }
        ensureWorkflowOwnerOrAdmin(version.getWorkflowId());

        VersionDetailDTO detail = versionService.getVersionDetail(versionId);
        return R.ok(detail);
    }

    @GetMapping("/compare")
    @SaCheckPermission("workflow:definition:view")
    public R<VersionComparisonDTO> compareVersions(
            @RequestParam String fromVersionId,
            @RequestParam String toVersionId) {
        log.info("对比流程版本, fromVersionId={}, toVersionId={}", fromVersionId, toVersionId);

        WorkflowVersion fromVersion = workflowVersionMapper.selectById(fromVersionId);
        WorkflowVersion toVersion = workflowVersionMapper.selectById(toVersionId);
        if (fromVersion == null) {
            throw new WorkflowException("版本不存在: " + fromVersionId);
        }
        if (toVersion == null) {
            throw new WorkflowException("版本不存在: " + toVersionId);
        }
        if (!Objects.equals(fromVersion.getWorkflowId(), toVersion.getWorkflowId())) {
            throw WorkflowException.validationError("只能对比同一流程的版本");
        }

        ensureWorkflowOwnerOrAdmin(fromVersion.getWorkflowId());
        VersionComparisonDTO comparison = versionComparisonService.compareVersions(fromVersionId, toVersionId);
        return R.ok(comparison);
    }

    @RepeatSubmit
    @PostMapping("/rollback")
    @SaCheckPermission("workflow:deploy:manage")
    public ResponseEntity<Serializable> rollbackToVersion(@RequestBody RollbackVersionRequest request) {
        log.info("回滚流程版本, workflowId={}, targetVersionId={}",
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

            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(WorkflowErrorVO.builder()
                    .code("RUNNING_INSTANCES_WARNING")
                    .message("流程存在运行中的实例，回滚可能影响运行中的流程")
                    .data(DynamicMapVO.from(warningData))
                    .build());
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
        result.put("message", "版本回滚成功");

        return ResponseEntity.ok((Serializable) R.ok(DynamicMapVO.from(result)));
    }

    @GetMapping("/check-running/{workflowId}")
    @SaCheckPermission("workflow:definition:view")
    public R<DynamicMapVO> checkRunningInstances(@PathVariable String workflowId) {
        log.info("检查流程运行实例, workflowId={}", workflowId);

        // 仅流程创建者或管理员可查看运行实例状态，避免越权探测流程活跃情况
        ensureWorkflowOwnerOrAdmin(workflowId);
        boolean hasRunning = versionService.hasRunningInstances(workflowId);

        Map<String, Object> result = new HashMap<>();
        result.put("hasRunningInstances", hasRunning);
        result.put("workflowId", workflowId);

        return R.ok(DynamicMapVO.from(result));
    }

    private void ensureWorkflowOwnerOrAdmin(String workflowId) {
        Long currentUserId = UserContext.getUserId();
        Long currentTenantId = UserContext.getTenantId();
        if (currentUserId == null) {
            throw new PermissionDeniedException("用户未登录");
        }

        WfProcessDefinition definition = definitionMapper.selectById(workflowId);
        if (definition == null) {
            throw WorkflowException.processNotFound(workflowId);
        }
        if (currentTenantId != null && !Objects.equals(currentTenantId, definition.getTenantId())) {
            throw new PermissionDeniedException("租户不匹配");
        }

        boolean isCreator = Objects.equals(currentUserId.toString(), definition.getCreateBy());
        boolean isAdmin = permissionService.isAdmin(currentUserId);
        if (!isCreator && !isAdmin) {
            throw new PermissionDeniedException("仅流程创建者或管理员可访问版本数据");
        }
    }

}
