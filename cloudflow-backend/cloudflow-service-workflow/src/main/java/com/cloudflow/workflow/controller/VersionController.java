package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WorkflowVersion;
import com.cloudflow.workflow.domain.dto.RollbackVersionRequest;
import com.cloudflow.workflow.domain.dto.VersionComparisonDTO;
import com.cloudflow.workflow.domain.dto.VersionDTO;
import com.cloudflow.workflow.domain.dto.VersionDetailDTO;
import com.cloudflow.workflow.service.IVersionComparisonService;
import com.cloudflow.workflow.service.IVersionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 流程版本控制器
 * 提供版本管理的 REST API
 * 
 * @author CloudFlow
 */
@Slf4j
@RestController
@RequestMapping("/api/workflow/versions")
public class VersionController {

    @Autowired
    private IVersionService versionService;

    @Autowired
    private IVersionComparisonService comparisonService;

    /**
     * 获取流程的版本历史列表
     * 
     * @param workflowId 流程ID
     * @return 版本历史列表
     */
    @GetMapping("/workflow/{workflowId}")
    public R<List<VersionDTO>> getVersionHistory(@PathVariable String workflowId) {
        log.info("查询流程版本历史, workflowId={}", workflowId);
        
        // TODO: 权限验证 - 只有流程创建者和管理员可以查看
        
        List<VersionDTO> versions = versionService.getVersionHistory(workflowId);
        return R.ok(versions);
    }

    /**
     * 获取特定版本的详细信息
     * 
     * @param versionId 版本ID
     * @return 版本详情
     */
    @GetMapping("/{versionId}")
    public R<VersionDetailDTO> getVersionDetail(@PathVariable String versionId) {
        log.info("查询版本详情, versionId={}", versionId);
        
        // TODO: 权限验证 - 只有流程创建者和管理员可以查看
        
        VersionDetailDTO detail = versionService.getVersionDetail(versionId);
        return R.ok(detail);
    }

    /**
     * 对比两个版本的差异
     * 
     * @param fromVersionId 源版本ID
     * @param toVersionId 目标版本ID
     * @return 版本对比结果
     */
    @GetMapping("/compare")
    public R<VersionComparisonDTO> compareVersions(
            @RequestParam String fromVersionId,
            @RequestParam String toVersionId) {
        log.info("对比版本, fromVersionId={}, toVersionId={}", fromVersionId, toVersionId);
        
        // TODO: 权限验证 - 只有流程创建者和管理员可以查看
        
        VersionComparisonDTO comparison = comparisonService.compareVersions(fromVersionId, toVersionId);
        return R.ok(comparison);
    }

    /**
     * 回滚到指定版本（管理员权限）
     * 
     * @param request 回滚请求
     * @return 回滚结果
     */
    @PostMapping("/rollback")
    @PreAuthorize("hasRole('ADMIN')")
    public R<Map<String, Object>> rollbackToVersion(@RequestBody RollbackVersionRequest request) {
        log.info("回滚流程版本, workflowId={}, targetVersionId={}", 
            request.getWorkflowId(), request.getTargetVersionId());

        // 获取当前用户ID
        String operatorId = UserContext.getUserId() != null ? 
            UserContext.getUserId().toString() : "system";

        // 检查是否有运行中的实例
        boolean hasRunning = versionService.hasRunningInstances(request.getWorkflowId());
        
        // 如果有运行实例且不是强制回滚，返回警告
        if (hasRunning && !Boolean.TRUE.equals(request.getForceRollback())) {
            Map<String, Object> warning = new HashMap<>();
            warning.put("hasRunningInstances", true);
            warning.put("message", "该流程有正在运行的实例，回滚可能影响运行中的流程");
            warning.put("requireConfirmation", true);
            return R.fail(400, "需要确认：该流程有正在运行的实例");
        }

        // 执行回滚
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

        return R.ok(result);
    }

    /**
     * 检查流程是否有运行中的实例
     * 
     * @param workflowId 流程ID
     * @return 检查结果
     */
    @GetMapping("/check-running/{workflowId}")
    public R<Map<String, Object>> checkRunningInstances(@PathVariable String workflowId) {
        log.info("检查流程运行实例, workflowId={}", workflowId);
        
        boolean hasRunning = versionService.hasRunningInstances(workflowId);
        
        Map<String, Object> result = new HashMap<>();
        result.put("hasRunningInstances", hasRunning);
        result.put("workflowId", workflowId);
        
        return R.ok(result);
    }
}
