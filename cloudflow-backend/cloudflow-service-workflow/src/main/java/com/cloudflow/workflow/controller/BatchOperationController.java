package com.cloudflow.workflow.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.dto.ArchivedWorkflowDTO;
import com.cloudflow.workflow.domain.dto.BatchArchiveRequest;
import com.cloudflow.workflow.domain.dto.BatchDeleteRequest;
import com.cloudflow.workflow.domain.dto.BatchIdsRequest;
import com.cloudflow.workflow.domain.dto.BatchOperationResultDTO;
import com.cloudflow.workflow.domain.dto.BatchRestoreRequest;
import com.cloudflow.workflow.domain.dto.SafetyCheckResultDTO;
import com.cloudflow.workflow.service.IArchiveService;
import com.cloudflow.workflow.util.SafetyChecker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;

/**
 * 批量操作控制器。
 * 提供流程批量归档、恢复、删除等功能。
 */
@Slf4j
@RestController
@RequestMapping("/batch")
public class BatchOperationController {

    private static final DateTimeFormatter ARCHIVE_DATE_TIME_FORMATTER =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Autowired
    private IArchiveService archiveService;

    @Autowired
    private SafetyChecker safetyChecker;

    /**
     * 批量归档流程（管理员权限）。
     */
    @RepeatSubmit
    @PostMapping("/archive")
    @SaCheckPermission("workflow:batch:manage")
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
     * 获取归档流程列表（管理员权限）。
     */
    @GetMapping("/archived")
    @SaCheckPermission("workflow:batch:manage")
    public R<Page<ArchivedWorkflowDTO>> listArchivedWorkflows(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String archivedAfter,
            @RequestParam(required = false) String archivedBefore,
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) {

        log.info("查询归档流程列表: keyword={}, archivedAfter={}, archivedBefore={}, pageNum={}, pageSize={}",
            keyword, archivedAfter, archivedBefore, pageNum, pageSize);

        LocalDateTime archivedAfterDateTime;
        LocalDateTime archivedBeforeDateTime;
        try {
            // 兼容三种输入格式：yyyy-MM-dd HH:mm:ss、ISO、yyyy-MM-dd
            archivedAfterDateTime = parseDateTime(archivedAfter, false);
            archivedBeforeDateTime = parseDateTime(archivedBefore, true);
        } catch (IllegalArgumentException ex) {
            return R.fail("归档时间格式错误，支持 yyyy-MM-dd HH:mm:ss、ISO 或 yyyy-MM-dd");
        }

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
     * 批量恢复归档流程（管理员权限）。
     */
    @RepeatSubmit
    @PostMapping("/restore")
    @SaCheckPermission("workflow:batch:manage")
    public R<BatchOperationResultDTO> restoreWorkflows(@RequestBody BatchRestoreRequest request) {
        log.info("批量恢复归档流程: workflowIds={}", request.getWorkflowIds());

        if (request.getWorkflowIds() == null || request.getWorkflowIds().isEmpty()) {
            return R.fail("流程 ID 列表不能为空");
        }

        BatchOperationResultDTO result = archiveService.restoreWorkflows(request.getWorkflowIds());

        return R.ok(result);
    }

    /**
     * 永久删除流程（管理员权限）。
     */
    @DeleteMapping("/permanent")
    @SaCheckPermission("workflow:batch:manage")
    public R<BatchOperationResultDTO> permanentDeleteWorkflows(@RequestBody BatchDeleteRequest request) {
        log.info("永久删除流程: workflowIds={}, confirmed={}",
            request.getWorkflowIds(), request.getConfirmed());

        if (request.getWorkflowIds() == null || request.getWorkflowIds().isEmpty()) {
            return R.fail("流程 ID 列表不能为空");
        }

        if (request.getConfirmed() == null || !request.getConfirmed()) {
            return R.fail("永久删除操作需要确认，请设置 confirmed 为 true");
        }

        BatchOperationResultDTO result = archiveService.permanentDeleteWorkflows(request.getWorkflowIds());

        return R.ok(result);
    }

    /**
     * 检查流程是否可以安全归档/删除。
     */
    @PostMapping("/check-safety")
    @SaCheckPermission("workflow:batch:manage")
    public R<SafetyCheckResultDTO> checkOperationSafety(@RequestBody BatchIdsRequest request) {
        List<String> workflowIds = request != null ? request.getWorkflowIds() : null;
        log.info("安全检查: workflowIds={}", workflowIds);

        if (workflowIds == null || workflowIds.isEmpty()) {
            return R.fail("流程 ID 列表不能为空");
        }

        SafetyCheckResultDTO result = safetyChecker.checkSafety(workflowIds);

        return R.ok(result);
    }

    /**
     * 解析归档时间参数。
     * endOfDay=true 时，日期格式（yyyy-MM-dd）会扩展为当天 23:59:59.999999999。
     */
    private LocalDateTime parseDateTime(String value, boolean endOfDay) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }

        String trimmed = value.trim();
        try {
            return LocalDateTime.parse(trimmed, ARCHIVE_DATE_TIME_FORMATTER);
        } catch (DateTimeParseException ignored) {
            // 继续尝试下一种格式
        }

        try {
            return LocalDateTime.parse(trimmed, DateTimeFormatter.ISO_DATE_TIME);
        } catch (DateTimeParseException ignored) {
            // 继续尝试下一种格式
        }

        try {
            LocalDate date = LocalDate.parse(trimmed, DateTimeFormatter.ISO_LOCAL_DATE);
            return endOfDay ? date.atTime(LocalTime.MAX) : date.atStartOfDay();
        } catch (DateTimeParseException ignored) {
            // 统一抛出格式错误
        }

        throw new IllegalArgumentException(
            "归档时间格式错误，支持 yyyy-MM-dd HH:mm:ss、ISO(如 2026-03-02T10:00:00) 或 yyyy-MM-dd");
    }
}
