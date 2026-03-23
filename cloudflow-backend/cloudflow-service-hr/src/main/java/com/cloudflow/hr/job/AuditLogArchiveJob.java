package com.cloudflow.hr.job;

import com.cloudflow.hr.service.AuditLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 审计日志归档定时任务
 * 定期归档和清理旧的审计日志
 * 
 * @author CloudFlow
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AuditLogArchiveJob {
    
    private final AuditLogService auditLogService;
    
    /**
     * 日志归档保留天数（默认90天）
     */
    @Value("${hr.audit-log.archive-days:90}")
    private int archiveDays;
    
    /**
     * 已归档日志删除保留天数（默认365天）
     */
    @Value("${hr.audit-log.delete-days:365}")
    private int deleteDays;
    
    /**
     * 归档旧日志
     * 每天凌晨2点执行
     */
    @Scheduled(cron = "0 0 2 * * ?")
    public void archiveOldLogs() {
        log.info("开始执行审计日志归档任务，归档 {} 天前的日志", archiveDays);
        
        try {
            int archived = auditLogService.archiveOldLogs(archiveDays);
            log.info("审计日志归档任务完成，共归档 {} 条日志", archived);
        } catch (Exception e) {
            log.error("审计日志归档任务执行失败", e);
        }
    }
    
    /**
     * 删除已归档的旧日志
     * 每周日凌晨3点执行
     */
    @Scheduled(cron = "0 0 3 ? * SUN")
    public void deleteArchivedLogs() {
        log.info("开始执行已归档日志删除任务，删除 {} 天前的已归档日志", deleteDays);
        
        try {
            int deleted = auditLogService.deleteArchivedLogs(deleteDays);
            log.info("已归档日志删除任务完成，共删除 {} 条日志", deleted);
        } catch (Exception e) {
            log.error("已归档日志删除任务执行失败", e);
        }
    }
}
