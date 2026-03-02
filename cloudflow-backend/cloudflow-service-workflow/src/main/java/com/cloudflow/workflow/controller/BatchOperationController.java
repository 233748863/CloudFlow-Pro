package com.cloudflow.workflow.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.dto.*;
import com.cloudflow.workflow.service.IArchiveService;
import com.cloudflow.workflow.util.SafetyChecker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

/**
 * 批量操作控制器
 * 提供流程批量归档、恢复、删除等功能
 *
 * @author CloudFlow
 */
@Slf4j
@RestController
@RequestMapping("/batch")
public class BatchOperationController {

    @Autowired
    private IArchiveService archiveService;

    @Autowired
    private SafetyChecker safetyChecker;

    /**
     * 批量归档流程（管理员权限）
     *
     * @param request 批量归档请求
     * @return 批量操作结果
     */
    @PostMapping("/archive")
    @PreAuthorize("hasAnyRole('admin', 'ADMIN')")
    public R<BatchOperationResultDTO> archiveWorkflows(@RequestBody BatchArchiveRequest request) {
        log.info("批量归档流程: workflowIds={}, reason={}", request.getWorkflowIds(), request.getReason());

        if (request.getWorkflowIds() == null || request.getWorkflowIds().isEmpty()) {
            return R.fail("流程 ID 列表不能为空");
        }

        if (request.getReason() == null || request.getReason().trim().isEmpty()) {
            return R.fail("归档原因不能为空");
        }

        BatchOperationResultDTO result = archiveService.archiveWorkflows(
            request.getWorkflowIds(),
            request.getReason()
        );

        return R.ok(result);
    }

    /**
     * 获取归档流程列表（管理员权限）
     *
     * @param keyword 关键词（流程名称或归档原因）
     * @param archivedAfter 归档时间起始
     * @param archivedBefore 归档时间结束
     * @param pageNum 页码
     * @param pageSize 每页大小
     * @return 归档流程分页列表
     */
    @GetMapping("/archived")
    @PreAuthorize("hasAnyRole('admin', 'ADMIN')")
    public R<Page<ArchivedWorkflowDTO>> listArchivedWorkflows(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate archivedAfter,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate archivedBefore,
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) {

        log.info("查询归档流程列表: keyword={}, archivedAfter={}, archivedBefore={}, pageNum={}, pageSize={}",
            keyword, archivedAfter, archivedBefore, pageNum, pageSize);

        // 前端使用日期控件传 yyyy-MM-dd，这里统一转换为当天起止时间，避免时分秒格式不一致导致筛选失效
        LocalDateTime archivedAfterDateTime = archivedAfter != null ? archivedAfter.atStartOfDay() : null;
        LocalDateTime archivedBeforeDateTime = archivedBefore != null ? archivedBefore.atTime(LocalTime.MAX) : null;

        Page<ArchivedWorkflowDTO> page = archiveService.listArchivedWorkflows(
            keyword,
            archivedAfterDateTime,
            archivedBeforeDateTime,
            pageNum,
            pageSize
        );

        return R.ok(page);
    }

    /**
     * 批量恢复归档流程（管理员权限）
     *
     * @param request 批量恢复请求
     * @return 批量操作结果
     */
    @PostMapping("/restore")
    @PreAuthorize("hasAnyRole('admin', 'ADMIN')")
    public R<BatchOperationResultDTO> restoreWorkflows(@RequestBody BatchRestoreRequest request) {
        log.info("批量恢复归档流程: workflowIds={}", request.getWorkflowIds());

        if (request.getWorkflowIds() == null || request.getWorkflowIds().isEmpty()) {
            return R.fail("流程 ID 列表不能为空");
        }

        BatchOperationResultDTO result = archiveService.restoreWorkflows(request.getWorkflowIds());

        return R.ok(result);
    }

    /**
     * 永久删除流程（管理员权限）
     *
     * @param request 批量删除请求
     * @return 批量操作结果
     */
    @DeleteMapping("/permanent")
    @PreAuthorize("hasAnyRole('admin', 'ADMIN')")
    public R<BatchOperationResultDTO> permanentDeleteWorkflows(@RequestBody BatchDeleteRequest request) {
        log.info("永久删除流程: workflowIds={}, confirmed={}",
            request.getWorkflowIds(), request.getConfirmed());

        if (request.getWorkflowIds() == null || request.getWorkflowIds().isEmpty()) {
            return R.fail("流程 ID 列表不能为空");
        }

        // 要求用户确认
        if (request.getConfirmed() == null || !request.getConfirmed()) {
            return R.fail("永久删除操作需要确认，请设置 confirmed 为 true");
        }

        BatchOperationResultDTO result = archiveService.permanentDeleteWorkflows(request.getWorkflowIds());

        return R.ok(result);
    }

    /**
     * 检查流程是否可以安全归档/删除
     *
     * @param workflowIds 流程 ID 列表
     * @return 安全检查结果
     */
    @PostMapping("/check-safety")
    @PreAuthorize("hasAnyRole('admin', 'ADMIN')")
    public R<SafetyCheckResultDTO> checkOperationSafety(@RequestBody BatchIdsRequest request) {
        List<String> workflowIds = request != null ? request.getWorkflowIds() : null;
        log.info("安全检查: workflowIds={}", workflowIds);

        if (workflowIds == null || workflowIds.isEmpty()) {
            return R.fail("流程 ID 列表不能为空");
        }

        SafetyCheckResultDTO result = safetyChecker.checkSafety(workflowIds);

        return R.ok(result);
    }
}
