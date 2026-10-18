package com.cloudflow.workflow.job;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.service.IWfTaskService;
import com.cloudflow.workflow.service.TaskTimeoutNotifications;
import com.cloudflow.workflow.service.WorkflowCompletionContext;
import com.cloudflow.workflow.service.WorkflowNodePolicy;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/** 各租户超时任务经完整流程引擎处理；失败退避5分钟，三次失败后仅重试转人工通知。 */
@Component
public class TaskTimeoutJob {
    private static final Logger log = LoggerFactory.getLogger(TaskTimeoutJob.class);
    private static final String TIMEOUT_ZSET_KEY = "sys:task:timeouts";
    private static final String RETRY_COUNT_KEY_PREFIX = "sys:task:timeout:retry:";
    private static final long RETRY_BACKOFF_MS = 5 * 60 * 1000L;
    private static final int MAX_RETRIES = 3;

    @Autowired private RedisCache redisCache;
    @Autowired private RedissonClient redissonClient;
    @Autowired private WfTaskMapper taskMapper;
    @Autowired private WfProcessInstanceMapper processInstanceMapper;
    @Autowired private IWfTaskService taskService;
    @Autowired private WorkflowNodePolicy nodePolicy;
    @Autowired private TenantIterator tenantIterator;
    @Autowired private TransactionTemplate transactionTemplate;
    @Autowired private TaskTimeoutNotifications timeoutNotifications;

    private enum Outcome { HANDLED, STALE, DEFERRED, MANUAL }
    private static final class ManualNotificationFailure extends IllegalStateException {
        private ManualNotificationFailure(RuntimeException cause) { super("转人工通知登记失败，保留待处理项", cause); }
    }
    private static final class ScanCounts {
        private int handled;
        private int stale;
        private int deferred;
        private int manual;
        private void record(Outcome outcome) {
            switch (outcome) {
                case HANDLED -> handled++;
                case STALE -> stale++;
                case DEFERRED -> deferred++;
                case MANUAL -> manual++;
            }
        }
    }

    /** 平台默认每5分钟扫描；失败租户和条目不阻断其他待办。 */
    @DistributedJob(name = "task-timeout-scan-job", lockTime = 55)
    @JobHandler(value = "taskTimeout", desc = "任务超时扫描")
    public JobResult scanTimeoutTasks() {
        RLock lock = redissonClient.getLock("lock:scheduled:scanTimeoutTasks");
        boolean acquired = false;
        try {
            // 扫描耗时可能超过一个周期，自动续期直到整轮收尾，避免并发消费失败次数。
            acquired = lock.tryLock(1, TimeUnit.SECONDS);
            if (!acquired) return skipped("超时扫描已有任务执行，已跳过");
            ScanCounts counts = new ScanCounts();
            List<RuntimeException> failures = new ArrayList<>();
            for (Long tenant : tenantIterator.listActiveTenantIds()) {
                try {
                    TenantBroker.runAs(tenant, ignored -> scanTenant(counts, failures));
                } catch (RuntimeException exception) {
                    failures.add(new IllegalStateException("超时队列读取失败，租户：" + tenant, exception));
                }
            }
            throwFailures("超时扫描", failures);
            return JobResult.success(counts.handled, "超时扫描完成：自动处理" + counts.handled + "项，转人工" + counts.manual
                    + "项，移除失效" + counts.stale + "项，暂缓" + counts.deferred + "项");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("超时扫描获取锁被中断", exception);
        } finally {
            if (acquired && lock.isHeldByCurrentThread()) lock.unlock();
        }
    }

    private void scanTenant(ScanCounts counts, List<RuntimeException> failures) {
        Set<Object> tasks = redisCache.getCacheZSetByScoreRange(TIMEOUT_ZSET_KEY, 0, (double) System.currentTimeMillis());
        if (tasks == null) return;
        for (Object member : tasks) {
            String taskId = member.toString();
            Outcome outcome;
            try {
                outcome = handleTimeoutTask(taskId);
            } catch (RuntimeException exception) {
                IllegalStateException failure = new IllegalStateException("超时任务失败，租户：" + TenantContext.getTenantId() + "，任务：" + taskId, exception);
                failures.add(failure);
                log.error("超时任务处理失败, tenantId={}, taskId={}", TenantContext.getTenantId(), taskId, exception);
                if (exception instanceof ManualNotificationFailure) continue;
                try {
                    outcome = handleProcessingFailure(taskId);
                } catch (RuntimeException recoveryFailure) {
                    failure.addSuppressed(recoveryFailure);
                    continue;
                }
            }
            if (outcome != Outcome.DEFERRED) {
                try {
                    // 自动结果/人工通知已提交后才移除；移除失败不能重新消费一次引擎失败次数。
                    redisCache.removeCacheZSet(TIMEOUT_ZSET_KEY, member);
                    redisCache.deleteObject(RETRY_COUNT_KEY_PREFIX + taskId);
                } catch (RuntimeException exception) {
                    failures.add(new IllegalStateException("超时队列收尾失败，租户：" + TenantContext.getTenantId() + "，任务：" + taskId, exception));
                }
            }
            counts.record(outcome);
        }
    }

    private Outcome handleTimeoutTask(String taskId) {
        WfTask task = taskMapper.selectById(taskId);
        if (task == null || !WfTaskStatus.TODO.getCode().equals(task.getStatus())) return Outcome.STALE;
        requireTenant(task.getTenantId());
        return doHandleTimeoutTask(task);
    }

    private Outcome doHandleTimeoutTask(WfTask task) {
        WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
        if (instance == null) return Outcome.STALE;
        if ("PAUSED".equals(instance.getStatus()) || "FAILED".equals(instance.getStatus())) return Outcome.DEFERRED;
        if (!WfProcessStatus.isActive(instance.getStatus())) return Outcome.STALE;
        requireTenant(instance.getTenantId());
        if (retryCount(task.getTaskId()) >= MAX_RETRIES) return notifyManualIntervention(task.getTaskId());
        String action = WorkflowNodePolicy.timeoutAction(nodePolicy.resolveNode(instance, task.getNodeKey()));
        String resultText = "AUTO_REJECT".equals(action) ? "驳回" : "通过";
        Long previousId = UserContext.getUserId();
        String previousName = UserContext.getUserName();
        try {
            UserContext.setUserId(task.getAssignee() == null ? 0L : task.getAssignee());
            UserContext.setUserName("系统自动处理");
            Map<String, Object> variables = new HashMap<>();
            variables.put("_autoProcessed", true);
            variables.put("_autoProcessReason", "任务超时自动" + resultText);
            variables.put("_autoProcessTime", LocalDateTime.now());
            R<?> result = WorkflowCompletionContext.forTimeout(task.getTaskId(), () -> taskService.completeAutomaticTask(
                    task.getTaskId(), "AUTO_REJECT".equals(action) ? "REJECT" : "APPROVE", "任务超时，系统自动" + resultText, variables));
            if (result == null || !result.isSuccess()) throw new IllegalStateException("超时任务引擎未完成处理");
            return Outcome.HANDLED;
        } finally {
            UserContext.setUserId(previousId);
            UserContext.setUserName(previousName);
        }
    }

    private long retryCount(String taskId) {
        Object value = redisCache.getCacheObject(RETRY_COUNT_KEY_PREFIX + taskId);
        if (value == null) return 0;
        long count = Long.parseLong(value.toString());
        if (count < 0) throw new IllegalStateException("超时任务重试计数无效");
        return count;
    }

    private Outcome handleProcessingFailure(String taskId) {
        // 达到上限后不再调用流程引擎；通知失败保留计数与队列，仅重试人工通知。
        long retries = retryCount(taskId);
        if (retries < MAX_RETRIES) {
            retries = redisCache.increment(RETRY_COUNT_KEY_PREFIX + taskId);
            if (retries <= 0) throw new IllegalStateException("超时任务重试计数未登记");
        }
        if (retries >= MAX_RETRIES) return notifyManualIntervention(taskId);
        redisCache.setCacheZSet(TIMEOUT_ZSET_KEY, taskId, (double) (System.currentTimeMillis() + RETRY_BACKOFF_MS));
        return Outcome.DEFERRED;
    }

    private Outcome notifyManualIntervention(String taskId) {
        try {
            return Objects.requireNonNull(transactionTemplate.execute(status -> {
            Long tenant = TenantContext.getTenantId();
            if (tenant == null) throw new IllegalStateException("转人工通知缺少租户上下文");
            WfTask task = taskMapper.selectForUpdate(tenant, taskId);
            if (task == null || !WfTaskStatus.TODO.getCode().equals(task.getStatus())) return Outcome.STALE;
            requireTenant(task.getTenantId());
            WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
            if (instance == null || !WfProcessStatus.isOpen(instance.getStatus())) return Outcome.STALE;
            requireTenant(instance.getTenantId());
            if ("PAUSED".equals(instance.getStatus()) || "FAILED".equals(instance.getStatus())) return Outcome.DEFERRED;
            timeoutNotifications.manual(task, instance);
            return Outcome.MANUAL;
            }));
        } catch (RuntimeException exception) {
            throw new ManualNotificationFailure(exception);
        }
    }

    /** 每天凌晨2点仅清理各启用租户队列中score小于等于0的异常条目。 */
    @DistributedJob(name = "task-timeout-cleanup-job", lockTime = 120)
    @JobHandler(value = "taskTimeoutCleanup", desc = "清理任务超时键")
    public JobResult cleanupExpiredKeys() {
        RLock lock = redissonClient.getLock("lock:scheduled:cleanupExpiredKeys");
        boolean acquired = false;
        try {
            acquired = lock.tryLock(1, TimeUnit.SECONDS);
            if (!acquired) return skipped("超时队列清理已有任务执行，已跳过");
            AtomicLong removed = new AtomicLong();
            List<RuntimeException> failures = new ArrayList<>();
            for (Long tenant : tenantIterator.listActiveTenantIds()) {
                try {
                    TenantBroker.runAs(tenant, ignored -> removed.addAndGet(redisCache.removeCacheZSetByScoreRange(TIMEOUT_ZSET_KEY, Double.NEGATIVE_INFINITY, 0)));
                } catch (RuntimeException exception) {
                    failures.add(new IllegalStateException("超时队列清理失败，租户：" + tenant, exception));
                }
            }
            throwFailures("超时队列清理", failures);
            return JobResult.success(Math.toIntExact(removed.get()), "超时队列清理完成：移除" + removed.get() + "条异常记录");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("超时队列清理获取锁被中断", exception);
        } finally {
            if (acquired && lock.isHeldByCurrentThread()) lock.unlock();
        }
    }

    private void requireTenant(Long tenant) {
        if (tenant == null || !Objects.equals(tenant, TenantContext.getTenantId())) throw new IllegalStateException("超时任务租户不一致");
    }
    private JobResult skipped(String message) { return JobResult.builder().executeStatus("SKIPPED").affectedRows(0).resultMsg(message).build(); }
    private void throwFailures(String action, List<RuntimeException> failures) {
        if (failures.isEmpty()) return;
        IllegalStateException failure = new IllegalStateException(action + "存在失败项：" + failures.size() + "项");
        failures.forEach(failure::addSuppressed);
        throw failure;
    }
}
