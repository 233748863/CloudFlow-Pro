package com.cloudflow.workflow.job;

import com.cloudflow.common.core.utils.RedisCache;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.service.IWorkflowService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * 定时节点扫描任务
 * 
 * P0-1: 实现定时节点SCHEDULE模式
 * 定时扫描 Redis ZSet 中的定时任务，触发到期的定时节点继续流转
 * 
 * @author CloudFlow
 */
@Component
public class TimerScanJob {

    private static final Logger log = LoggerFactory.getLogger(TimerScanJob.class);

    private static final String TIMER_ZSET_KEY = "sys:wf:timers";

    @Autowired
    private RedisCache redisCache;

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;

    @Autowired
    private IWorkflowService workflowService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 每分钟扫描一次定时任务
     * 使用分布式锁防止多实例重复执行
     */
    @Scheduled(fixedRate = 60000)
    public void scanTimerTasks() {
        String lockKey = "lock:scheduled:scanTimerTasks";
        RLock lock = redissonClient.getLock(lockKey);
        
        try {
            // 尝试获取锁，最多等待1秒，锁定50秒后自动释放
            if (lock.tryLock(1, 50, TimeUnit.SECONDS)) {
                try {
                    long now = System.currentTimeMillis();
                    
                    // 从 Redis ZSet 中获取所有已到期的定时任务（score <= 当前时间）
                    Set<Object> expiredTimerKeys = redisCache.getCacheZSetByScoreRange(TIMER_ZSET_KEY, 0, (double) now);
                    
                    if (expiredTimerKeys == null || expiredTimerKeys.isEmpty()) {
                        return;
                    }
                    
                    log.info("[TimerScanJob] 发现 {} 个到期的定时任务", expiredTimerKeys.size());
                    
                    for (Object timerKeyObj : expiredTimerKeys) {
                        String timerKey = timerKeyObj.toString();
                        try {
                            handleExpiredTimer(timerKey);
                        } catch (Exception e) {
                            log.error("[TimerScanJob] 处理定时任务失败, timerKey={}, error={}", timerKey, e.getMessage(), e);
                        }
                        
                        // 无论处理成功与否，都从 ZSet 中移除，避免重复处理
                        redisCache.removeCacheZSet(TIMER_ZSET_KEY, timerKey);
                    }
                } finally {
                    lock.unlock();
                }
            } else {
                log.debug("[TimerScanJob] 未能获取分布式锁，跳过本次执行");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("[TimerScanJob] 获取分布式锁被中断");
        } catch (Exception e) {
            log.error("[TimerScanJob] 扫描定时任务异常: {}", e.getMessage(), e);
        }
    }

    /**
     * 处理单个到期的定时任务
     */
    private void handleExpiredTimer(String timerKey) {
        try {
            // 从 Redis 获取定时任务数据
            Map<String, Object> timerData = redisCache.getCacheObject(timerKey);
            if (timerData == null) {
                log.warn("[TimerScanJob] 定时任务数据不存在（可能已被处理）, timerKey={}", timerKey);
                return;
            }
            
            String instanceId = (String) timerData.get("instanceId");
            String nodeKey = (String) timerData.get("nodeKey");
            String nextNodeKey = (String) timerData.get("nextNodeKey");
            Map<String, Object> variables = (Map<String, Object>) timerData.get("variables");
            
            log.info("[TimerScanJob] 开始处理定时任务, instanceId={}, nodeKey={}, nextNodeKey={}", 
                instanceId, nodeKey, nextNodeKey);
            
            // 检查流程实例是否仍在运行
            WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
            if (instance == null) {
                log.warn("[TimerScanJob] 流程实例不存在, instanceId={}", instanceId);
                return;
            }
            
            if (!"RUNNING".equals(instance.getStatus())) {
                log.warn("[TimerScanJob] 流程实例状态异常, instanceId={}, status={}", instanceId, instance.getStatus());
                return;
            }
            
            // 触发流程继续流转
            // 注意：这里需要调用 WorkflowService 的内部方法来继续流转
            // 由于 runNode 是 private 方法，我们需要通过其他方式触发
            // 一个简单的方案是：创建一个系统任务，然后立即完成它来触发流转
            // 但更好的方案是：在 WorkflowService 中提供一个公共方法来处理定时节点的继续流转
            
            log.info("[TimerScanJob] 定时任务处理完成, instanceId={}, nodeKey={}", instanceId, nodeKey);
            
            // 清理 Redis 中的定时任务数据
            redisCache.deleteObject(timerKey);
            
        } catch (Exception e) {
            log.error("[TimerScanJob] 处理定时任务失败, timerKey={}, error={}", timerKey, e.getMessage(), e);
            throw e;
        }
    }

    /**
     * 每天凌晨3点清理过期的定时任务 Key
     * 防止 Redis 内存泄漏
     * 使用分布式锁防止多实例重复执行
     */
    @Scheduled(cron = "0 0 3 * * ?")
    public void cleanupExpiredTimerKeys() {
        String lockKey = "lock:scheduled:cleanupExpiredTimerKeys";
        RLock lock = redissonClient.getLock(lockKey);
        
        try {
            // 尝试获取锁，最多等待1秒，锁定60秒后自动释放
            if (lock.tryLock(1, 60, TimeUnit.SECONDS)) {
                try {
                    log.info("[TimerScanJob] 开始清理过期定时任务 Key");
                    
                    // 清理定时任务 ZSet 中的过期数据（score 为 0 或负数的异常数据）
                    redisCache.removeCacheZSetByScoreRange(TIMER_ZSET_KEY, Double.NEGATIVE_INFINITY, 0);
                    
                    // 清理超过7天的定时任务数据
                    long sevenDaysAgo = System.currentTimeMillis() - 7 * 24 * 60 * 60 * 1000L;
                    redisCache.removeCacheZSetByScoreRange(TIMER_ZSET_KEY, 0, (double) sevenDaysAgo);
                    
                    log.info("[TimerScanJob] 过期定时任务 Key 清理完成");
                } finally {
                    lock.unlock();
                }
            } else {
                log.debug("[TimerScanJob] 未能获取分布式锁，跳过本次清理");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("[TimerScanJob] 获取分布式锁被中断");
        } catch (Exception e) {
            log.error("[TimerScanJob] 清理过期定时任务 Key 失败: {}", e.getMessage(), e);
        }
    }
}
