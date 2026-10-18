package com.cloudflow.workflow.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/** Controlled locks for existing rule-only checks; real renewal/rollback is checked in the database suite. */
public final class WorkflowBusinessLockFixture {
    private WorkflowBusinessLockFixture() { }

    public static WorkflowBusinessLockService create(RedissonClient primitive) {
        RedissonClient client = (RedissonClient) Proxy.newProxyInstance(RedissonClient.class.getClassLoader(), new Class<?>[]{RedissonClient.class},
                (proxy, method, arguments) -> {
                    if (method.getName().equals("getConfig")) return new Config();
                    try { return method.invoke(primitive, arguments); }
                    catch (InvocationTargetException failure) { throw failure.getCause(); }
                });
        DeadlockDetectionService detector = new DeadlockDetectionService() {
            @Override
            public LockToken tryRenewableLock(String key, long waitSeconds, long leaseSeconds) {
                try {
                    if (!primitive.getLock(key).tryLock(waitSeconds, TimeUnit.SECONDS)) return null;
                } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); return null; }
                Long tenant = TenantContext.getTenantId() == null ? UserContext.getTenantId() : TenantContext.getTenantId();
                String owner = "controlled:" + Thread.currentThread().getId();
                return new LockToken(tenant, key, owner, owner, UUID.randomUUID().toString(), leaseSeconds);
            }

            @Override public boolean isHeldWithDetection(LockToken token) { return primitive.getLock(token.key()).isHeldByCurrentThread(); }
            @Override public boolean renewWithDetection(LockToken token) { return isHeldWithDetection(token); }
            @Override public void unlockWithDetection(LockToken token) {
                RLock lock = primitive.getLock(token.key());
                if (lock.isHeldByCurrentThread()) lock.unlock();
            }
            @Override public String commitGateKey(LockToken token) { return "controlled:commit:" + token.threadId(); }
        };
        return new WorkflowBusinessLockService(detector, client);
    }
}
