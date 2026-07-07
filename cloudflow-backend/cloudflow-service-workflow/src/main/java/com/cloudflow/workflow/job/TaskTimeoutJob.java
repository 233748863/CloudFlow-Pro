package com.cloudflow.workflow.job;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.service.IWfTaskService;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * 任务超时自动处理定时任务
 *
 * P1-9: 实现任务超时自动处理
 * 定时扫描 Redis ZSet 中的超时任务，通过完整流程引擎（completeTask）执行自动通过。
 *
 * 失败语义：处理成功才从 ZSet 移除；失败退避 5 分钟后重试，
 * 连续失败达到上限后告警并放弃自动处理（转人工），不再使用绕过引擎的简化回退逻辑。
 *
 * @author CloudFlow
 */
@Component
public class TaskTimeoutJob {

    private static final Logger log = LoggerFactory.getLogger(TaskTimeoutJob.class);

    private static final String TIMEOUT_ZSET_KEY = "sys:task:timeouts";
    /** 处理失败重试计数 key 前缀（成功或放弃后删除） */
    private static final String RETRY_COUNT_KEY_PREFIX = "sys:task:timeout:retry:";
    /** 处理失败后的退避间隔（毫秒） */
    private static final long RETRY_BACKOFF_MS = 5 * 60 * 1000L;
    /** 最大自动重试次数，超过后告警转人工 */
    private static final int MAX_RETRIES = 3;

    @Autowired
    private RedisCache redisCache;

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private WfTaskMapper taskMapper;

    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;

    @Autowired
    private com.cloudflow.workflow.service.ISysNoticeService sysNoticeService;

    @Autowired
    private IWfTaskService taskService;

    /**
     * 每分钟扫描一次超时任务
     * 使用分布式锁防止多实例重复执行
     */
    @DistributedJob(name = "task-timeout-scan-job", lockTime = 55)
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
                        boolean success = false;
                        try {
                            handleTimeoutTask(taskId);
                            success = true;
                        } catch (Exception e) {
                            log.error("[TaskTimeoutJob] 处理超时任务失败, taskId={}, error={}", taskId, e.getMessage(), e);
                        }

                        if (success) {
                            // 处理成功（含任务已不存在/已被处理的幂等场景）才移除
                            redisCache.removeCacheZSet(TIMEOUT_ZSET_KEY, taskId);
                            redisCache.deleteObject(RETRY_COUNT_KEY_PREFIX + taskId);
                        } else {
                            handleProcessingFailure(taskId);
                        }
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
     * 处理失败：退避重试；连续失败达到上限后告警并放弃自动处理（转人工）
     */
    private void handleProcessingFailure(String taskId) {
        long retries;
        try {
            retries = redisCache.increment(RETRY_COUNT_KEY_PREFIX + taskId);
        } catch (Exception e) {
            log.warn("[TaskTimeoutJob] 记录重试计数失败, taskId={}: {}", taskId, e.getMessage());
            retries = 1;
        }

        if (retries >= MAX_RETRIES) {
            log.error("[TaskTimeoutJob] 超时任务连续 {} 次自动处理失败，放弃自动处理并转人工, taskId={}", retries, taskId);
            redisCache.removeCacheZSet(TIMEOUT_ZSET_KEY, taskId);
            redisCache.deleteObject(RETRY_COUNT_KEY_PREFIX + taskId);
            notifyManualIntervention(taskId);
        } else {
            // 退避后重试：把 ZSet score 推迟到 5 分钟后
            redisCache.setCacheZSet(TIMEOUT_ZSET_KEY, taskId,
                    (double) (System.currentTimeMillis() + RETRY_BACKOFF_MS));
            log.warn("[TaskTimeoutJob] 超时任务处理失败，{} 分钟后重试 (第 {}/{} 次), taskId={}",
                    RETRY_BACKOFF_MS / 60000, retries, MAX_RETRIES, taskId);
        }
    }

    /**
     * 自动处理彻底失败后通知任务处理人与发起人转人工
     */
    private void notifyManualIntervention(String taskId) {
        try {
            WfTask task = TenantBroker.applyWithoutTenant(v -> taskMapper.selectById(taskId));
            if (task == null) {
                return;
            }
            TenantBroker.runAs(task.getTenantId(), tid -> {
                if (task.getAssignee() != null) {
                    sysNoticeService.sendNotice(task.getAssignee(), "超时任务自动处理失败",
                            "您的待办任务「" + task.getNodeName() + "」超时后系统自动处理失败，请尽快人工处理。",
                            "2", 0L, "系统");
                }
                WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
                if (instance != null && instance.getStartUserId() != null
                        && !instance.getStartUserId().equals(task.getAssignee())) {
                    sysNoticeService.sendNotice(instance.getStartUserId(), "超时任务自动处理失败",
                            "流程「" + instance.getTitle() + "」中的任务「" + task.getNodeName()
                                    + "」超时后系统自动处理失败，请联系处理人或管理员人工处理。",
                            "2", 0L, "系统");
                }
            });
        } catch (Exception e) {
            log.warn("[TaskTimeoutJob] 发送转人工通知失败, taskId={}: {}", taskId, e.getMessage());
        }
    }

    /**
     * 处理单个超时任务
     * 默认策略：自动通过（AUTO_PASS）
     * 通过完整的流程引擎（completeTask，内部自带任务锁与事务）进行流转，
     * 会签任务在 completeTask 内自动走会签投票通道。
     * 处理失败直接抛出，由调用方的退避重试机制接管。
     */
    private void handleTimeoutTask(String taskId) {
        // Job 线程无 HTTP 上下文：先跨租户读 task 拿 tenantId，再用 broker 包租户敏感分支。
        WfTask task = TenantBroker.applyWithoutTenant(v -> taskMapper.selectById(taskId));
        if (task == null) {
            log.warn("[TaskTimeoutJob] 超时任务不存在（可能已被处理）, taskId={}", taskId);
            return;
        }

        // 检查任务是否仍在待办状态
        if (!WfTaskStatus.TODO.getCode().equals(task.getStatus())) {
            log.info("[TaskTimeoutJob] 任务已被处理，跳过, taskId={}, status={}", taskId, task.getStatus());
            return;
        }

        log.info("[TaskTimeoutJob] 开始自动处理超时任务, taskId={}, nodeName={}, tenantId={}",
                taskId, task.getNodeName(), task.getTenantId());

        TenantBroker.runAs(task.getTenantId(), tid -> doHandleTimeoutTask(task));
    }

    private void doHandleTimeoutTask(WfTask task) {
        String taskId = task.getTaskId();
        // 查找流程实例
        WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
        if (instance == null) {
            log.warn("[TaskTimeoutJob] 流程实例不存在, instanceId={}", task.getInstanceId());
            return;
        }

        // 设置系统用户上下文（用于权限校验和审计日志），退出时恢复原值，避免线程池上下文污染
        Long prevUserId = UserContext.getUserId();
        String prevUserName = UserContext.getUserName();
        try {
            // 使用任务的处理人ID作为操作者，如果没有则使用系统ID(0)
            Long operatorId = task.getAssignee() != null ? task.getAssignee() : 0L;
            UserContext.setUserId(operatorId);
            UserContext.setUserName("系统自动处理");

            // 准备流程变量（超时标记）
            Map<String, Object> variables = new HashMap<>();
            variables.put("_autoProcessed", true);
            variables.put("_autoProcessReason", "任务超时自动通过");
            variables.put("_autoProcessTime", LocalDateTime.now());

            // 调用完整的流程引擎进行任务完成和流转（保存历史、删除任务、解析定义、执行下一节点）
            taskService.completeTask(
                taskId,
                "APPROVE",  // 自动通过
                "任务超时，系统自动通过",
                variables,
                null  // delegateUserId: 非转办操作
            );

            log.info("[TaskTimeoutJob] 超时任务处理完成，流程已继续流转, taskId={}", taskId);
        } finally {
            UserContext.setUserId(prevUserId);
            UserContext.setUserName(prevUserName);
        }

        // 处理成功后发送通知
        sendTimeoutNotifications(task, instance);
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
    @DistributedJob(name = "task-timeout-cleanup-job", lockTime = 120)
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
