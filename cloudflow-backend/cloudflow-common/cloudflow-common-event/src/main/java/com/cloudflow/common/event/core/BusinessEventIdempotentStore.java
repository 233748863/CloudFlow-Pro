package com.cloudflow.common.event.core;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Slf4j
public class BusinessEventIdempotentStore implements AutoCloseable {
    private static final String CLOCK = """
            local clock = redis.call('TIME')
            local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
            """;
    private static final String OWNED = CLOCK + """
            if redis.call('HGET', KEYS[1], 'digest') ~= ARGV[1]
              or redis.call('HGET', KEYS[1], 'owner') ~= ARGV[2]
              or tonumber(redis.call('HGET', KEYS[1], 'until') or '0') <= now then return 0 end
            """;
    private static final DefaultRedisScript<Long> ACQUIRE = new DefaultRedisScript<>(CLOCK + """
            local digest = redis.call('HGET', KEYS[1], 'digest')
            if digest and digest ~= ARGV[1] then return -2 end
            if redis.call('HGET', KEYS[1], 'state') == 'DONE' then return -1 end
            if tonumber(redis.call('HGET', KEYS[1], 'until') or '0') > now then return 0 end
            redis.call('HSET', KEYS[1], 'digest', ARGV[1], 'owner', ARGV[2], 'until', now + ARGV[3], 'state', 'PROCESSING')
            local attempt = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
            redis.call('PEXPIRE', KEYS[1], ARGV[4])
            return attempt
            """, Long.class);
    private static final DefaultRedisScript<Long> COMPLETE = new DefaultRedisScript<>(OWNED + """
            redis.call('HSET', KEYS[1], 'state', 'DONE')
            redis.call('HDEL', KEYS[1], 'owner', 'until')
            redis.call('PEXPIRE', KEYS[1], ARGV[3])
            return 1
            """, Long.class);
    private static final DefaultRedisScript<Long> RENEW = new DefaultRedisScript<>(OWNED + """
            redis.call('HSET', KEYS[1], 'until', now + ARGV[3])
            redis.call('PEXPIRE', KEYS[1], ARGV[4])
            return 1
            """, Long.class);
    private static final DefaultRedisScript<Long> RELEASE = new DefaultRedisScript<>("""
            if redis.call('HGET', KEYS[1], 'digest') ~= ARGV[1]
              or redis.call('HGET', KEYS[1], 'owner') ~= ARGV[2] then return 0 end
            redis.call('HSET', KEYS[1], 'state', 'READY')
            redis.call('HDEL', KEYS[1], 'owner', 'until')
            return 1
            """, Long.class);
    private static final DefaultRedisScript<Long> ACK_DONE = new DefaultRedisScript<>("""
            if redis.call('HGET', KEYS[1], 'digest') ~= ARGV[1]
              or redis.call('HGET', KEYS[1], 'state') ~= 'DONE' then return 0 end
            redis.call('XACK', KEYS[2], ARGV[2], ARGV[3])
            return 1
            """, Long.class);
    private static final DefaultRedisScript<Long> ACK_FAILED = new DefaultRedisScript<>(OWNED + """
            redis.call('XACK', KEYS[2], ARGV[3], ARGV[4])
            redis.call('HSET', KEYS[1], 'state', 'READY', 'attempts', 0)
            redis.call('HDEL', KEYS[1], 'owner', 'until')
            return 1
            """, Long.class);

    private final StringRedisTemplate redis;
    private final ScheduledExecutorService renewals = Executors.newSingleThreadScheduledExecutor(task -> {
        Thread thread = new Thread(task, "business-event-lease-renewal");
        thread.setDaemon(true);
        return thread;
    });

    public BusinessEventIdempotentStore(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public Lease acquire(String scope, BusinessEventEnvelope envelope, Duration processingTtl, Duration retentionTtl) {
        if (scope == null || scope.isBlank() || envelope == null || envelope.getTenantId() == null
                || envelope.getTenantId() <= 0 || envelope.getEventId() == null || envelope.getEventId().isBlank()) {
            throw new IllegalArgumentException("业务事件消费身份无效");
        }
        String key = "cloudflow:event:idem:" + digest(scope, envelope.getTenantId().toString(), envelope.getEventId());
        String digest = digest(envelope.getEventType(), envelope.getSourceModule(), String.valueOf(envelope.getSourceId()),
                envelope.getPayload(), envelope.getPayloadDigest(), String.valueOf(envelope.getOccurredAt()));
        String owner = UUID.randomUUID().toString();
        long result = execute(ACQUIRE, List.of(key), digest, owner, millis(processingTtl), millis(retentionTtl));
        State state = result > 0 ? State.ACQUIRED : switch ((int) result) {
            case 0 -> State.PROCESSING;
            case -1 -> State.DONE;
            case -2 -> State.CONFLICT;
            default -> throw new IllegalStateException("业务事件租约状态无效");
        };
        return new Lease(state, key, digest, state == State.ACQUIRED ? owner : null, Math.max(0, result));
    }

    public boolean complete(Lease lease, Duration retentionTtl) {
        return lease.state() == State.ACQUIRED && execute(COMPLETE, List.of(lease.key()), lease.digest(), lease.owner(), millis(retentionTtl)) == 1;
    }

    public boolean release(Lease lease) {
        return lease.state() == State.ACQUIRED && execute(RELEASE, List.of(lease.key()), lease.digest(), lease.owner()) == 1;
    }

    public boolean renew(Lease lease, Duration processingTtl, Duration retentionTtl) {
        return lease.state() == State.ACQUIRED && execute(RENEW, List.of(lease.key()), lease.digest(), lease.owner(), millis(processingTtl), millis(retentionTtl)) == 1;
    }

    public ScheduledFuture<?> keepAlive(Lease lease, Duration processingTtl, Duration retentionTtl) {
        long interval = Math.max(1, processingTtl.toMillis() / 3);
        return renewals.scheduleWithFixedDelay(() -> {
            try {
                if (!renew(lease, processingTtl, retentionTtl)) log.warn("业务事件处理租约已失效，旧持有者不能确认完成");
            } catch (Exception failure) {
                log.warn("业务事件租约续期未确认，完成时仍须核验归属: type={}", failure.getClass().getSimpleName());
            }
        }, interval, interval, TimeUnit.MILLISECONDS);
    }

    public boolean acknowledgeDone(Lease lease, String stream, String group, String messageId) {
        return execute(ACK_DONE, List.of(lease.key(), stream), lease.digest(), group, messageId) == 1;
    }

    public boolean acknowledgeFailure(Lease lease, String stream, String group, String messageId) {
        return lease.state() == State.ACQUIRED && execute(ACK_FAILED, List.of(lease.key(), stream), lease.digest(), lease.owner(), group, messageId) == 1;
    }

    private long execute(DefaultRedisScript<Long> script, List<String> keys, Object... arguments) {
        Long result = redis.execute(script, keys, arguments);
        if (result == null) throw new IllegalStateException("业务事件租约操作未确认");
        return result;
    }

    private String millis(Duration duration) {
        if (duration == null || duration.isNegative() || duration.isZero() || duration.toMillis() <= 0) {
            throw new IllegalArgumentException("业务事件租约时长无效");
        }
        return Long.toString(duration.toMillis());
    }

    private String digest(String... fields) {
        try {
            MessageDigest hasher = MessageDigest.getInstance("SHA-256");
            for (String field : fields) {
                byte[] bytes = field == null ? new byte[0] : field.getBytes(StandardCharsets.UTF_8);
                hasher.update(ByteBuffer.allocate(Integer.BYTES).putInt(field == null ? -1 : bytes.length).array());
                hasher.update(bytes);
            }
            return HexFormat.of().formatHex(hasher.digest());
        } catch (NoSuchAlgorithmException failure) {
            throw new IllegalStateException("业务事件摘要算法不可用", failure);
        }
    }

    @Override
    public void close() {
        renewals.shutdownNow();
    }

    public enum State { ACQUIRED, PROCESSING, DONE, CONFLICT }

    public record Lease(State state, String key, String digest, String owner, long attempts) { }
}
