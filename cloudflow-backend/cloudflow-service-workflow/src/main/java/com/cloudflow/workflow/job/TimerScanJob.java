package com.cloudflow.workflow.job;

import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.service.IWfInstanceService;
import com.cloudflow.workflow.service.TimerSchedulerService;
import com.cloudflow.workflow.service.TimerFailureNotifications;
import com.cloudflow.workflow.service.WorkflowWaitState;
import com.cloudflow.common.tenant.support.TenantIterator;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
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
 * 1. 平台默认每3分钟扫描各租户Redis ZSet（sys:wf:timers），获取到期任务
 * 2. 对每个到期任务，从 Redis 读取定时任务数据（instanceId、nodeKey、variables）
 * 3. 设置系统用户上下文，调用 continueFromTimerNode 触发流程引擎流转
 * 4. 流转失败时执行 fallback 逻辑，并发送失败通知
 * 5. 仅成功/放弃/陈旧任务清理 ZSet；已安排重试的任务保留重试入口
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
    private SysConfigHelper sysConfigHelper;

    @Autowired
    private TimerSchedulerService timerScheduler;

    @Autowired
    private TimerFailureNotifications timerFailureNotifications;

    @Autowired
    private TenantIterator tenantIterator;

    private enum TimerProcessResult {
        SUCCESS(false),
        RETRY_SCHEDULED(false),
        GIVE_UP(true),
        STALE(true);

        private final boolean cleanup;

        TimerProcessResult(boolean cleanup) {
            this.cleanup = cleanup;
        }

        private boolean shouldCleanup() {
            return cleanup;
        }
    }

    private int maxRetryCount() {
        return sysConfigHelper.getConfigInt("sys.workflow.timerMaxRetry", DEFAULT_MAX_RETRY_COUNT);
    }

    private int retryIntervalMinutes() {
        return sysConfigHelper.getConfigInt("sys.workflow.timerRetryInterval", 2);
    }

    /**
     * 平台默认每3分钟扫描一次定时任务
     * 使用分布式锁防止多实例重复执行
     */
    @DistributedJob(name = "timer-scan-job", lockTime = 55)
    @JobHandler(value = "timerScan", desc = "定时节点扫描")
    public JobResult scanTimerTasks() {
        RLock lock = redissonClient.getLock("lock:scheduled:scanTimerTasks");
        boolean acquired = false;
        try {
            // 不设置固定租期，扫描与持久等待恢复期间自动续锁。
            acquired = lock.tryLock(1, TimeUnit.SECONDS);
            if (!acquired) return skipped("定时节点扫描已有任务执行，已跳过");
            long now = System.currentTimeMillis();
            List<RuntimeException> failures = new ArrayList<>();
            int[] counts = new int[3];
            for (Long tenantId : resolveTimerTenantIds()) {
                try {
                    TenantBroker.runAs(tenantId, ignored -> {
                        try {
                            restorePersistentWaits(failures);
                        } catch (RuntimeException failure) {
                            failures.add(new IllegalStateException("持久等待读取失败，租户：" + tenantId, failure));
                        }
                        Set<Object> due = redisCache.getCacheZSetByScoreRange(TIMER_ZSET_KEY, 0, (double) now);
                        if (due == null) return;
                        for (Object member : due) {
                            String key = normalizeTimerKey(member);
                            try {
                                TimerProcessResult result = handleExpiredTimer(key);
                                if (result.shouldCleanup()) {
                                    cleanupTimerData(key);
                                    counts[1] += Math.toIntExact(redisCache.removeCacheZSet(TIMER_ZSET_KEY, member));
                                } else if (result == TimerProcessResult.SUCCESS) {
                                    counts[0]++;
                                } else {
                                    counts[2]++;
                                }
                            } catch (RuntimeException failure) {
                                failures.add(new IllegalStateException("定时节点处理失败，租户：" + tenantId + "，条目：" + key, failure));
                            }
                        }
                    });
                } catch (RuntimeException failure) {
                    failures.add(new IllegalStateException("定时节点队列读取失败，租户：" + tenantId, failure));
                }
            }
            throwFailures("定时节点扫描", failures);
            return JobResult.success(counts[0], "定时节点扫描完成：处理" + counts[0] + "项，移除失效" + counts[1] + "项，暂缓" + counts[2] + "项");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("定时节点扫描获取锁被中断", e);
        } finally {
            if (acquired && lock.isHeldByCurrentThread()) lock.unlock();
        }
    }

    private static JobResult skipped(String message) {
        return JobResult.builder().executeStatus("SKIPPED").affectedRows(0).resultMsg(message).build();
    }

    private static void throwFailures(String operation, List<RuntimeException> failures) {
        if (failures.isEmpty()) return;
        IllegalStateException failure = new IllegalStateException(operation + "存在失败项：" + failures.size() + "项");
        failures.forEach(failure::addSuppressed);
        throw failure;
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
     * 6. 返回处理结果，由扫描循环统一决定是否清理 Redis 数据和 ZSet
     */
    private TimerProcessResult handleExpiredTimer(String timerKey) {
        // 1. 从 Redis 获取定时任务数据
        Map<String, Object> timerData = redisCache.getCacheObject(timerKey);
        if (timerData == null) {
            log.warn("[TimerScanJob] 定时任务数据不存在（可能已被处理或已过期）, timerKey={}", timerKey);
            return TimerProcessResult.STALE;
        }

        String instanceId = (String) timerData.get("instanceId");
        String nodeKey = (String) timerData.get("nodeKey");
        if (instanceId == null || instanceId.trim().isEmpty() || nodeKey == null || nodeKey.trim().isEmpty()) {
            log.warn("[TimerScanJob] 定时任务数据缺少 instanceId/nodeKey，清理异常任务, timerKey={}", timerKey);
            return TimerProcessResult.GIVE_UP;
        }
        log.info("[TimerScanJob] 开始处理定时任务, instanceId={}, nodeKey={}, timerKey={}",
            instanceId, nodeKey, timerKey);

        // 2. 校验流程实例是否仍在运行
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null || !java.util.Objects.equals(instance.getTenantId(), UserContext.getTenantId())) {
            log.warn("[TimerScanJob] 流程实例不存在, instanceId={}", instanceId);
            return TimerProcessResult.STALE;
        }

        WorkflowWaitState.Pending pending = currentWait(instance, timerKey, timerData);
        if (pending == null || Boolean.TRUE.equals(pending.payload().get("notified"))) {
            return TimerProcessResult.STALE;
        }

        if ("PAUSED".equals(instance.getStatus()) || "FAILED".equals(instance.getStatus())) {
            return TimerProcessResult.RETRY_SCHEDULED;
        }
        if (!com.cloudflow.workflow.domain.enums.WfProcessStatus.isActive(instance.getStatus())) {
            log.warn("[TimerScanJob] 流程实例状态非 RUNNING，跳过处理, instanceId={}, status={}",
                instanceId, instance.getStatus());
            return TimerProcessResult.STALE;
        }

        // 3. 设置系统用户上下文
        // 定时任务没有真实用户会话，使用流程发起人身份执行
        // 这样后续节点（如通知节点）可以正确获取操作者信息
        Long previousUserId = UserContext.getUserId();
        String previousUserName = UserContext.getUserName();
        boolean continuationAttempted = false;
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
            if (Boolean.TRUE.equals(pending.payload().get("blocked"))) {
                return timerScheduler.notifyExhaustedTimer(instanceId, pending.waitId(), timerFailureNotifications::send)
                        ? TimerProcessResult.SUCCESS : TimerProcessResult.RETRY_SCHEDULED;
            }
            continuationAttempted = true;
            if (!instanceService.continueFromTimerNode(instanceId, nodeKey, timerData)) {
                return TimerProcessResult.RETRY_SCHEDULED;
            }

            log.info("[TimerScanJob] 定时任务处理完成，流程已继续流转, instanceId={}, nodeKey={}", instanceId, nodeKey);

            return TimerProcessResult.SUCCESS;

        } catch (Exception e) {
            try {
                WfProcessInstance latest = processInstanceMapper.selectById(instanceId);
                if (continuationAttempted && (latest == null || !("PAUSED".equals(latest.getStatus()) || "FAILED".equals(latest.getStatus())))) {
                    TimerProcessResult fallback = handleTimerFallback(instance, pending.waitId());
                    if (fallback.shouldCleanup()) {
                        cleanupTimerData(timerKey);
                        redisCache.removeCacheZSet(TIMER_ZSET_KEY, timerKey);
                    }
                }
            } catch (RuntimeException fallbackFailure) {
                e.addSuppressed(fallbackFailure);
            }
            throw new IllegalStateException("定时节点执行失败，已按现有规则处理重试", e);

        } finally {
            // 7. 清理用户上下文
            UserContext.setUserId(previousUserId);
            UserContext.setUserName(previousUserName);
        }
    }

    /**
     * 定时任务处理失败的 fallback 逻辑
     *
     * 当 continueFromTimerNode 调用失败时：
     * 1. 在原持久等待中记录重试次数
     * 2. 如果未超过重试上限，将任务重新放回 ZSet，延迟2分钟后重试
     * 3. 如果已超过重试上限，发送失败通知给管理员和发起人
     */
    private TimerProcessResult handleTimerFallback(WfProcessInstance instance, String waitId) {
        try {
            boolean retried = timerScheduler.retryPendingTimer(instance.getInstanceId(), waitId, maxRetryCount(), retryIntervalMinutes());
            if (!retried) timerScheduler.notifyExhaustedTimer(instance.getInstanceId(), waitId, timerFailureNotifications::send);
            return retried ? TimerProcessResult.RETRY_SCHEDULED : TimerProcessResult.GIVE_UP;
        } catch (Exception e) {
            throw new IllegalStateException("定时节点重试安排失败", e);
        }
    }

    /** 缓存只作持久等待的索引，不能独立触发、重试或通知。 */
    private WorkflowWaitState.Pending currentWait(WfProcessInstance instance, String key, Map<String, Object> data) {
        if (!(data.get("waitId") instanceof String waitId) || waitId.isBlank()) return null;
        WorkflowWaitState.Pending pending = WorkflowWaitState.find(instance, waitId);
        if (pending == null || !"TIMER".equals(pending.kind())
                || !java.util.Objects.equals(pending.nodeKey(), data.get("nodeKey"))
                || !java.util.Objects.equals(pending.executionContext(), data.get("executionContext"))
                || !TimerSchedulerService.timerKey(instance.getInstanceId(), pending).equals(key)) return null;
        return pending;
    }

    /**
     * 清理 Redis 中的定时任务数据
     */
    private void cleanupTimerData(String timerKey) {
        if (timerKey != null) redisCache.deleteObject(timerKey);
    }

    private List<Long> resolveTimerTenantIds() {
        com.cloudflow.common.job.config.JobInvocationContext.Execution execution =
                com.cloudflow.common.job.config.JobInvocationContext.execution();
        if (execution != null && Set.of("timerScan", "timerScanCleanup").contains(execution.handlerName())) {
            return tenantIterator.listActiveTenantIds();
        }
        Long currentTenant = com.cloudflow.common.tenant.TenantContext.getTenantId();
        if (currentTenant != null) return List.of(currentTenant);
        return tenantIterator.listActiveTenantIds();
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

    private void restorePersistentWaits(List<RuntimeException> failures) {
        String afterId = "";
        while (true) {
            List<WfProcessInstance> instances = processInstanceMapper.selectWaitingInstances(
                    com.cloudflow.common.tenant.TenantContext.getTenantId(), afterId, 100);
            for (WfProcessInstance instance : instances) {
                for (WorkflowWaitState.Pending pending : WorkflowWaitState.list(instance, null)) {
                    try {
                        if ("TIMER".equals(pending.kind())) timerScheduler.scheduleAfterCommit(instance, pending);
                        if ("SUBPROCESS".equals(pending.kind())) {
                            WfProcessInstance child = processInstanceMapper.selectById(pending.waitId());
                            if (child != null && com.cloudflow.workflow.domain.enums.WfProcessStatus.fromCode(child.getStatus()).isTerminal()) {
                                instanceService.handleSubprocessFinished(instance.getInstanceId(), pending.nodeKey(), child.getInstanceId(), child.getStatus());
                            }
                        }
                    } catch (RuntimeException failure) {
                        failures.add(new IllegalStateException("持久等待恢复失败，租户：" + UserContext.getTenantId()
                                + "，实例：" + instance.getInstanceId() + "，节点：" + pending.nodeKey(), failure));
                    }
                }
            }
            if (instances.size() < 100) return;
            afterId = instances.get(instances.size() - 1).getInstanceId();
        }
    }

    /**
     * 每天凌晨3点清理过期的定时任务 Key
     * 防止 Redis 内存泄漏
     * 使用分布式锁防止多实例重复执行
     */
    @DistributedJob(name = "timer-scan-cleanup-job", lockTime = 120)
    @JobHandler(value = "timerScanCleanup", desc = "清理定时节点键")
    public JobResult cleanupExpiredTimerKeys() {
        RLock lock = redissonClient.getLock("lock:scheduled:cleanupExpiredTimerKeys");
        boolean acquired = false;
        try {
            acquired = lock.tryLock(1, TimeUnit.SECONDS);
            if (!acquired) return skipped("定时节点清理已有任务执行，已跳过");
            List<RuntimeException> failures = new ArrayList<>();
            int[] removed = new int[1];
            for (Long tenantId : resolveTimerTenantIds()) {
                try {
                    TenantBroker.runAs(tenantId, ignored -> removed[0] += cleanupStaleTimers(failures));
                } catch (RuntimeException failure) {
                    failures.add(new IllegalStateException("定时节点清理读取失败，租户：" + tenantId, failure));
                }
            }
            throwFailures("定时节点清理", failures);
            return JobResult.success(removed[0], "定时节点清理完成：移除" + removed[0] + "条失效记录");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("定时节点清理获取锁被中断", e);
        } finally {
            if (acquired && lock.isHeldByCurrentThread()) lock.unlock();
        }
    }
    private int cleanupStaleTimers(List<RuntimeException> failures) {
        Set<Object> timers = redisCache.getCacheZSetByScoreRange(TIMER_ZSET_KEY, Double.NEGATIVE_INFINITY, Double.POSITIVE_INFINITY);
        if (timers == null) return 0;
        int removed = 0;
        for (Object entry : timers) {
            String key = normalizeTimerKey(entry);
            try {
                Map<String, Object> data = redisCache.getCacheObject(key);
                WfProcessInstance instance = data == null ? null : processInstanceMapper.selectById(String.valueOf(data.get("instanceId")));
                if (instance == null || !java.util.Objects.equals(instance.getTenantId(), UserContext.getTenantId())
                        || com.cloudflow.workflow.domain.enums.WfProcessStatus.fromCode(instance.getStatus()).isTerminal()
                        || currentWait(instance, key, data) == null) {
                    cleanupTimerData(key);
                    removed += Math.toIntExact(redisCache.removeCacheZSet(TIMER_ZSET_KEY, entry));
                }
            } catch (RuntimeException failure) {
                failures.add(new IllegalStateException("定时节点清理失败，租户：" + UserContext.getTenantId() + "，条目：" + key, failure));
            }
        }
        return removed;
    }
}
