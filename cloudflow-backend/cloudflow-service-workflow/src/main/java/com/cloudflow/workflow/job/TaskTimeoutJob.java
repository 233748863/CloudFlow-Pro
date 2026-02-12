package com.cloudflow.workflow.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.utils.RedisCache;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.service.IWorkflowService;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * 任务超时自动处理定时任务
 * 
 * P1-9: 实现任务超时自动处理
 * 定时扫描 Redis ZSet 中的超时任务，执行自动通过或自动拒绝
 * 
 * @author CloudFlow
 */
@Component
public class TaskTimeoutJob {

    private static final Logger log = LoggerFactory.getLogger(TaskTimeoutJob.class);

    private static final String TIMEOUT_ZSET_KEY = "sys:task:timeouts";

    @Autowired
    private RedisCache redisCache;

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private WfTaskMapper taskMapper;

    @Autowired
    private WfTaskHistoryMapper taskHistoryMapper;

    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;

    @Autowired
    private WfProcessDefinitionMapper processDefinitionMapper;

    @Autowired
    private com.cloudflow.workflow.service.ISysNoticeService sysNoticeService;
    
    @Autowired
    private IWorkflowService workflowService;

    /**
     * 每分钟扫描一次超时任务
     * 使用分布式锁防止多实例重复执行
     */
    @Scheduled(fixedRate = 60000)
    public void scanTimeoutTasks() {
        String lockKey = "lock:scheduled:scanTimeoutTasks";
        RLock lock = redissonClient.getLock(lockKey);
        
        try {
            // 尝试获取锁，最多等待1秒，锁定50秒后自动释放
            if (lock.tryLock(1, 50, TimeUnit.SECONDS)) {
                try {
                    long now = System.currentTimeMillis();
                    
                    // 从 Redis ZSet 中获取所有已超时的任务（score <= 当前时间）
                    Set<Object> timeoutTaskIds = redisCache.getCacheZSetByScoreRange(TIMEOUT_ZSET_KEY, 0, (double) now);
                    
                    if (timeoutTaskIds == null || timeoutTaskIds.isEmpty()) {
                        return;
                    }
                    
                    log.info("[TaskTimeoutJob] 发现 {} 个超时任务", timeoutTaskIds.size());
                    
                    for (Object taskIdObj : timeoutTaskIds) {
                        String taskId = taskIdObj.toString();
                        try {
                            handleTimeoutTask(taskId);
                        } catch (Exception e) {
                            log.error("[TaskTimeoutJob] 处理超时任务失败, taskId={}, error={}", taskId, e.getMessage(), e);
                        }
                        
                        // 无论处理成功与否，都从 ZSet 中移除，避免重复处理
                        redisCache.removeCacheZSet(TIMEOUT_ZSET_KEY, taskId);
                    }
                } finally {
                    lock.unlock();
                }
            } else {
                log.debug("[TaskTimeoutJob] 未能获取分布式锁，跳过本次执行");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("[TaskTimeoutJob] 获取分布式锁被中断");
        } catch (Exception e) {
            log.error("[TaskTimeoutJob] 扫描超时任务异常: {}", e.getMessage(), e);
        }
    }

    /**
     * 处理单个超时任务
     * 默认策略：自动通过（AUTO_PASS）
     * 使用完整的流程引擎进行流转，确保后续节点正常执行
     */
    @Transactional(rollbackFor = Exception.class)
    public void handleTimeoutTask(String taskId) {
        WfTask task = taskMapper.selectById(taskId);
        if (task == null) {
            log.warn("[TaskTimeoutJob] 超时任务不存在（可能已被处理）, taskId={}", taskId);
            return;
        }
        
        // 检查任务是否仍在待办状态
        if (!WfTaskStatus.TODO.getCode().equals(task.getStatus())) {
            log.info("[TaskTimeoutJob] 任务已被处理，跳过, taskId={}, status={}", taskId, task.getStatus());
            return;
        }
        
        log.info("[TaskTimeoutJob] 开始自动处理超时任务, taskId={}, nodeName={}", taskId, task.getNodeName());
        
        // 查找流程实例
        WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
        if (instance == null) {
            log.warn("[TaskTimeoutJob] 流程实例不存在, instanceId={}", task.getInstanceId());
            return;
        }
        
        try {
            // 设置系统用户上下文（用于权限校验和审计日志）
            // 使用任务的处理人ID作为操作者，如果没有则使用系统ID(0)
            Long operatorId = task.getAssignee() != null ? task.getAssignee() : 0L;
            String operatorName = "系统自动处理";
            
            // 临时设置用户上下文
            UserContext.setUserId(operatorId);
            UserContext.setUserName(operatorName);
            
            // 准备流程变量（可以根据需要添加超时标记）
            Map<String, Object> variables = new HashMap<>();
            variables.put("_autoProcessed", true);
            variables.put("_autoProcessReason", "任务超时自动通过");
            variables.put("_autoProcessTime", new Date());
            
            // 调用完整的流程引擎进行任务完成和流转
            // 这将触发完整的流程流转逻辑，包括：
            // 1. 保存历史记录
            // 2. 删除当前任务
            // 3. 解析流程定义
            // 4. 执行下一个节点（可能是审批节点、通知节点、脚本节点等）
            // 5. 如果到达流程末尾，自动完成流程
            workflowService.completeTask(
                taskId,
                "APPROVE",  // 自动通过
                "任务超时，系统自动通过",
                variables
            );
            
            log.info("[TaskTimeoutJob] 超时任务处理完成，流程已继续流转, taskId={}", taskId);
            
        } catch (Exception e) {
            log.error("[TaskTimeoutJob] 调用流程引擎处理超时任务失败, taskId={}, error={}", taskId, e.getMessage(), e);
            
            // 如果调用流程引擎失败，回退到简化处理逻辑
            log.warn("[TaskTimeoutJob] 回退到简化处理逻辑");
            handleTimeoutTaskFallback(task, instance);
            
        } finally {
            // 清理用户上下文
            UserContext.clear();
        }
        
        // 发送通知
        sendTimeoutNotifications(task, instance);
    }
    
    /**
     * 简化的超时任务处理逻辑（回退方案）
     * 当完整流程引擎调用失败时使用
     */
    private void handleTimeoutTaskFallback(WfTask task, WfProcessInstance instance) {
        try {
            // 1. 保存历史记录
            WfTaskHistory history = new WfTaskHistory();
            history.setHistoryId(UUID.randomUUID().toString());
            history.setTaskId(task.getTaskId());
            history.setInstanceId(task.getInstanceId());
            history.setNodeName(task.getNodeName());
            history.setNodeKey(task.getNodeKey());
            history.setOperatorId(0L); // 系统自动处理
            history.setOperatorName("系统自动处理");
            history.setComment("任务超时，系统自动通过（简化处理）");
            history.setAction("AUTO_PASS_FALLBACK");
            history.setCreateTime(new Date());
            taskHistoryMapper.insert(history);
            
            // 2. 删除当前任务
            taskMapper.deleteById(task.getTaskId());
            
            // 3. 检查是否还有其他待办任务
            Long remainingTasks = taskMapper.selectCount(
                new LambdaQueryWrapper<WfTask>()
                    .eq(WfTask::getInstanceId, instance.getInstanceId())
            );
            
            // 4. 如果没有其他待办任务，则完成流程
            if (remainingTasks == 0) {
                instance.setStatus(WfProcessStatus.COMPLETED.getCode());
                instance.setEndTime(new Date());
                processInstanceMapper.updateById(instance);
                log.info("[TaskTimeoutJob] 流程已自动完成（简化处理）, instanceId={}", instance.getInstanceId());
            }
            
        } catch (Exception e) {
            log.error("[TaskTimeoutJob] 简化处理逻辑也失败了, taskId={}, error={}", task.getTaskId(), e.getMessage(), e);
        }
    }
    
    /**
     * 发送超时通知
     */
    private void sendTimeoutNotifications(WfTask task, WfProcessInstance instance) {
        try {
            // 通知任务处理人
            if (task.getAssignee() != null) {
                sysNoticeService.sendNotice(
                    task.getAssignee(),
                    "任务超时自动处理通知",
                    "您的待办任务「" + task.getNodeName() + "」已超时，系统已自动通过处理。",
                    "2",
                    0L,
                    "系统"
                );
            }
            
            // 通知发起人
            if (instance.getStartUserId() != null && !instance.getStartUserId().equals(task.getAssignee())) {
                sysNoticeService.sendNotice(
                    instance.getStartUserId(),
                    "任务超时自动处理通知",
                    "流程「" + instance.getTitle() + "」中的任务「" + task.getNodeName() + "」已超时，系统已自动通过。",
                    "2",
                    0L,
                    "系统"
                );
            }
        } catch (Exception e) {
            log.warn("[TaskTimeoutJob] 发送超时通知失败: {}", e.getMessage());
        }
    }

    /**
     * 每天凌晨2点清理过期的 Redis Key
     * 防止 Redis 内存泄漏
     * 使用分布式锁防止多实例重复执行
     */
    @Scheduled(cron = "0 0 2 * * ?")
    public void cleanupExpiredKeys() {
        String lockKey = "lock:scheduled:cleanupExpiredKeys";
        RLock lock = redissonClient.getLock(lockKey);
        
        try {
            // 尝试获取锁，最多等待1秒，锁定60秒后自动释放
            if (lock.tryLock(1, 60, TimeUnit.SECONDS)) {
                try {
                    log.info("[TaskTimeoutJob] 开始清理过期 Redis Key");
                    
                    // 清理已完成流程的 join key
                    // 模式: sys:wf:join:*
                    // 注意: 这些 key 已设置了 1 小时过期时间，此处为兜底清理
                    
                    // 清理超时 ZSet 中的过期数据（score 为 0 或负数的异常数据）
                    redisCache.removeCacheZSetByScoreRange(TIMEOUT_ZSET_KEY, Double.NEGATIVE_INFINITY, 0);
                    
                    log.info("[TaskTimeoutJob] 过期 Redis Key 清理完成");
                } finally {
                    lock.unlock();
                }
            } else {
                log.debug("[TaskTimeoutJob] 未能获取分布式锁，跳过本次清理");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("[TaskTimeoutJob] 获取分布式锁被中断");
        } catch (Exception e) {
            log.error("[TaskTimeoutJob] 清理过期 Redis Key 失败: {}", e.getMessage(), e);
        }
    }
}
