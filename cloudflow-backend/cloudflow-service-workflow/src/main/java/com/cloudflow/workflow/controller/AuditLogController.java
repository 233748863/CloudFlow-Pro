package com.cloudflow.workflow.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.dto.AuditLogDTO;
import com.cloudflow.workflow.service.IAuditLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;

/**
 * 审计日志控制器
 * 提供审计日志查询功能
 * 
 * @author CloudFlow
 */
@Slf4j
@RestController
@RequestMapping("/audit-logs")
public class AuditLogController {

    @Autowired
    private IAuditLogService auditLogService;

    /**
     * 查询审计日志列表（管理员权限）
     * 
     * @param operationType 操作类型（可选）
     * @param targetType 操作对象类型（可选）
     * @param operatorId 操作人 ID（可选）
     * @param startTime 开始时间（可选）
     * @param endTime 结束时间（可选）
     * @param pageNum 页码
     * @param pageSize 每页大小
     * @return 审计日志分页列表
     */
    @GetMapping
    @SaCheckPermission("workflow:audit:list")
    public R<Page<AuditLogDTO>> listAuditLogs(
            @RequestParam(required = false) String operationType,
            @RequestParam(required = false) String targetType,
            @RequestParam(required = false) String operatorId,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime,
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "20") int pageSize) {
        
        log.info("查询审计日志列表: operationType={}, targetType={}, operatorId={}, startTime={}, endTime={}, pageNum={}, pageSize={}",
            operationType, targetType, operatorId, startTime, endTime, pageNum, pageSize);

        Page<AuditLogDTO> page = auditLogService.listAuditLogs(
            operationType,
            targetType,
            operatorId,
            startTime,
            endTime,
            pageNum,
            pageSize
        );

        return R.ok(page);
    }

    /**
     * 获取审计日志详情（管理员权限）
     * 
     * @param id 审计日志 ID
     * @return 审计日志详情
     */
    @GetMapping("/{id}")
    @SaCheckPermission("workflow:audit:list")
    public R<AuditLogDTO> getAuditLog(@PathVariable String id) {
        log.info("获取审计日志详情: id={}", id);

        AuditLogDTO auditLog = auditLogService.getAuditLog(id);
        if (auditLog == null) {
            return R.fail("审计日志不存在");
        }

        return R.ok(auditLog);
    }

    /**
     * 删除过期的审计日志（管理员权限）
     * 
     * @param daysToKeep 保留天数
     * @return 删除的记录数
     */
    @DeleteMapping("/expired")
    @SaCheckPermission("workflow:audit:remove")
    public R<Integer> deleteExpiredLogs(@RequestParam(defaultValue = "90") int daysToKeep) {
        log.info("删除过期的审计日志: daysToKeep={}", daysToKeep);

        if (daysToKeep < 30) {
            return R.fail("保留天数不能少于 30 天");
        }

        int count = auditLogService.deleteExpiredLogs(daysToKeep);

        return R.ok(count);
    }
}
