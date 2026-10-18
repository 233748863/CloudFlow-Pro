package com.cloudflow.workflow.service;

import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.exception.WorkflowException;
import jakarta.annotation.PreDestroy;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.TransactionStatus;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/** Workflow locks remain owned until transaction completion; revoked work cannot commit. */
@Service
public class WorkflowBusinessLockService {
    private static final Logger log = LoggerFactory.getLogger(WorkflowBusinessLockService.class);
    private final DeadlockDetectionService detector;
    private final RedissonClient redisson;
    private final ScheduledExecutorService renewals = Executors.newSingleThreadScheduledExecutor(action -> {
        Thread thread = new Thread(action, "workflow-business-lock-renewal");
        thread.setDaemon(true); return thread;
    });
    private final Set<BusinessLock> active = ConcurrentHashMap.newKeySet();
    private final ThreadLocal<List<BusinessLock>> owned = ThreadLocal.withInitial(ArrayList::new);
    private final long leaseSeconds;

    public WorkflowBusinessLockService(DeadlockDetectionService detector, RedissonClient redisson) {
        this.detector = detector; this.redisson = redisson;
        long watchdog = redisson.getConfig().getLockWatchdogTimeout();
        if (watchdog < 3000 || watchdog > Long.MAX_VALUE - 999) throw new IllegalArgumentException("审批锁续期时间无效");
        this.leaseSeconds = (watchdog + 999) / 1000;
    }

    public BusinessLock getLock(String key) {
        if (key == null || !(key.startsWith("lock:task:") || key.startsWith("lock:countersign:") || key.startsWith("lock:instance:"))) {
            throw new IllegalArgumentException("仅支持审批任务、会签和流程锁");
        }
        return new BusinessLock(key);
    }

    public <T> T execute(TransactionTemplate template, TransactionCallback<T> action) {
        return template.execute(status -> {
            registerFence();
            return action.doInTransaction(status);
        });
    }

    public void executeWithoutResult(TransactionTemplate template, Consumer<TransactionStatus> action) {
        execute(template, status -> { action.accept(status); return null; });
    }

    public void close(BusinessLock... locks) {
        RuntimeException failure = null;
        for (BusinessLock lock : locks) {
            if (lock == null) continue;
            try { lock.close(); }
            catch (RuntimeException cleanup) {
                if (failure == null) failure = cleanup; else failure.addSuppressed(cleanup);
            }
        }
        if (failure != null) throw failure;
    }

    private Fence registerFence() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) return null;
        if (!TransactionSynchronizationManager.isSynchronizationActive()) throw new IllegalStateException("审批事务缺少提交保护");
        Fence fence = (Fence) TransactionSynchronizationManager.getResource(this);
        if (fence == null) {
            fence = new Fence();
            TransactionSynchronizationManager.bindResource(this, fence);
            TransactionSynchronizationManager.registerSynchronization(fence);
        }
        fence.locks.addAll(owned.get());
        return fence;
    }

    private void assertOwned() {
        for (BusinessLock lock : owned.get()) {
            if (lock.token != null && (lock.lost || !detector.isHeldWithDetection(lock.token))) throw lostOwnership();
        }
    }

    private static WorkflowException lostOwnership() {
        return new WorkflowException("WORKFLOW_LOCK_LOST", "审批占用已失效，本次操作已撤回，请读取最新结果后重试");
    }

    public final class BusinessLock implements AutoCloseable {
        private final String key;
        private DeadlockDetectionService.LockToken token;
        private ScheduledFuture<?> renewal;
        private volatile boolean lost;
        private boolean closeRequested;

        private BusinessLock(String key) { this.key = key; }

        public boolean tryLock(long wait, TimeUnit unit) throws InterruptedException {
            if (token != null || closeRequested) throw new IllegalStateException("审批锁句柄不可重复使用");
            if (Thread.currentThread().isInterrupted()) throw new InterruptedException("审批请求已中断");
            if (wait < 0 || unit == null) throw new IllegalArgumentException("审批锁等待时间无效");
            assertOwned();
            long waitSeconds = unit.toSeconds(wait);
            if (wait > 0 && waitSeconds == 0) throw new IllegalArgumentException("审批锁等待时间至少一秒");
            token = detector.tryRenewableLock(key, waitSeconds, leaseSeconds);
            if (token == null) {
                if (Thread.currentThread().isInterrupted()) throw new InterruptedException("审批请求已中断");
                return false;
            }
            owned.get().add(this); active.add(this);
            try {
                assertOwned();
                renewal = renewals.scheduleWithFixedDelay(() -> {
                    try {
                        TenantBroker.runAs(token.tenantId(), ignored -> {
                            if (!detector.renewWithDetection(token)) lost = true;
                        });
                    } catch (RuntimeException failure) {
                        // Do not revive a generation after a failed renewal; the transaction must roll back.
                        lost = true;
                        log.warn("审批锁续期失败，原请求将拒绝提交，锁：{}", key);
                    }
                    if (lost && renewal != null) renewal.cancel(false);
                }, leaseSeconds * 1000 / 3, leaseSeconds * 1000 / 3, TimeUnit.MILLISECONDS);
                registerFence();
                return true;
            } catch (RuntimeException failure) {
                try { release(); } catch (RuntimeException cleanup) { failure.addSuppressed(cleanup); }
                throw failure;
            }
        }

        @Override
        public void close() {
            if (closeRequested) return;
            closeRequested = true;
            if (token == null) return;
            Fence fence = registerFence();
            if (fence != null) { fence.deferred.add(this); return; }
            release();
        }

        private void release() {
            if (renewal != null) renewal.cancel(false);
            active.remove(this); owned.get().remove(this);
            if (owned.get().isEmpty()) owned.remove();
            detector.unlockWithDetection(token);
        }
    }

    private final class Fence implements TransactionSynchronization {
        private final Set<BusinessLock> locks = new LinkedHashSet<>();
        private final Set<BusinessLock> deferred = new LinkedHashSet<>();
        private RLock commitGate;

        @Override
        public void suspend() { TransactionSynchronizationManager.unbindResource(WorkflowBusinessLockService.this); }

        @Override
        public void resume() { TransactionSynchronizationManager.bindResource(WorkflowBusinessLockService.this, this); }

        @Override
        public void beforeCommit(boolean readOnly) {
            if (locks.isEmpty()) return;
            DeadlockDetectionService.LockToken first = locks.iterator().next().token;
            if (!first.tenantId().equals(TenantContext.getTenantId())) throw lostOwnership();
            commitGate = redisson.getLock(detector.commitGateKey(first));
            try {
                if (!commitGate.tryLock(0, TimeUnit.SECONDS)) throw lostOwnership();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt(); throw lostOwnership();
            }
            for (BusinessLock lock : locks) {
                if (!first.tenantId().equals(lock.token.tenantId()) || !first.threadId().equals(lock.token.threadId())
                        || lock.lost || !detector.isHeldWithDetection(lock.token)) throw lostOwnership();
            }
        }

        @Override
        public void afterCompletion(int status) {
            TransactionSynchronizationManager.unbindResourceIfPossible(WorkflowBusinessLockService.this);
            List<BusinessLock> closing = new ArrayList<>(deferred);
            for (int index = closing.size() - 1; index >= 0; index--) {
                try { closing.get(index).release(); }
                catch (RuntimeException failure) { log.warn("审批事务已结束，原锁清理失败，锁：{}", closing.get(index).key); }
            }
            if (commitGate != null && commitGate.isHeldByCurrentThread()) commitGate.unlock();
        }
    }

    @PreDestroy
    public void stopRenewals() {
        for (BusinessLock lock : active) lock.lost = true;
        renewals.shutdownNow();
    }
}
