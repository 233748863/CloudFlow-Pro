package com.cloudflow.common.workflow.callback.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;

import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Slf4j
public class CallbackIdempotentStore implements AutoCloseable {

    private static final DefaultRedisScript<Long> ACQUIRE = new DefaultRedisScript<>("""
            local current = redis.call('GET', KEYS[1])
            if current == 'DONE' then return 2 end
            if current then return 0 end
            redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
            return 1
            """, Long.class);
    private static final DefaultRedisScript<Long> COMPLETE = new DefaultRedisScript<>("""
            if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
            redis.call('SET', KEYS[1], 'DONE', 'PX', ARGV[2])
            return 1
            """, Long.class);
    private static final DefaultRedisScript<Long> RELEASE = new DefaultRedisScript<>("""
            if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
            return redis.call('DEL', KEYS[1])
            """, Long.class);
    private static final DefaultRedisScript<Long> RENEW = new DefaultRedisScript<>("""
            if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
            return redis.call('PEXPIRE', KEYS[1], ARGV[2])
            """, Long.class);
    private static final DefaultRedisScript<Long> ACKNOWLEDGE = new DefaultRedisScript<>("""
            if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
            redis.call('XACK', KEYS[2], ARGV[2], ARGV[3])
            redis.call('XDEL', KEYS[2], ARGV[3])
            if ARGV[1] ~= 'DONE' then redis.call('DEL', KEYS[1]) end
            return 1
            """, Long.class);

    private final StringRedisTemplate stringRedisTemplate;
    private final String keyPrefix;
    private final ScheduledExecutorService renewals = Executors.newSingleThreadScheduledExecutor(task -> {
        Thread thread = new Thread(task, "workflow-callback-lease-renewal");
        thread.setDaemon(true);
        return thread;
    });

    public CallbackIdempotentStore(StringRedisTemplate stringRedisTemplate) {
        this(stringRedisTemplate, "wf:callback:idem:v2:");
    }

    public CallbackIdempotentStore(StringRedisTemplate stringRedisTemplate, String keyPrefix) {
        if (stringRedisTemplate == null || keyPrefix == null || keyPrefix.isBlank()) throw new IllegalArgumentException("回调存储配置无效");
        this.stringRedisTemplate = stringRedisTemplate;
        this.keyPrefix = keyPrefix;
    }

    public Lease acquire(Long tenantId, String processInstanceId, Duration ttl) {
        if (tenantId == null || tenantId <= 0 || processInstanceId == null || processInstanceId.isBlank()) {
            throw new IllegalArgumentException("回调租户或流程实例无效");
        }
        String key = keyPrefix + tenantId + ":" + processInstanceId;
        String owner = "PROCESSING:" + UUID.randomUUID();
        long result = execute(ACQUIRE, List.of(key), owner, millis(ttl));
        State state = switch ((int) result) {
            case 0 -> State.PROCESSING;
            case 1 -> State.ACQUIRED;
            case 2 -> State.DONE;
            default -> throw new IllegalStateException("回调租约返回状态无效");
        };
        return new Lease(state, key, state == State.ACQUIRED ? owner : null);
    }

    public boolean complete(Lease lease, Duration ttl) {
        return lease.state() == State.ACQUIRED && execute(COMPLETE, List.of(lease.key()), lease.owner(), millis(ttl)) == 1;
    }

    public boolean release(Lease lease) {
        return lease.state() == State.ACQUIRED && execute(RELEASE, List.of(lease.key()), lease.owner()) == 1;
    }

    public boolean renew(Lease lease, Duration ttl) {
        return lease.state() == State.ACQUIRED && execute(RENEW, List.of(lease.key()), lease.owner(), millis(ttl)) == 1;
    }

    public ScheduledFuture<?> keepAlive(Lease lease, Duration ttl) {
        long interval = Math.max(1, ttl.toMillis() / 3);
        return renewals.scheduleWithFixedDelay(() -> {
            try {
                if (!renew(lease, ttl)) log.warn("回调处理租约已失效，禁止旧持有者确认消息");
            } catch (Exception failure) {
                log.warn("回调处理租约续期失败，完成时仍须核验归属", failure);
            }
        }, interval, interval, TimeUnit.MILLISECONDS);
    }

    public boolean acknowledgeDone(Lease lease, String streamKey, String group, String messageId) {
        return execute(ACKNOWLEDGE, List.of(lease.key(), streamKey), "DONE", group, messageId) == 1;
    }

    public boolean acknowledgeFailure(Lease lease, String streamKey, String group, String messageId) {
        return lease.state() == State.ACQUIRED
                && execute(ACKNOWLEDGE, List.of(lease.key(), streamKey), lease.owner(), group, messageId) == 1;
    }

    private String millis(Duration ttl) {
        if (ttl == null || ttl.isZero() || ttl.isNegative() || ttl.toMillis() <= 0) throw new IllegalArgumentException("回调租约时间无效");
        return Long.toString(ttl.toMillis());
    }

    private long execute(DefaultRedisScript<Long> script, List<String> keys, Object... arguments) {
        Long result = stringRedisTemplate.execute(script, keys, arguments);
        if (result == null) throw new IllegalStateException("回调租约操作未确认");
        return result;
    }

    @Override
    public void close() {
        renewals.shutdownNow();
    }

    public enum State {
        ACQUIRED, PROCESSING, DONE
    }

    public record Lease(State state, String key, String owner) {
    }
}
