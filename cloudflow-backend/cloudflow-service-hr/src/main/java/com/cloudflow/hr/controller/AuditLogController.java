package com.cloudflow.hr.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.AuditLogQueryDTO;
import com.cloudflow.hr.domain.vo.AuditLogVO;
import com.cloudflow.hr.service.AuditLogService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 审计日志控制器。
 */
@Slf4j
@RestController
@RequestMapping("/audit-log")
@RequiredArgsConstructor
@Tag(name = "审计日志管理", description = "审计日志查询接口")
public class AuditLogController {

    private final AuditLogService auditLogService;

    @PostMapping("/query")
    @Operation(summary = "查询审计日志", description = "根据条件分页查询审计日志")
    public R<Page<AuditLogVO>> queryAuditLogs(@RequestBody AuditLogQueryDTO queryDTO) {
        log.info("查询审计日志，条件: {}", queryDTO);
        return R.ok(auditLogService.queryAuditLogs(queryDTO));
    }

    @GetMapping("/{id}")
    @Operation(summary = "查询审计日志详情", description = "根据ID查询审计日志详情")
    public R<AuditLogVO> getAuditLogById(@PathVariable Long id) {
        log.info("查询审计日志详情，ID: {}", id);
        AuditLogVO auditLog = auditLogService.getAuditLogById(id);
        if (auditLog == null) {
            return R.fail("审计日志不存在");
        }
        return R.ok(auditLog);
    }

    @PostMapping("/archive")
    @Operation(summary = "手动归档日志", description = "手动触发日志归档任务")
    public R<Integer> archiveOldLogs(@RequestParam(defaultValue = "90") int days) {
        log.info("手动触发日志归档，保留天数: {}", days);
        try {
            int archived = auditLogService.archiveOldLogs(days);
            R<Integer> result = R.ok(archived);
            result.setMsg("归档成功，共归档 " + archived + " 条日志");
            return result;
        } catch (Exception e) {
            log.error("日志归档失败", e);
            return R.fail("日志归档失败: " + e.getMessage());
        }
    }

    @DeleteMapping("/archived")
    @Operation(summary = "删除已归档日志", description = "手动删除已归档的旧日志")
    public R<Integer> deleteArchivedLogs(@RequestParam(defaultValue = "365") int days) {
        log.info("手动删除已归档日志，保留天数: {}", days);
        try {
            int deleted = auditLogService.deleteArchivedLogs(days);
            R<Integer> result = R.ok(deleted);
            result.setMsg("删除成功，共删除 " + deleted + " 条日志");
            return result;
        } catch (Exception e) {
            log.error("删除已归档日志失败", e);
            return R.fail("删除已归档日志失败: " + e.getMessage());
        }
    }
}
