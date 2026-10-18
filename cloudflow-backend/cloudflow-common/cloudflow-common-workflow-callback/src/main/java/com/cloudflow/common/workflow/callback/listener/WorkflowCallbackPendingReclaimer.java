package com.cloudflow.common.workflow.callback.listener;

import com.cloudflow.common.workflow.callback.config.WorkflowCallbackProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Range;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.PendingMessage;
import org.springframework.data.redis.connection.stream.PendingMessages;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.core.StreamOperations;
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
public class WorkflowCallbackPendingReclaimer implements AutoCloseable {
    private static final DefaultRedisScript<List> CLAIM_PENDING = new DefaultRedisScript<>(
            "return redis.call('XCLAIM', KEYS[1], ARGV[1], ARGV[2], ARGV[3], unpack(ARGV, 4))", List.class);
    private final StringRedisTemplate redis;
    private final WorkflowCallbackProperties properties;
    private final StreamListener<String, MapRecord<String, String, String>> consumer;
    private final String consumerName;
    private final ScheduledExecutorService scheduler;
    private final AtomicBoolean stopped = new AtomicBoolean();
    private ScheduledFuture<?> task;
    private String cursor;

    public WorkflowCallbackPendingReclaimer(StringRedisTemplate redis, WorkflowCallbackProperties properties,
            StreamListener<String, MapRecord<String, String, String>> consumer) {
        properties.validate();
        this.redis = redis;
        this.properties = properties;
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
            task = scheduler.scheduleWithFixedDelay(this::reclaimPending, properties.getPendingPollIntervalSeconds(),
                    properties.getPendingPollIntervalSeconds(), TimeUnit.SECONDS);
        }
    }

    public synchronized int reclaimPending() {
        if (stopped.get()) return 0;
        try {
            StreamOperations<String, String, String> streams = redis.<String, String>opsForStream();
            Range<String> range = cursor == null ? Range.unbounded() : Range.rightUnbounded(Range.Bound.exclusive(cursor));
            PendingMessages pending = streams.pending(properties.getStreamKey(), properties.getGroup(), range, properties.getPendingBatchSize());
            ArrayList<RecordId> eligible = new ArrayList<RecordId>();
            Duration idle = Duration.ofSeconds(properties.getPendingMinIdleSeconds());
            int scanned = 0;
            String last = null;
            if (pending != null) {
                for (PendingMessage entry : pending) {
                    scanned++;
                    last = entry.getIdAsString();
                    if (entry.getElapsedTimeSinceLastDelivery().compareTo(idle) >= 0) eligible.add(entry.getId());
                }
            }
            cursor = scanned < properties.getPendingBatchSize() ? null : last;
            if (eligible.isEmpty()) return 0;
            ArrayList<String> arguments = new ArrayList<String>();
            arguments.add(properties.getGroup());
            arguments.add(consumerName);
            arguments.add(Long.toString(idle.toMillis()));
            eligible.forEach(identifier -> arguments.add(identifier.getValue()));
            List claimed = redis.execute(CLAIM_PENDING, List.of(properties.getStreamKey()), arguments.toArray());
            if (claimed == null) return 0;
            for (Object message : claimed) consumer.onMessage(decode(message));
            return claimed.size();
        } catch (Exception failure) {
            log.warn("待处理回调重领失败，将在下个扫描周期重试: streamKey={}", properties.getStreamKey(), failure);
            return 0;
        }
    }

    private MapRecord<String, String, String> decode(Object value) {
        if (!(value instanceof List<?> record) || record.size() != 2 || !(record.get(0) instanceof String identifier)
                || !(record.get(1) instanceof List<?> fields) || fields.size() % 2 != 0) {
            throw new IllegalStateException("待处理回调消息结构无效");
        }
        LinkedHashMap<String, String> body = new LinkedHashMap<String, String>();
        for (int index = 0; index < fields.size(); index += 2) {
            if (!(fields.get(index) instanceof String field) || !(fields.get(index + 1) instanceof String content)) {
                throw new IllegalStateException("待处理回调字段结构无效");
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
