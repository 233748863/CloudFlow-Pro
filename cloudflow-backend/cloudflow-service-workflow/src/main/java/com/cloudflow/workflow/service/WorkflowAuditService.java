package com.cloudflow.workflow.service;

import com.cloudflow.common.core.context.UserContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import com.cloudflow.common.core.utils.RedisCache;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;

/**
 * S.3: 操作审计日志服务
 * 记录工作流系统中的关键操作，用于安全审计和问题追踪
 */
@Service
public class WorkflowAuditService {

    private static final Logger auditLog = LoggerFactory.getLogger("WORKFLOW_AUDIT");

    @Autowired
    private RedisCache redisCache;

    /**
     * 审计事件类型枚举
     */
    public enum AuditAction {
        // 流程定义操作
        DEFINITION_CREATE("流程定义创建"),
        DEFINITION_UPDATE("流程定义更新"),
        DEFINITION_DEPLOY("流程定义发布"),
        DEFINITION_DELETE("流程定义删除"),
        
        // 表单定义操作
        FORM_CREATE("表单定义创建"),
        FORM_UPDATE("表单定义更新"),
        
        // 流程实例操作
        PROCESS_START("流程启动"),
        PROCESS_RECALL("流程撤回"),
        PROCESS_COMPLETE("流程完成"),
        PROCESS_REJECT("流程拒绝"),
        PROCESS_PAUSE("流程暂停"),
        PROCESS_RESUME("流程恢复"),
        PROCESS_INVALIDATE("流程作废"),
        
        // 任务操作
        TASK_COMPLETE("任务完成"),
        TASK_REJECT("任务驳回"),
        TASK_DELEGATE("任务转办"),
        TASK_URGE("任务催办"),
        TASK_READ("任务已读"),
        TASK_TIMEOUT("任务超时自动处理"),
        
        // 权限操作
        PERMISSION_DENIED("权限拒绝"),
        RATE_LIMIT_HIT("限流触发");

        private final String description;

        AuditAction(String description) {
            this.description = description;
        }

        public String getDescription() {
            return description;
        }
    }

    /**
     * 记录审计日志（异步执行，不影响主流程性能）
     *
     * @param action    操作类型
     * @param targetId  操作目标ID（如流程实例ID、任务ID等）
     * @param detail    操作详情
     */
    @Async("workflowExecutor")
    public void log(AuditAction action, String targetId, String detail) {
        try {
            Long userId = UserContext.getUserId();
            String userName = UserContext.getUserName();
            
            Map<String, Object> auditEntry = new HashMap<>();
            auditEntry.put("timestamp", new Date());
            auditEntry.put("action", action.name());
            auditEntry.put("actionDesc", action.getDescription());
            auditEntry.put("userId", userId);
            auditEntry.put("userName", userName);
            auditEntry.put("targetId", targetId);
            auditEntry.put("detail", detail);
            auditEntry.put("ip", getClientIp());
            
            // 1. 写入结构化日志（可被 ELK/Loki 等日志系统采集）
            auditLog.info("AUDIT|{}|{}|{}|{}|{}|{}", 
                action.name(), userId, userName, targetId, detail, getClientIp());
            
            // 2. 写入 Redis 最近操作记录（保留最近1000条，用于监控大屏）
            String redisKey = "sys:wf:audit:recent";
            try {
                redisCache.setCacheZSet(redisKey, 
                    String.format("%s|%s|%s|%s|%s", action.name(), userId, targetId, detail, System.currentTimeMillis()),
                    (double) System.currentTimeMillis());
                
                // 保持最近1000条记录，清理旧数据
                long totalCount = redisCache.getCacheZSetSize(redisKey);
                if (totalCount > 1000) {
                    redisCache.removeRangeByScore(redisKey, 0, System.currentTimeMillis() - 7 * 24 * 3600 * 1000L);
                }
            } catch (Exception e) {
                // Redis 写入失败不影响审计日志
            }
            
            // 3. 统计计数（用于监控指标）
            incrementActionCounter(action);
            
        } catch (Exception e) {
            // 审计日志记录失败不应影响业务流程
            auditLog.warn("审计日志记录失败: action={}, targetId={}, error={}", action, targetId, e.getMessage());
        }
    }

    /**
     * 记录审计日志（简化版，无详情）
     */
    @Async("workflowExecutor")
    public void log(AuditAction action, String targetId) {
        log(action, targetId, null);
    }

    /**
     * 记录权限拒绝事件（安全审计重点关注）
     */
    @Async("workflowExecutor")
    public void logPermissionDenied(String resource, String operation) {
        Long userId = UserContext.getUserId();
        String detail = String.format("用户[%s]尝试对资源[%s]执行[%s]操作被拒绝", userId, resource, operation);
        auditLog.warn("SECURITY|PERMISSION_DENIED|{}|{}|{}|{}", userId, resource, operation, getClientIp());
        log(AuditAction.PERMISSION_DENIED, resource, detail);
    }

    /**
     * 记录限流触发事件
     */
    @Async("workflowExecutor")
    public void logRateLimitHit(String operation) {
        Long userId = UserContext.getUserId();
        String detail = String.format("用户[%s]触发[%s]操作限流", userId, operation);
        auditLog.warn("SECURITY|RATE_LIMIT|{}|{}|{}", userId, operation, getClientIp());
        log(AuditAction.RATE_LIMIT_HIT, operation, detail);
    }

    /**
     * 递增操作计数器（用于 M.2 监控指标）
     */
    private void incrementActionCounter(AuditAction action) {
        try {
            String counterKey = "sys:wf:metrics:action:" + action.name();
            redisCache.increment(counterKey);
            
            // 每日计数
            String dailyKey = "sys:wf:metrics:daily:" + action.name() + ":" + 
                new java.text.SimpleDateFormat("yyyyMMdd").format(new Date());
            redisCache.increment(dailyKey);
            redisCache.expire(dailyKey, 30, java.util.concurrent.TimeUnit.DAYS);
        } catch (Exception e) {
            // 计数失败不影响业务
        }
    }

    /**
     * 获取客户端IP（简化实现）
     */
    private String getClientIp() {
        try {
            // 实际项目中应从 HttpServletRequest 获取
            // 这里返回占位值
            return "unknown";
        } catch (Exception e) {
            return "unknown";
        }
    }
}
