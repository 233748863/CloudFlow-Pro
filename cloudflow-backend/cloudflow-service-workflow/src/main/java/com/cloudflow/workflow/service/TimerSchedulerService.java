package com.cloudflow.workflow.service;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.job.TimerScanJob;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.exception.WorkflowException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.BiConsumer;

@Slf4j
@Service
@RequiredArgsConstructor
public class TimerSchedulerService {
    public static final String TIMER_ZSET_KEY = "sys:wf:timers";
    private final RedisCache redisCache;
    private final ObjectProvider<TimerScanJob> scanJob;
    private final WfProcessInstanceMapper instanceMapper;
    private final TransactionTemplate transactions;

    public static String timerKey(String instanceId, String nodeKey) {
        return "sys:wf:timer:" + instanceId + ":" + nodeKey;
    }

    public static String timerKey(String instanceId, WorkflowWaitState.Pending pending) {
        String activation = pending.context() == null ? "root" : pending.context().activationId();
        return timerKey(instanceId, pending.nodeKey()) + ":" + activation + ":" + pending.waitId();
    }

    public void scheduleAfterCommit(WfProcessInstance instance, WorkflowWaitState.Pending pending) {
        String instanceId = instance.getInstanceId();
        afterCommit(() -> schedule(instanceId, pending));
    }

    private void schedule(String instanceId, WorkflowWaitState.Pending pending) {
        String key = timerKey(instanceId, pending);
        if (Boolean.TRUE.equals(pending.payload().get("notified"))) {
            redisCache.removeCacheZSet(TIMER_ZSET_KEY, key);
            redisCache.deleteObject(key);
            return;
        }
        Map<String, Object> data = new HashMap<>(pending.payload());
        data.put("instanceId", instanceId);
        data.put("nodeKey", pending.nodeKey());
        data.put("generation", pending.waitId());
        data.put("waitId", pending.waitId());
        data.put("executionContext", pending.executionContext());
        redisCache.setCacheObject(key, data);
        Number expiry = (Number) pending.payload().getOrDefault("nextRetryAt", pending.payload().get("expireAt"));
        redisCache.setCacheZSet(TIMER_ZSET_KEY, key, expiry.doubleValue());
    }

    public void restorePendingTimers() {
        String afterId = "";
        while (true) {
            List<WfProcessInstance> instances = instanceMapper.selectWaitingInstances(TenantContext.getTenantId(), afterId, 100);
            for (WfProcessInstance instance : instances) {
                for (WorkflowWaitState.Pending pending : WorkflowWaitState.list(instance, "TIMER")) schedule(instance.getInstanceId(), pending);
            }
            if (instances.size() < 100) return;
            afterId = instances.get(instances.size() - 1).getInstanceId();
        }
    }

    public boolean retryPendingTimer(String instanceId, String waitId, int maxRetries, int intervalMinutes) {
        return Boolean.TRUE.equals(transactions.execute(status -> {
            WfProcessInstance instance = instanceMapper.selectForExecution(TenantContext.getTenantId(), instanceId);
            if (instance == null || !com.cloudflow.workflow.domain.enums.WfProcessStatus.isOpen(instance.getStatus())) return false;
            WorkflowWaitState.Pending pending = WorkflowWaitState.find(instance, waitId);
            if (pending == null || !"TIMER".equals(pending.kind())) return false;
            if (Boolean.TRUE.equals(pending.payload().get("blocked"))
                    || Boolean.TRUE.equals(pending.payload().get("notified"))) return false;
            Map<String, Object> payload = new HashMap<>(pending.payload());
            int retryCount = ((Number) payload.getOrDefault("retryCount", 0)).intValue() + 1;
            payload.put("retryCount", retryCount);
            payload.put("nextRetryAt", System.currentTimeMillis() + Math.max(1, intervalMinutes) * 60000L);
            payload.put("blocked", retryCount > maxRetries);
            WorkflowWaitState.Pending updated = WorkflowWaitState.change(instance, null, pending, payload);
            if (instanceMapper.updateById(instance) != 1) throw WorkflowException.invalidState("定时重试记录已变化");
            scheduleAfterCommit(instance, updated);
            return retryCount <= maxRetries;
        }));
    }

    /** 停止自动重试后，失败提醒与已通知标记共同提交；失败保留持久等待供补发。 */
    public boolean notifyExhaustedTimer(String instanceId, String waitId,
                                      BiConsumer<WfProcessInstance, WorkflowWaitState.Pending> notification) {
        return Boolean.TRUE.equals(transactions.execute(status -> {
            Long tenantId = TenantContext.getTenantId();
            if (tenantId == null) throw WorkflowException.invalidState("定时失败提醒缺少租户上下文");
            WfProcessInstance instance = instanceMapper.selectForExecution(tenantId, instanceId);
            if (instance == null || !Objects.equals(tenantId, instance.getTenantId())
                    || !com.cloudflow.workflow.domain.enums.WfProcessStatus.isOpen(instance.getStatus())) return false;
            WorkflowWaitState.Pending pending = WorkflowWaitState.find(instance, waitId);
            if (pending == null || !"TIMER".equals(pending.kind())
                    || !Boolean.TRUE.equals(pending.payload().get("blocked"))
                    || Boolean.TRUE.equals(pending.payload().get("notified"))) return false;
            notification.accept(instance, pending);
            Map<String, Object> payload = new HashMap<>(pending.payload());
            payload.put("notified", true);
            WorkflowWaitState.Pending notified = WorkflowWaitState.change(instance, null, pending, payload);
            if (instanceMapper.updateById(instance) != 1) throw WorkflowException.invalidState("定时失败提醒记录已变化");
            scheduleAfterCommit(instance, notified);
            return true;
        }));
    }

    public void completeAfterCommit(String instanceId, WorkflowWaitState.Pending pending) {
        afterCommit(() -> {
            String key = timerKey(instanceId, pending);
            redisCache.removeCacheZSet(TIMER_ZSET_KEY, key);
            redisCache.deleteObject(key);
        });
    }

    public void scanAndTriggerTimers() {
        scanJob.getObject().scanTimerTasks();
    }

    // 事务提交后取消定时器的入口。内部调用 cancelTimersForInstance 走的是同一个 bean，
    // 不经过代理，那边的 @Audit 不会触发，所以这里必须自己标注，否则
    // HighRiskAuditVerifier 会按方法名里的 cancel 判定为高风险方法并在启动期抛错。
    @Audit(name = "取消实例定时器", highRisk = true)
    public void cancelAfterCommit(String instanceId) {
        afterCommit(() -> cancelTimersForInstance(instanceId));
    }

    @Audit(name = "取消实例定时器", highRisk = true)
    public void cancelTimersForInstance(String instanceId) {
        String prefix = timerKey(instanceId, "");
        Set<Object> entries = redisCache.getCacheZSetByScoreRange(TIMER_ZSET_KEY, Double.NEGATIVE_INFINITY, Double.POSITIVE_INFINITY);
        if (entries != null) {
            for (Object entry : entries) {
                String key = String.valueOf(entry);
                if (key.startsWith(prefix)) {
                    redisCache.removeCacheZSet(TIMER_ZSET_KEY, key);
                    redisCache.deleteObject(key);
                }
            }
        }
        Collection<String> keys = redisCache.keys(prefix + "*");
        String tenantPrefix = TenantContext.getTenantId() == null ? "" : TenantContext.getTenantId() + ":";
        if (keys != null) {
            for (String key : keys) {
                if (key.startsWith(tenantPrefix + prefix)) {
                    redisCache.deleteObject(key.substring(tenantPrefix.length()));
                }
            }
        }
    }

    private void afterCommit(Runnable action) {
        Long tenantId = TenantContext.getTenantId();
        Runnable scoped = () -> {
            try {
                TenantBroker.runAs(tenantId, ignored -> action.run());
            } catch (RuntimeException failure) {
                log.error("流程定时器索引更新失败，将按数据库等待记录再次核验", failure);
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    scoped.run();
                }
            });
        } else {
            // 扫描恢复没有外围事务，应将失败交给任务平台；事务提交后的失败仍由持久等待补偿。
            TenantBroker.runAs(tenantId, ignored -> action.run());
        }
    }
}
