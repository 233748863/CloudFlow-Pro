package com.cloudflow.common.event.core;

import com.cloudflow.common.event.config.OutboxProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.stream.StreamListener;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
public class BusinessEventPendingReclaimer implements AutoCloseable {
    private static final DefaultRedisScript<List> CLAIM = new DefaultRedisScript<>(
            "return redis.call('XCLAIM', KEYS[1], ARGV[1], ARGV[2], ARGV[3], unpack(ARGV, 4))", List.class);
    private static final DefaultRedisScript<List> PENDING = new DefaultRedisScript<>(
            "return redis.call('XPENDING', KEYS[1], ARGV[1], ARGV[2], '+', ARGV[3])", List.class);
    private final StringRedisTemplate redis;
    private final OutboxProperties properties;
    private final String group;
    private final StreamListener<String, MapRecord<String, String, String>> consumer;
    private final String consumerName;
    private final ScheduledExecutorService scheduler;
    private final AtomicBoolean stopped = new AtomicBoolean();
    private ScheduledFuture<?> task;
    private String cursor;

    public BusinessEventPendingReclaimer(StringRedisTemplate redis, OutboxProperties properties, String group,
            StreamListener<String, MapRecord<String, String, String>> consumer) {
        properties.validateConsumer();
        this.redis = redis;
        this.properties = properties;
        this.group = group;
        this.consumer = consumer;
        consumerName = properties.getConsumerPrefix() + "-pending-" + UUID.randomUUID();
        scheduler = Executors.newSingleThreadScheduledExecutor(action -> {
            Thread thread = new Thread(action, consumerName);
            thread.setDaemon(true);
            return thread;
        });
    }

    public synchronized void start() {
        if (task == null && !stopped.get()) {
            task = scheduler.scheduleWithFixedDelay(this::reclaimPending, properties.getConsumerPendingPollIntervalSeconds(),
                    properties.getConsumerPendingPollIntervalSeconds(), TimeUnit.SECONDS);
        }
    }

    public synchronized int reclaimPending() {
        if (stopped.get()) return 0;
        try {
            List pending = redis.execute(PENDING, List.of(properties.getStreamKey()), group, cursor == null ? "-" : cursor,
                    Long.toString((long) properties.getConsumerPendingBatchSize() + (cursor == null ? 0 : 1)));
            ArrayList<String> eligible = new ArrayList<String>();
            Duration idle = Duration.ofSeconds(properties.getConsumerPendingMinIdleSeconds());
            int scanned = 0;
            String last = null;
            if (pending != null) {
                for (Object value : pending) {
                    if (!(value instanceof List<?> entry) || entry.size() != 4 || !(entry.get(0) instanceof String identifier)
                            || !(entry.get(2) instanceof Number elapsed)) {
                        throw new IllegalStateException("业务事件待处理索引结构无效");
                    }
                    if (identifier.equals(cursor)) continue;
                    if (scanned == properties.getConsumerPendingBatchSize()) break;
                    scanned++;
                    last = identifier;
                    if (elapsed.longValue() >= idle.toMillis()) eligible.add(identifier);
                }
            }
            cursor = scanned < properties.getConsumerPendingBatchSize() ? null : last;
            if (eligible.isEmpty()) return 0;
            ArrayList<String> arguments = new ArrayList<String>();
            arguments.add(group);
            arguments.add(consumerName);
            arguments.add(Long.toString(idle.toMillis()));
            arguments.addAll(eligible);
            List claimed = redis.execute(CLAIM, List.of(properties.getStreamKey()), arguments.toArray());
            if (claimed == null) return 0;
            for (Object message : claimed) consumer.onMessage(decode(message));
            return claimed.size();
        } catch (Exception failure) {
            log.warn("业务事件待处理消息重领失败，下次扫描继续: group={}, type={}", group, failure.getClass().getSimpleName());
            return 0;
        }
    }

    private MapRecord<String, String, String> decode(Object value) {
        if (!(value instanceof List<?> record) || record.size() != 2 || !(record.get(0) instanceof String identifier)
                || !(record.get(1) instanceof List<?> fields) || fields.size() % 2 != 0) {
            throw new IllegalStateException("业务事件待处理消息结构无效");
        }
        LinkedHashMap<String, String> body = new LinkedHashMap<String, String>();
        for (int index = 0; index < fields.size(); index += 2) {
            if (!(fields.get(index) instanceof String field) || !(fields.get(index + 1) instanceof String content)) {
                throw new IllegalStateException("业务事件待处理字段结构无效");
            }
            body.put(field, content);
        }
        return MapRecord.create(properties.getStreamKey(), body).withId(RecordId.of(identifier));
    }

    @Override
    public void close() {
        stopped.set(true);
        scheduler.shutdownNow();
    }
}
