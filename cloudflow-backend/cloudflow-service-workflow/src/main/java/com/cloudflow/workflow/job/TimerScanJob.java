package com.cloudflow.workflow.job;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.service.IWfInstanceService;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * 定时节点扫描任务（完整版）
 *
 * 定时扫描 Redis ZSet 中的定时任务，触发到期的定时节点继续流转。
 * 通过调用 IWfInstanceService.continueFromTimerNode() 实现完整的流程引擎流转，
 * 支持定时节点基于 nodes+edges 图模型继续流转。
 *
 * 核心流程：
 * 1. 每分钟扫描 Redis ZSet（sys:wf:timers），获取 score <= 当前时间的到期任务
 * 2. 对每个到期任务，从 Redis 读取定时任务数据（instanceId、nodeKey、variables）
 * 3. 设置系统用户上下文，调用 continueFromTimerNode 触发流程引擎流转
 * 4. 流转失败时执行 fallback 逻辑，并发送失败通知
 * 5. 无论成功与否，都从 ZSet 中移除，避免重复处理
 *
 * @author CloudFlow
 */
@Component
public class TimerScanJob {

    private static final Logger log = LoggerFactory.getLogger(TimerScanJob.class);

    /** 定时任务 ZSet Key，score 为触发时间戳 */
    private static final String TIMER_ZSET_KEY = "sys:wf:timers";

    /** 兜底默认值：失败重试次数上限（实际值从 sys.workflow.timerMaxRetry 读取） */
    private static final int DEFAULT_MAX_RETRY_COUNT = 3;

    @Autowired
    private RedisCache redisCache;

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;

    @Autowired
    private IWfInstanceService instanceService;

    @Autowired
    private com.cloudflow.workflow.service.ISysNoticeService sysNoticeService;

    @Autowired
    private SysConfigHelper sysConfigHelper;

    private int maxRetryCount() {
        return sysConfigHelper.getConfigInt("sys.workflow.timerMaxRetry", DEFAULT_MAX_RETRY_COUNT);
    }

    private int retryIntervalMinutes() {
        return sysConfigHelper.getConfigInt("sys.workflow.timerRetryInterval", 2);
    }

    /**
     * 每分钟扫描一次定时任务
     * 使用分布式锁防止多实例重复执行
     */
    @DistributedJob(name = "timer-scan-job", lockTime = 55)
    @Scheduled(fixedRate = 60000)
    public void scanTimerTasks() {
        String lockKey = "lock:scheduled:scanTimerTasks";
        RLock lock = redissonClient.getLock(lockKey);

        try {
            // 尝试获取锁，最多等待1秒，锁定50秒后自动释放
            if (lock.tryLock(1, 50, TimeUnit.SECONDS)) {
                try {
                    long now = System.currentTimeMillis();

                    List<Long> tenantIds = resolveTimerTenantIds();
                    for (Long tenantId : tenantIds) {
                        // MP TenantLineInnerInterceptor 只读 TenantContext，
                        // 历史代码错写 UserContext 导致定时任务跨租户裸跑，统一切到 broker。
                        TenantBroker.runAs(tenantId, tid -> {
                            Set<Object> expiredTimerKeys = redisCache.getCacheZSetByScoreRange(TIMER_ZSET_KEY, 0, (double) now);
                            if (expiredTimerKeys == null || expiredTimerKeys.isEmpty()) {
                                return;
                            }

                            log.info("[TimerScanJob] 发现 {} 个到期的定时任务, tenantId={}", expiredTimerKeys.size(), tid);

                            for (Object timerKeyObj : expiredTimerKeys) {
                                String timerKey = normalizeTimerKey(timerKeyObj);
                                try {
                                    handleExpiredTimer(timerKey);
                                } catch (Exception e) {
                                    log.error("[TimerScanJob] 处理定时任务失败, tenantId={}, timerKey={}, error={}",
                                            tid, timerKey, e.getMessage(), e);
                                }
                                redisCache.removeCacheZSet(TIMER_ZSET_KEY, timerKey);
                            }
                        });
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
     * 处理单个到期的定时任务（完整版）
     *
     * 通过调用 IWfInstanceService.continueFromTimerNode() 触发完整的流程引擎流转，
     * 确保定时节点的图模型出边都能正确处理。
     *
     * 处理流程：
     * 1. 从 Redis 读取定时任务数据
     * 2. 校验流程实例是否仍在运行
     * 3. 设置系统用户上下文（定时任务没有真实用户，使用流程发起人身份）
     * 4. 调用 continueFromTimerNode 触发流转
     * 5. 失败时执行 fallback + 发送通知
     * 6. 清理 Redis 中的定时任务数据
     */
    @SuppressWarnings("unchecked")
    private void handleExpiredTimer(String timerKey) {
        // 1. 从 Redis 获取定时任务数据
        Map<String, Object> timerData = redisCache.getCacheObject(timerKey);
        if (timerData == null) {
            log.warn("[TimerScanJob] 定时任务数据不存在（可能已被处理或已过期）, timerKey={}", timerKey);
            return;
        }

        String instanceId = (String) timerData.get("instanceId");
        String nodeKey = (String) timerData.get("nodeKey");
        Map<String, Object> variables = null;

        // 安全地提取变量（Redis 反序列化可能返回 LinkedHashMap）
        Object varsObj = timerData.get("variables");
        if (varsObj instanceof Map) {
            variables = (Map<String, Object>) varsObj;
        }

        log.info("[TimerScanJob] 开始处理定时任务, instanceId={}, nodeKey={}, timerKey={}",
            instanceId, nodeKey, timerKey);

        // 2. 校验流程实例是否仍在运行
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            log.warn("[TimerScanJob] 流程实例不存在, instanceId={}", instanceId);
            cleanupTimerData(timerKey);
            return;
        }

        if (!"RUNNING".equals(instance.getStatus())) {
            log.warn("[TimerScanJob] 流程实例状态非 RUNNING，跳过处理, instanceId={}, status={}",
                instanceId, instance.getStatus());
            cleanupTimerData(timerKey);
            return;
        }

        // 3. 设置系统用户上下文
        // 定时任务没有真实用户会话，使用流程发起人身份执行
        // 这样后续节点（如通知节点）可以正确获取操作者信息
        try {
            Long operatorId = instance.getStartUserId() != null ? instance.getStartUserId() : 0L;
            String operatorName = instance.getStartUserName() != null ? instance.getStartUserName() : "系统定时任务";
            UserContext.setUserId(operatorId);
            UserContext.setUserName(operatorName);

            // 4. 调用完整的流程引擎进行流转
            // continueFromTimerNode 内部会：
            //   - 再次校验实例状态
            //   - 从流程定义中找到定时节点
            //   - 合并变量
            //   - 通过 advanceAfterNode 继续流转（基于图模型出边）
            //   - 使用分布式锁防并发
            //   - 保存快照和审计日志
            instanceService.continueFromTimerNode(instanceId, nodeKey, variables);

            log.info("[TimerScanJob] 定时任务处理完成，流程已继续流转, instanceId={}, nodeKey={}", instanceId, nodeKey);

            // 5. 通知发起人定时节点已触发
            sendTimerTriggeredNotification(instance, nodeKey, timerData);

        } catch (Exception e) {
            log.error("[TimerScanJob] 调用流程引擎处理定时任务失败, instanceId={}, nodeKey={}, error={}",
                instanceId, nodeKey, e.getMessage(), e);

            // 6. 执行 fallback 逻辑
            handleTimerFallback(instance, nodeKey, timerData, e);

        } finally {
            // 7. 清理 Redis 中的定时任务数据
            cleanupTimerData(timerKey);

            // 8. 清理用户上下文
            UserContext.clear();
        }
    }

    /**
     * 定时任务处理失败的 fallback 逻辑
     *
     * 当 continueFromTimerNode 调用失败时：
     * 1. 检查是否可以重试（通过 Redis 计数器记录重试次数）
     * 2. 如果未超过重试上限，将任务重新放回 ZSet，延迟2分钟后重试
     * 3. 如果已超过重试上限，发送失败通知给管理员和发起人
     */
    private void handleTimerFallback(WfProcessInstance instance, String nodeKey,
                                      Map<String, Object> timerData, Exception error) {
        try {
            String retryKey = "sys:wf:timer:retry:" + instance.getInstanceId() + ":" + nodeKey;
            long retryCount = redisCache.increment(retryKey);

            // 设置重试计数器过期时间（1小时）
            if (retryCount == 1) {
                redisCache.expire(retryKey, 1, TimeUnit.HOURS);
            }

            int maxRetry = maxRetryCount();
            if (retryCount <= maxRetry) {
                // 未超过重试上限，重新放回 ZSet，按配置的重试间隔重试
                long retryTime = System.currentTimeMillis() + retryIntervalMinutes() * 60 * 1000L;
                String timerKey = "sys:wf:timer:" + instance.getInstanceId() + ":" + nodeKey;

                // 重新注册定时任务数据（可能已被清理）
                redisCache.setCacheObject(timerKey, timerData, 30, TimeUnit.MINUTES);
                redisCache.setCacheZSet(TIMER_ZSET_KEY, timerKey, (double) retryTime);

                log.warn("[TimerScanJob] 定时任务处理失败，已安排重试 ({}/{}), instanceId={}, nodeKey={}, retryTime={}",
                    retryCount, maxRetry, instance.getInstanceId(), nodeKey,
                    new java.util.Date(retryTime));
            } else {
                // 超过重试上限，发送失败通知
                log.error("[TimerScanJob] 定时任务处理失败且已超过重试上限 ({}/{}), instanceId={}, nodeKey={}",
                    retryCount, maxRetry, instance.getInstanceId(), nodeKey);

                // 清理重试计数器
                redisCache.deleteObject(retryKey);

                // 通知管理员
                sendTimerFailureNotification(instance, nodeKey, error);
            }
        } catch (Exception e) {
            log.error("[TimerScanJob] fallback 逻辑执行失败, instanceId={}, error={}",
                instance.getInstanceId(), e.getMessage(), e);
        }
    }

    /**
     * 发送定时节点触发成功通知
     * 通知流程发起人定时节点已到期并继续流转
     */
    private void sendTimerTriggeredNotification(WfProcessInstance instance, String nodeKey,
                                                 Map<String, Object> timerData) {
        try {
            if (instance.getStartUserId() == null) {
                return;
            }

            // 构建通知内容
            String timerType = timerData != null ? (String) timerData.getOrDefault("timerType", "DELAY") : "DELAY";
            String content;
            if ("SCHEDULE".equals(timerType)) {
                String scheduleTime = timerData != null ? (String) timerData.get("scheduleTime") : "";
                content = String.format("您发起的流程「%s」中的定时节点已到达预定时间（%s），流程已继续流转。",
                    instance.getTitle(), scheduleTime);
            } else {
                content = String.format("您发起的流程「%s」中的延迟节点已到期，流程已继续流转。",
                    instance.getTitle());
            }

            sysNoticeService.sendNotice(
                instance.getStartUserId(),
                "定时节点触发通知",
                content,
                "1",
                0L,
                "系统定时任务"
            );
        } catch (Exception e) {
            log.warn("[TimerScanJob] 发送定时触发通知失败: {}", e.getMessage());
        }
    }

    /**
     * 发送定时任务处理失败通知
     * 通知管理员和流程发起人定时任务处理失败
     */
    private void sendTimerFailureNotification(WfProcessInstance instance, String nodeKey, Exception error) {
        try {
            String errorMsg = error != null ? error.getMessage() : "未知错误";
            String content = String.format(
                "流程「%s」(实例ID: %s) 的定时节点「%s」处理失败，已超过最大重试次数(%d次)。\n错误信息: %s\n请管理员手动处理。",
                instance.getTitle(), instance.getInstanceId(), nodeKey, maxRetryCount(), errorMsg);

            // 通知管理员（userId=1）
            sysNoticeService.sendNotice(
                1L,
                "【告警】定时节点处理失败",
                content,
                "2",
                0L,
                "系统定时任务"
            );

            // 通知流程发起人
            if (instance.getStartUserId() != null && instance.getStartUserId() != 1L) {
                sysNoticeService.sendNotice(
                    instance.getStartUserId(),
                    "流程定时节点处理异常",
                    String.format("您发起的流程「%s」中的定时节点处理异常，系统正在处理中，如有疑问请联系管理员。",
                        instance.getTitle()),
                    "2",
                    0L,
                    "系统定时任务"
                );
            }
        } catch (Exception e) {
            log.warn("[TimerScanJob] 发送失败通知失败: {}", e.getMessage());
        }
    }

    /**
     * 清理 Redis 中的定时任务数据
     */
    private void cleanupTimerData(String timerKey) {
        try {
            redisCache.deleteObject(timerKey);
        } catch (Exception e) {
            log.warn("[TimerScanJob] 清理定时任务数据失败, timerKey={}, error={}", timerKey, e.getMessage());
        }
    }

    private List<Long> resolveTimerTenantIds() {
        Collection<String> prefixedKeys = redisCache.keys("*:" + TIMER_ZSET_KEY);
        Set<Long> tenantIds = new LinkedHashSet<>();
        if (prefixedKeys != null) {
            for (String fullKey : prefixedKeys) {
                int separatorIndex = fullKey.indexOf(':');
                if (separatorIndex <= 0) {
                    continue;
                }
                String tenantPrefix = fullKey.substring(0, separatorIndex);
                try {
                    tenantIds.add(Long.valueOf(tenantPrefix));
                } catch (NumberFormatException e) {
                    log.warn("[TimerScanJob] 无法解析定时任务租户前缀: {}", fullKey);
                }
            }
        }
        if (tenantIds.isEmpty()) {
            tenantIds.add(null);
        }
        return new ArrayList<>(tenantIds);
    }

    private String normalizeTimerKey(Object timerKeyObj) {
        if (timerKeyObj == null) {
            return null;
        }
        String timerKey = timerKeyObj.toString();
        if (timerKey.length() >= 2 && timerKey.startsWith("\"") && timerKey.endsWith("\"")) {
            return timerKey.substring(1, timerKey.length() - 1);
        }
        return timerKey;
    }

    /**
     * 每天凌晨3点清理过期的定时任务 Key
     * 防止 Redis 内存泄漏
     * 使用分布式锁防止多实例重复执行
     */
    @DistributedJob(name = "timer-scan-cleanup-job", lockTime = 120)
    @Scheduled(cron = "0 0 3 * * ?")
    public void cleanupExpiredTimerKeys() {
        String lockKey = "lock:scheduled:cleanupExpiredTimerKeys";
        RLock lock = redissonClient.getLock(lockKey);

        try {
            // 尝试获取锁，最多等待1秒，锁定60秒后自动释放
            if (lock.tryLock(1, 60, TimeUnit.SECONDS)) {
                try {
                    log.info("[TimerScanJob] 开始清理过期定时任务 Key");

                    // 清理定时任务 ZSet 中的异常数据（score 为 0 或负数）
                    redisCache.removeCacheZSetByScoreRange(TIMER_ZSET_KEY, Double.NEGATIVE_INFINITY, 0);

                    // 清理超过7天的定时任务数据（这些任务应该早已被处理）
                    long sevenDaysAgo = System.currentTimeMillis() - 7 * 24 * 60 * 60 * 1000L;
                    redisCache.removeCacheZSetByScoreRange(TIMER_ZSET_KEY, 0, (double) sevenDaysAgo);

                    // 清理过期的重试计数器
                    // 重试计数器 Key 格式: sys:wf:timer:retry:*
                    // 这些 Key 已设置了1小时过期时间，此处为兜底清理

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
