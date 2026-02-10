package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.*;
import com.cloudflow.workflow.domain.dto.*;
import com.cloudflow.workflow.service.IDeployEnhancementService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 流程发布增强Controller
 * 包含：发布窗口、发布通知、回滚机制、发布审批流
 */
@Tag(name = "流程发布增强")
@RestController
@RequestMapping("/deploy")
public class DeployEnhancementController {

    @Autowired
    private IDeployEnhancementService deployEnhancementService;

    // ==================== 发布窗口管理 ====================

    @Operation(summary = "检查当前是否在发布窗口内")
    @GetMapping("/window/check")
    public R<Map<String, Object>> checkDeployWindow() {
        return deployEnhancementService.checkDeployWindow();
    }

    @Operation(summary = "获取所有发布窗口配置")
    @GetMapping("/window/list")
    @PreAuthorize("hasRole('ADMIN')")
    public R<List<WfDeployWindow>> listDeployWindows() {
        return deployEnhancementService.listDeployWindows();
    }

    @Operation(summary = "创建发布窗口配置")
    @PostMapping("/window/save")
    @PreAuthorize("hasRole('ADMIN')")
    public R<?> saveDeployWindow(@RequestBody DeployWindowDTO dto) {
        return deployEnhancementService.saveDeployWindow(dto);
    }

    @Operation(summary = "更新发布窗口配置")
    @PutMapping("/window/update")
    @PreAuthorize("hasRole('ADMIN')")
    public R<?> updateDeployWindow(@RequestBody DeployWindowDTO dto) {
        return deployEnhancementService.updateDeployWindow(dto);
    }

    @Operation(summary = "删除发布窗口配置")
    @DeleteMapping("/window/delete/{windowId}")
    @PreAuthorize("hasRole('ADMIN')")
    public R<?> deleteDeployWindow(@PathVariable("windowId") Long windowId) {
        return deployEnhancementService.deleteDeployWindow(windowId);
    }

    @Operation(summary = "启用/禁用发布窗口")
    @PutMapping("/window/toggle/{windowId}")
    @PreAuthorize("hasRole('ADMIN')")
    public R<?> toggleDeployWindow(@PathVariable("windowId") Long windowId, @RequestParam("enabled") Boolean enabled) {
        return deployEnhancementService.toggleDeployWindow(windowId, enabled);
    }

    // ==================== 发布通知 ====================

    @Operation(summary = "发送发布通知")
    @PostMapping("/notification/send/{deployId}")
    @PreAuthorize("hasRole('ADMIN')")
    public R<?> sendDeployNotification(@PathVariable("deployId") Long deployId,
                                       @RequestBody List<NotificationConfigDTO> configs) {
        return deployEnhancementService.sendDeployNotification(deployId, configs);
    }

    @Operation(summary = "查询发布通知记录")
    @GetMapping("/notification/list/{deployId}")
    public R<List<WfDeployNotification>> listDeployNotifications(@PathVariable("deployId") Long deployId) {
        return deployEnhancementService.listDeployNotifications(deployId);
    }

    @Operation(summary = "重发失败的通知")
    @PostMapping("/notification/resend/{deployId}")
    @PreAuthorize("hasRole('ADMIN')")
    public R<?> resendFailedNotifications(@PathVariable("deployId") Long deployId) {
        return deployEnhancementService.resendFailedNotifications(deployId);
    }

    // ==================== 回滚机制 ====================

    @Operation(summary = "执行版本回滚")
    @PostMapping("/rollback")
    @PreAuthorize("hasRole('ADMIN')")
    public R<?> rollbackDeploy(@RequestBody RollbackRequestDTO dto) {
        return deployEnhancementService.rollbackDeploy(dto);
    }

    @Operation(summary = "获取可回滚的版本列表")
    @GetMapping("/rollback/versions/{processDefId}")
    public R<List<WfProcessVersionSnapshot>> listRollbackVersions(@PathVariable("processDefId") String processDefId) {
        return deployEnhancementService.listRollbackVersions(processDefId);
    }

    @Operation(summary = "查询回滚历史")
    @GetMapping("/rollback/history/{processDefId}")
    public R<List<WfDeployRollbackHistory>> listRollbackHistory(@PathVariable("processDefId") String processDefId) {
        return deployEnhancementService.listRollbackHistory(processDefId);
    }

    @Operation(summary = "获取版本快照详情")
    @GetMapping("/snapshot/{processDefId}/{version}")
    public R<WfProcessVersionSnapshot> getVersionSnapshot(@PathVariable("processDefId") String processDefId,
                                                          @PathVariable("version") Integer version) {
        return deployEnhancementService.getVersionSnapshot(processDefId, version);
    }

    @Operation(summary = "发布影响分析")
    @GetMapping("/impact/analyze/{processDefId}")
    public R<ImpactAnalysisDTO> analyzeDeployImpact(@PathVariable("processDefId") String processDefId) {
        return deployEnhancementService.analyzeDeployImpact(processDefId);
    }

    // ==================== 发布审批流 ====================

    @Operation(summary = "提交发布审批")
    @PostMapping("/approval/submit/{definitionId}")
    @PreAuthorize("hasRole('ADMIN')")
    public R<?> submitDeployApproval(@PathVariable("definitionId") String definitionId,
                                     @RequestBody DeployApprovalDTO dto) {
        return deployEnhancementService.submitDeployApproval(definitionId, dto);
    }

    @Operation(summary = "审批发布请求")
    @PostMapping("/approval/approve/{approvalId}/{stepId}")
    public R<?> approveDeployRequest(@PathVariable("approvalId") Long approvalId,
                                     @PathVariable("stepId") Long stepId,
                                     @RequestParam("action") String action,
                                     @RequestParam(value = "comment", required = false) String comment) {
        return deployEnhancementService.approveDeployRequest(approvalId, stepId, action, comment);
    }

    @Operation(summary = "查询待审批的发布请求")
    @GetMapping("/approval/pending")
    public R<List<WfDeployApproval>> listPendingApprovals() {
        Long userId = UserContext.getUserId();
        return deployEnhancementService.listPendingApprovals(userId);
    }

    @Operation(summary = "查询审批详情")
    @GetMapping("/approval/detail/{approvalId}")
    public R<Map<String, Object>> getApprovalDetail(@PathVariable("approvalId") Long approvalId) {
        return deployEnhancementService.getApprovalDetail(approvalId);
    }

    @Operation(summary = "取消发布审批")
    @PostMapping("/approval/cancel/{approvalId}")
    public R<?> cancelDeployApproval(@PathVariable("approvalId") Long approvalId) {
        return deployEnhancementService.cancelDeployApproval(approvalId);
    }

    @Operation(summary = "查询我提交的审批")
    @GetMapping("/approval/my-submitted")
    public R<List<WfDeployApproval>> listMySubmittedApprovals() {
        Long userId = UserContext.getUserId();
        return deployEnhancementService.listMySubmittedApprovals(userId);
    }

    @Operation(summary = "获取发布统计信息")
    @GetMapping("/statistics/{processDefId}")
    public R<Map<String, Object>> getDeployStatistics(@PathVariable("processDefId") String processDefId) {
        return deployEnhancementService.getDeployStatistics(processDefId);
    }
}
