package com.cloudflow.common.event.config;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventDispatcher;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.core.BusinessEventEnvelopeCodec;
import com.cloudflow.common.event.core.BusinessEventIdempotentStore;
import com.cloudflow.common.event.core.BusinessEventPendingReclaimer;
import com.cloudflow.common.event.core.DeadLetterPublisher;
import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import io.lettuce.core.resource.DefaultClientResources;
import java.lang.reflect.Field;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledFuture;
import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.redisson.spring.data.connection.RedissonConnectionFactory;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.data.domain.Range;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.connection.stream.StreamReadOptions;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.data.redis.stream.StreamMessageListenerContainer;
import org.springframework.data.redis.stream.Subscription;

public final class BusinessEventRecoveryChecks {
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    private static final AtomicInteger CHECKS = new AtomicInteger();

    public static void main(String[] arguments) throws Exception {
        for (Class<?> type : List.of(BusinessEventIdempotentStore.class, EventConsumerAutoConfiguration.class,
                BusinessEventPendingReclaimer.class, DeadLetterPublisher.class, OutboxProperties.class, BusinessEventEnvelope.class)) {
            equal(Path.of(System.getenv("EVENT_CHECK_CLASSES")).toRealPath(),
                    Path.of(type.getProtectionDomain().getCodeSource().getLocation().toURI()).toRealPath(), "freshly compiled " + type.getSimpleName());
        }
        codecRoundTrips();
        int port = Integer.parseInt(System.getenv("EVENT_CHECK_REDIS_PORT"));
        String password = System.getenv("EVENT_CHECK_REDIS_PASSWORD");
        DefaultClientResources resources = DefaultClientResources.builder().ioThreadPoolSize(2).computationThreadPoolSize(2).build();
        RedisStandaloneConfiguration configuration = new RedisStandaloneConfiguration("127.0.0.1", port);
        configuration.setPassword(password);
        LettuceConnectionFactory lettuce = new LettuceConnectionFactory(configuration, LettuceClientConfiguration.builder()
                .clientResources(resources).commandTimeout(Duration.ofSeconds(5)).build());
        lettuce.afterPropertiesSet();
        lettuce.start();
        try { run(lettuce, "lettuce"); }
        finally { lettuce.destroy(); resources.shutdown().get(10, TimeUnit.SECONDS); }
        Config redissonConfig = new Config().setThreads(2).setNettyThreads(2);
        redissonConfig.useSingleServer().setAddress("redis://127.0.0.1:" + port).setPassword(password)
                .setConnectionMinimumIdleSize(1).setConnectionPoolSize(4).setSubscriptionConnectionMinimumIdleSize(1).setSubscriptionConnectionPoolSize(2);
        RedissonClient redisson = Redisson.create(redissonConfig);
        try { run(new RedissonConnectionFactory(redisson), "redisson"); }
        finally { redisson.shutdown(); }
        System.out.println("BUSINESS_EVENT_RECOVERY_CHECKS: assertions=" + CHECKS.get()
                + "; failed=0; redis_clients=2; real_redis=true; real_subscription=true; handler=controlled_idempotent_fixture; mysql=false; http=false; production_modified=false");
    }

    private static void codecRoundTrips() throws Exception {
        for (boolean timestamps : List.of(false, true)) {
            ObjectMapper mapper = new ObjectMapper().findAndRegisterModules().configure(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS, timestamps);
            for (LocalDateTime occurredAt : List.of(LocalDateTime.of(2026, 9, 19, 0, 0), LocalDateTime.of(2026, 9, 19, 0, 0, 12, 123456789))) {
                BusinessEventEnvelope original = BusinessEventEnvelope.builder().eventId(UUID.randomUUID().toString()).eventType("CODEC_ROUND_TRIP")
                        .sourceModule("cloudflow-service-oa").sourceId(42L).tenantId(100000L).payload("{\"verified\":true}")
                        .payloadDigest("codec-digest").occurredAt(occurredAt).build();
                String encoded = mapper.writeValueAsString(original);
                equal(true, mapper.readTree(encoded).path("occurredAt").isTextual(), "envelope time is canonical text regardless of mapper timestamp setting");
                equal(original, BusinessEventEnvelopeCodec.read(encoded, mapper), "event time including nanoseconds survives ordinary round trip");
                equal(original, BusinessEventEnvelopeCodec.read(mapper.writeValueAsString(encoded), mapper), "event time survives Redis JSON-string round trip");
            }
        }
    }

    private static void run(RedisConnectionFactory factory, String driver) throws Exception {
        int before = CHECKS.get();
        retryAndFanout(factory);
        concurrentDelivery(factory);
        identityAndConflicts(factory);
        deadLetterRecovery(factory);
        acknowledgmentRecovery(factory);
        leases(factory);
        reclaimFairness(factory);
        automaticRecovery(factory);
        System.out.println("BUSINESS_EVENT_REDIS_CLIENT: driver=" + driver + "; assertions=" + (CHECKS.get() - before) + "; failed=0");
    }

    private static void retryAndFanout(RedisConnectionFactory factory) throws Exception {
        try (BusinessEventRecoveryChecks.Fixture fixture = new Fixture(factory)) {
            BusinessEventEnvelope envelope = fixture.envelope();
            String otherGroup = fixture.group + "-other";
            fixture.redis.opsForStream().createGroup(fixture.stream, ReadOffset.latest(), otherGroup);
            fixture.handler = event -> {
                equal(100000L, TenantContext.getTenantId(), "handler receives exact tenant context");
                if (fixture.calls.get() == 1) throw new IllegalStateException("controlled transaction rollback");
                fixture.effect(event);
            };
            MapRecord<String, String, String> original = fixture.publish(envelope);
            fixture.process(original);
            equal(1L, fixture.pending(), "failed delivery remains pending");
            equal(0L, fixture.deadLetterCount(), "first transient failure is not discarded into dead letters");
            equal(null, TenantContext.getTenantId(), "failed handler restores tenant context");
            fixture.process(original);
            equal(2, fixture.calls.get(), "same event retries business after failure");
            equal(1, fixture.effects.size(), "successful retry commits one controlled effect");
            equal(0L, fixture.pending(), "successful retry acknowledges original record");
            fixture.process(fixture.publish(envelope));
            equal(2, fixture.calls.get(), "successful duplicate does not execute business again");
            equal(0L, fixture.pending(), "duplicate is acknowledged only after completion");
            List<MapRecord<String, String, String>> other = fixture.redis.<String, String>opsForStream().read(Consumer.from(otherGroup, "other"),
                    StreamReadOptions.empty().count(10), StreamOffset.create(fixture.stream, ReadOffset.lastConsumed()));
            equal(2, other.size(), "acknowledgment preserves shared records for other service groups");
        }
    }

    private static void concurrentDelivery(RedisConnectionFactory factory) throws Exception {
        try (BusinessEventRecoveryChecks.Fixture fixture = new Fixture(factory)) {
            CountDownLatch started = new CountDownLatch(1);
            CountDownLatch release = new CountDownLatch(1);
            fixture.handler = event -> {
                started.countDown();
                if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("controlled blocking deadline");
                fixture.effect(event);
            };
            BusinessEventEnvelope envelope = fixture.envelope();
            MapRecord<String, String, String> original = fixture.publish(envelope);
            MapRecord<String, String, String> duplicate = fixture.publish(envelope);
            ExecutorService executor = Executors.newSingleThreadExecutor();
            try {
                Future<?> work = executor.submit(() -> fixture.process(original));
                check(started.await(5, TimeUnit.SECONDS), "first concurrent handler started");
                fixture.process(duplicate);
                equal(2L, fixture.pending(), "busy duplicate cannot acknowledge unfinished business");
                equal(1, fixture.calls.get(), "busy duplicate does not enter handler");
                release.countDown();
                work.get(5, TimeUnit.SECONDS);
                fixture.process(duplicate);
                equal(0L, fixture.pending(), "duplicate acknowledgment recovers after owner finishes");
                equal(1, fixture.effects.size(), "concurrent duplicate commits once");
            } finally { release.countDown(); executor.shutdownNow(); }
        }
    }

    private static void identityAndConflicts(RedisConnectionFactory factory) throws Exception {
        try (BusinessEventRecoveryChecks.Fixture fixture = new Fixture(factory)) {
            BusinessEventEnvelope original = fixture.envelope();
            fixture.process(fixture.publish(original));
            for (String field : List.of("payload", "sourceId", "sourceModule", "eventType", "payloadDigest", "occurredAt")) {
                BusinessEventEnvelope changed = JSON.readValue(JSON.writeValueAsString(original), BusinessEventEnvelope.class);
                switch (field) {
                    case "payload" -> changed.setPayload("{\"amount\":30}");
                    case "sourceId" -> changed.setSourceId(2L);
                    case "sourceModule" -> changed.setSourceModule("different-source");
                    case "eventType" -> changed.setEventType("OTHER_TEST_EVENT");
                    case "payloadDigest" -> changed.setPayloadDigest("changed");
                    default -> changed.setOccurredAt(original.getOccurredAt().plusSeconds(1));
                }
                fixture.process(fixture.publish(changed));
                equal(1, fixture.calls.get(), "conflicting " + field + " cannot pass as successful duplicate");
                equal(0L, fixture.pending(), "conflicting payload is acknowledged after quarantine");
            }
            equal(6L, fixture.deadLetterCount(), "all immutable payload conflicts are retained");
            MapRecord<String, String, String> last = fixture.redis.<String, String>opsForStream().reverseRange(fixture.deadLetters, Range.unbounded()).get(0);
            equal("BUSINESS_EVENT_PAYLOAD_CONFLICT", decode(last.getValue().get("lastError")), "conflict has explicit failure category");
            BusinessEventEnvelope foreign = JSON.readValue(JSON.writeValueAsString(original), BusinessEventEnvelope.class);
            foreign.setTenantId(100001L);
            fixture.process(fixture.publish(foreign));
            equal(2, fixture.effects.size(), "same event identifier in another tenant has independent identity");
            foreign.setTenantId(null);
            fixture.process(fixture.publish(foreign));
            equal(2, fixture.calls.get(), "missing tenant never executes a global business handler");
            equal(7L, fixture.deadLetterCount(), "invalid tenant is retained for inspection");
            fixture.process(fixture.publish(original));
            equal(2, fixture.calls.get(), "conflicts never overwrite original completed identity");
            try (BusinessEventRecoveryChecks.Fixture second = new Fixture(factory)) {
                second.process(second.publish(original));
                equal(1, second.effects.size(), "service group identity is independent");
            }
        }
    }

    private static void deadLetterRecovery(RedisConnectionFactory factory) throws Exception {
        for (boolean nullResult : List.of(false, true)) {
            try (BusinessEventRecoveryChecks.Fixture fixture = new Fixture(factory)) {
                BusinessEventEnvelope envelope = fixture.envelope();
                fixture.handler = event -> { throw new IllegalStateException("controlled unavailable dependency"); };
                MapRecord<String, String, String> record = fixture.publish(envelope);
                fixture.process(record);
                fixture.streams.failDeadLetter = !nullResult;
                fixture.streams.nullDeadLetter = nullResult;
                fixture.process(record);
                equal(1L, fixture.pending(), "unconfirmed dead-letter write cannot acknowledge original");
                equal(0L, fixture.deadLetterCount(), "failed dead-letter write does not fabricate a retained record");
                fixture.streams.failDeadLetter = false;
                fixture.streams.nullDeadLetter = false;
                fixture.process(record);
                equal(0L, fixture.pending(), "confirmed dead-letter transfer releases original pending record");
                equal(1L, fixture.deadLetterCount(), "confirmed failed delivery is preserved once");
                MapRecord<String, String, String> saved = fixture.redis.<String, String>opsForStream().range(fixture.deadLetters, Range.unbounded()).get(0);
                BusinessEventEnvelope restored = BusinessEventEnvelopeCodec.read(decode(saved.getValue().get("payload")), JSON);
                equal(envelope, restored, "dead-letter record retains entire source envelope");
                equal(fixture.group, decode(saved.getValue().get("consumerGroup")), "dead-letter record identifies target group");
                equal(3, Integer.parseInt(decode(saved.getValue().get("retryCount"))), "real acquired attempts are persisted");
                fixture.handler = fixture::effect;
                fixture.process(fixture.publish(restored));
                equal(1, fixture.effects.size(), "same-ID dead-letter replay can recover business");
                fixture.process(fixture.publish(restored));
                equal(4, fixture.calls.get(), "successful dead-letter replay is deduplicated afterward");
            }
        }
    }

    private static void acknowledgmentRecovery(RedisConnectionFactory factory) throws Exception {
        for (boolean afterWrite : List.of(false, true)) {
            try (BusinessEventRecoveryChecks.Fixture fixture = new Fixture(factory)) {
                MapRecord<String, String, String> record = fixture.publish(fixture.envelope());
                fixture.store.failAck = true;
                fixture.store.ackBeforeFailure = afterWrite;
                fixture.process(record);
                equal(afterWrite ? 0L : 1L, fixture.pending(), "ack response fault retains actual Redis acknowledgment state");
                fixture.process(record);
                equal(1, fixture.calls.get(), "ack retry never repeats completed business");
                equal(0L, fixture.deadLetterCount(), "ack fault is not misclassified as failed business");
                equal(0L, fixture.pending(), "ack retry finishes pending record");
            }
            try (BusinessEventRecoveryChecks.Fixture fixture = new Fixture(factory)) {
                MapRecord<String, String, String> record = fixture.publish(fixture.envelope());
                fixture.store.failComplete = true;
                fixture.store.completeBeforeFailure = afterWrite;
                fixture.process(record);
                fixture.process(record);
                equal(afterWrite ? 1 : 2, fixture.calls.get(), "uncertain completion marker retries only when not stored");
                equal(1, fixture.effects.size(), "controlled durable idempotency prevents duplicate committed effect");
                equal(0L, fixture.pending(), "uncertain completion marker recovers");
            }
        }
    }

    private static void leases(RedisConnectionFactory factory) throws Exception {
        try (BusinessEventRecoveryChecks.Fixture fixture = new Fixture(factory)) {
            BusinessEventEnvelope envelope = fixture.envelope();
            MapRecord<String, String, String> record = fixture.publish(envelope);
            BusinessEventIdempotentStore.Lease first = fixture.store.acquire(fixture.group, envelope, Duration.ofMillis(150), Duration.ofHours(1));
            equal(BusinessEventIdempotentStore.State.ACQUIRED, first.state(), "lease is acquired");
            BusinessEventIdempotentStore.Lease busy = fixture.store.acquire(fixture.group, envelope, Duration.ofSeconds(1), Duration.ofHours(1));
            equal(BusinessEventIdempotentStore.State.PROCESSING, busy.state(), "live lease blocks another owner");
            Thread.sleep(220);
            BusinessEventIdempotentStore.Lease replacement = fixture.store.acquire(fixture.group, envelope, Duration.ofSeconds(2), Duration.ofHours(1));
            equal(2L, replacement.attempts(), "busy observation does not consume a business retry");
            equal(false, fixture.store.complete(first, Duration.ofHours(1)), "expired holder cannot complete replacement lease");
            equal(false, fixture.store.renew(first, Duration.ofSeconds(2), Duration.ofHours(1)), "expired holder cannot renew replacement lease");
            equal(false, fixture.store.release(first), "expired holder cannot release replacement lease");
            equal(false, fixture.store.acknowledgeFailure(first, fixture.stream, fixture.group, record.getId().getValue()), "expired holder cannot acknowledge another owner");
            equal(true, fixture.store.complete(replacement, Duration.ofHours(1)), "current owner can complete");
            equal(true, fixture.store.acknowledgeDone(replacement, fixture.stream, fixture.group, record.getId().getValue()), "completed owner acknowledges shared stream without deletion");
            BusinessEventEnvelope renewedEnvelope = fixture.envelope();
            BusinessEventIdempotentStore.Lease renewed = fixture.store.acquire(fixture.group, renewedEnvelope, Duration.ofMillis(450), Duration.ofHours(1));
            ScheduledFuture<?> renewal = fixture.store.keepAlive(renewed, Duration.ofMillis(450), Duration.ofHours(1));
            try {
                Thread.sleep(750);
                equal(BusinessEventIdempotentStore.State.PROCESSING,
                        fixture.store.acquire(fixture.group, renewedEnvelope, Duration.ofMillis(450), Duration.ofHours(1)).state(), "active handler renews beyond initial lease expiry");
            } finally { renewal.cancel(false); }
            fixture.store.release(renewed);
        }
    }

    private static void reclaimFairness(RedisConnectionFactory factory) throws Exception {
        try (BusinessEventRecoveryChecks.Fixture fixture = new Fixture(factory)) {
            fixture.properties.setConsumerPendingBatchSize(1);
            MapRecord<String, String, String> first = fixture.publish(fixture.envelope());
            MapRecord<String, String, String> second = fixture.publish(fixture.envelope());
            Thread.sleep(1150);
            fixture.redis.execute(new DefaultRedisScript<>("return redis.call('XCLAIM', KEYS[1], ARGV[1], ARGV[2], 0, ARGV[3])", List.class),
                    List.of(fixture.stream), fixture.group, "recent-owner", first.getId().getValue());
            try (BusinessEventPendingReclaimer reclaimer = fixture.reclaimer()) {
                equal(0, reclaimer.reclaimPending(), "fresh first page does not steal live delivery");
                equal(1, reclaimer.reclaimPending(), "cursor reaches old later page instead of starving it");
                equal(1, fixture.effects.size(), "abandoned later record recovered through actual pending claim");
                check(fixture.redis.opsForStream().pending(fixture.stream, fixture.group, Range.just(second.getId().getValue()), 1).isEmpty(), "recovered later record acknowledged");
            }
            Thread.sleep(1150);
            try (BusinessEventPendingReclaimer restarted = fixture.reclaimer()) {
                equal(1, restarted.reclaimPending(), "new reclaimer instance recovers remaining abandoned record");
                equal(0L, fixture.pending(), "restart recovery leaves no pending record");
                equal(2, fixture.effects.size(), "both distinct abandoned events processed once");
            }
        }
    }

    private static void automaticRecovery(RedisConnectionFactory factory) throws Exception {
        try (BusinessEventRecoveryChecks.Fixture fixture = new Fixture(factory)) {
            StandardEnvironment environment = new StandardEnvironment();
            environment.getPropertySources().addFirst(new MapPropertySource("event-check", Map.of("spring.application.name", "isolated-event-check")));
            StreamMessageListenerContainer<String, MapRecord<String, String, String>> container = fixture.configuration.businessEventContainer(factory);
            Subscription subscription = fixture.configuration.businessEventSubscription(container, fixture.streams, fixture.dispatcher,
                    fixture.deadLetterPublisher, fixture.store, JSON, fixture.properties, environment);
            BusinessEventPendingReclaimer reclaimer = fixture.configuration.businessEventPendingReclaimer(fixture.redis, fixture.streams, fixture.dispatcher,
                    fixture.deadLetterPublisher, fixture.store, JSON, fixture.properties, environment);
            fixture.handler = envelope -> {
                if (fixture.calls.get() == 1) throw new IllegalStateException("controlled first delivery failure");
                fixture.effect(envelope);
            };
            try {
                reclaimer.start();
                fixture.send(fixture.envelope());
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(12);
                while ((fixture.effects.isEmpty() || fixture.pending() != 0) && System.nanoTime() < deadline) Thread.sleep(50);
                equal(1, fixture.effects.size(), "real subscription and scheduled reclaim recover transient handler failure");
                equal(2, fixture.calls.get(), "real subscription retries exactly the failed business delivery");
                equal(0L, fixture.pending(), "scheduled recovery acknowledges only completed event");
                equal(0L, fixture.deadLetterCount(), "transient recovery avoids premature quarantine");
                check(subscription.isActive(), "subscription remains active after business failure");
            } finally { reclaimer.close(); subscription.cancel(); container.stop(); }
            equal(0, reclaimer.reclaimPending(), "closed reclaimer cannot run again");
        }
    }

    private static String decode(String value) throws Exception {
        JsonNode node = JSON.readTree(value);
        return node.isTextual() ? node.asText() : node.toString();
    }

    private static void equal(Object expected, Object actual, String message) {
        CHECKS.incrementAndGet();
        if (!Objects.equals(expected, actual)) throw new AssertionError(message + "; expected=" + expected + "; actual=" + actual);
    }

    private static void check(boolean actual, String message) { equal(true, actual, message); }

    @FunctionalInterface
    private interface Handler { void accept(BusinessEventEnvelope envelope) throws Exception; }

    private static final class Fixture implements AutoCloseable {
        final String group = "isolated-event-recovery-" + UUID.randomUUID();
        final String stream = group + ":stream";
        final String deadLetters = group + ":dlq";
        final StringRedisTemplate redis;
        final Streams streams = new Streams();
        final OutboxProperties properties = new OutboxProperties();
        final EventConsumerAutoConfiguration configuration = new EventConsumerAutoConfiguration();
        final Set<String> keys = ConcurrentHashMap.newKeySet();
        final Set<String> effects = ConcurrentHashMap.newKeySet();
        final AtomicInteger calls = new AtomicInteger();
        final TrackingStore store;
        final BusinessEventDispatcher dispatcher;
        final DeadLetterPublisher deadLetterPublisher;
        volatile Handler handler = this::effect;

        Fixture(RedisConnectionFactory factory) throws Exception {
            redis = new StringRedisTemplate(factory);
            RedisTemplate<String, Object> template = new RedisTemplate<String, Object>();
            template.setConnectionFactory(factory);
            template.setKeySerializer(new StringRedisSerializer());
            template.setHashKeySerializer(new StringRedisSerializer());
            template.setValueSerializer(new GenericJackson2JsonRedisSerializer());
            template.setHashValueSerializer(new GenericJackson2JsonRedisSerializer());
            template.afterPropertiesSet();
            Field field = RedisStreamUtil.class.getDeclaredField("redisTemplate");
            field.setAccessible(true);
            field.set(streams, template);
            redis.opsForStream().add(MapRecord.create(stream, Map.of("bootstrap", "1")));
            redis.opsForStream().createGroup(stream, ReadOffset.latest(), group);
            keys.add(stream); keys.add(deadLetters);
            properties.setStreamKey(stream); properties.setDlqStreamKey(deadLetters); properties.setConsumerGroup(group);
            properties.setConsumerProcessingLeaseSeconds(1); properties.setConsumerPendingMinIdleSeconds(1);
            properties.setConsumerPendingPollIntervalSeconds(1); properties.setConsumerMaxRetry(2);
            store = new TrackingStore(redis, keys);
            ArrayList<BusinessEventConsumer> consumers = new ArrayList<BusinessEventConsumer>();
            for (String type : List.of("TEST_EVENT", "OTHER_TEST_EVENT")) {
                consumers.add(new BusinessEventConsumer() {
                    public String eventType() { return type; }
                    public void consume(BusinessEventEnvelope envelope) throws Exception { calls.incrementAndGet(); handler.accept(envelope); }
                });
            }
            dispatcher = new BusinessEventDispatcher(consumers);
            deadLetterPublisher = new DeadLetterPublisher(streams, deadLetters);
        }

        BusinessEventEnvelope envelope() {
            return BusinessEventEnvelope.builder().eventId(UUID.randomUUID().toString()).eventType("TEST_EVENT").tenantId(100000L)
                    .sourceModule("isolated-source").sourceId(1L).payload("{\"amount\":20}").payloadDigest("source-digest")
                    .occurredAt(LocalDateTime.of(2026, 9, 19, 0, 0)).build();
        }

        void send(BusinessEventEnvelope envelope) throws Exception {
            streams.publishGlobal(stream, Map.of("eventId", envelope.getEventId(), "payload", JSON.writeValueAsString(envelope)));
        }

        MapRecord<String, String, String> publish(BusinessEventEnvelope envelope) throws Exception {
            send(envelope);
            return redis.<String, String>opsForStream().read(Consumer.from(group, "abandoned-owner"), StreamReadOptions.empty().count(1),
                    StreamOffset.create(stream, ReadOffset.lastConsumed())).get(0);
        }

        void process(MapRecord<String, String, String> message) {
            configuration.onMessage(message, dispatcher, deadLetterPublisher, store, JSON, properties, streams, group, "isolated-check");
        }

        void effect(BusinessEventEnvelope envelope) { effects.add(envelope.getTenantId() + ":" + envelope.getEventId()); }
        long pending() { return redis.opsForStream().pending(stream, group).getTotalPendingMessages(); }
        long deadLetterCount() { Long count = redis.opsForStream().size(deadLetters); return count == null ? 0 : count; }
        BusinessEventPendingReclaimer reclaimer() { return new BusinessEventPendingReclaimer(redis, properties, group, this::process); }
        public void close() { store.close(); redis.delete(keys); }
    }

    private static final class Streams extends RedisStreamUtil {
        boolean failDeadLetter;
        boolean nullDeadLetter;
        @Override public String publishGlobal(String key, Map<String, Object> content) {
            if (key.endsWith(":dlq") && failDeadLetter) throw new IllegalStateException("controlled dead-letter transport failure");
            if (key.endsWith(":dlq") && nullDeadLetter) return null;
            return super.publishGlobal(key, content);
        }
    }

    private static final class TrackingStore extends BusinessEventIdempotentStore {
        final Set<String> keys;
        boolean failAck;
        boolean ackBeforeFailure;
        boolean failComplete;
        boolean completeBeforeFailure;
        TrackingStore(StringRedisTemplate redis, Set<String> keys) { super(redis); this.keys = keys; }
        @Override public Lease acquire(String scope, BusinessEventEnvelope envelope, Duration processing, Duration retention) {
            Lease lease = super.acquire(scope, envelope, processing, retention);
            keys.add(lease.key());
            return lease;
        }
        @Override public boolean acknowledgeDone(Lease lease, String stream, String group, String identifier) {
            if (failAck) {
                failAck = false;
                if (ackBeforeFailure) super.acknowledgeDone(lease, stream, group, identifier);
                throw new IllegalStateException("controlled acknowledgment response loss");
            }
            return super.acknowledgeDone(lease, stream, group, identifier);
        }
        @Override public boolean complete(Lease lease, Duration retention) {
            if (failComplete) {
                failComplete = false;
                if (completeBeforeFailure) super.complete(lease, retention);
                throw new IllegalStateException("controlled completion marker response loss");
            }
            return super.complete(lease, retention);
        }
    }
}
