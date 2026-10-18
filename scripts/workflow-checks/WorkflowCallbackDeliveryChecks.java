import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.config.RedisConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackAutoConfiguration;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackProperties;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.listener.DefaultDeadLetterHandler;
import com.cloudflow.common.workflow.callback.listener.WorkflowApprovalCallbackStreamConsumer;
import com.cloudflow.common.workflow.callback.listener.WorkflowCallbackPendingReclaimer;
import com.cloudflow.common.workflow.callback.service.CallbackIdempotentStore;
import com.cloudflow.common.workflow.callback.service.WorkflowCallbackService;
import com.cloudflow.common.workflow.callback.util.WorkflowCallbackMetadata;
import com.cloudflow.workflow.callback.CallbackDlqReplayer;
import com.cloudflow.workflow.domain.WfCallbackDeadLetter;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.event.ApprovalResultStreamPublisher;
import com.cloudflow.workflow.event.ProcessCompletedEvent;
import com.cloudflow.workflow.event.ProcessRejectedEvent;
import com.cloudflow.workflow.mapper.WfCallbackDeadLetterMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.service.WorkflowTriggerService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.redisson.config.SingleServerConfig;
import org.redisson.spring.data.connection.RedissonConnectionFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.DependsOn;
import org.springframework.data.domain.Range;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.RedisStreamCommands;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.PendingMessage;
import org.springframework.data.redis.connection.stream.PendingMessages;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.connection.stream.StreamReadOptions;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StreamOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.data.redis.stream.StreamMessageListenerContainer;
import org.springframework.data.redis.stream.Subscription;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

public final class WorkflowCallbackDeliveryChecks {
    private static final Long TENANT = 100010L;
    private static final Long FOREIGN = 200020L;
    private static final String INSTANCE = "27182818-2845-4090-9235-360287471352";
    private static final String TOKEN = "F:31415926-5358-4793-8238-462643383279";
    private static final String TYPE = WorkflowCallbackMetadata.CONSUMABLE_REQUEST;
    private static final String STREAM = "offline:callback:stream";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final AtomicInteger CHECKS = new AtomicInteger();

    public static void main(String[] arguments) throws Exception {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "callback-checks"), WfProcessInstance.class);
        identity(TENANT);
        try {
            for (Class<?> type : List.of(ApprovalResultStreamPublisher.class, CallbackDlqReplayer.class,
                    WorkflowApprovalCallbackStreamConsumer.class, WorkflowCallbackPendingReclaimer.class, CallbackIdempotentStore.class)) {
                equal(Path.of(System.getenv("CALLBACK_CHECK_CLASS_DIR")).toRealPath(),
                        Path.of(type.getProtectionDomain().getCodeSource().getLocation().toURI()).toRealPath(), "modified class is freshly compiled: " + type.getSimpleName());
            }
            metadataAndPublication();
            replayBoundaries();
            offlineDelivery();
            pendingProtocolAndConfiguration();
            int offline = CHECKS.get();
            System.out.println("PASS: callback offline checks=" + offline + "; real source, simulated database/Redis protocol; no online approval");
            if ("1".equals(System.getenv("CALLBACK_CHECK_REDIS"))) {
                redisChecks();
                redissonChecks();
                System.out.println("PASS: callback isolated Redis checks=" + (CHECKS.get() - offline)
                        + "; random owned keys only; real Lua, pending, claim and competing consumers; total=" + CHECKS.get());
            }
        } finally {
            UserContext.clear();
            TenantContext.clear();
        }
    }

    private static void metadataAndPublication() throws Exception {
        equal(Map.of("oaRequestToken", TOKEN), WorkflowCallbackMetadata.variables(TYPE,
                Map.of("oaRequestToken", TOKEN, "amount", "PRIVATE_AMOUNT", "formData", "PRIVATE_FORM", "model", "PRIVATE_MODEL")), "metadata uses one exact allowlisted key");
        equal(Map.of(), WorkflowCallbackMetadata.variables("LEGACY_REQUEST", Map.of("formData", "PRIVATE_FORM")), "legacy callbacks require no new token");
        for (Object invalid : Arrays.asList(null, "", " ", TOKEN + " ", " " + TOKEN, TOKEN.substring(2),
                "F:1-2-3-4-5", "F:" + "a".repeat(36), 100L, Map.of("token", TOKEN))) {
            HashMap<String, Object> fields = new HashMap<String, Object>();
            fields.put("oaRequestToken", invalid);
            rejects(IllegalArgumentException.class, () -> WorkflowCallbackMetadata.variables(TYPE, fields), "invalid OA token");
        }
        String encoded = TOKEN;
        for (int depth = 0; depth < 3; depth++) {
            encoded = JSON.writeValueAsString(encoded);
            equal(TOKEN, WorkflowCallbackMetadata.decodeStreamValue(encoded), "supported legacy string encoding layer " + depth);
        }
        String tooDeep = JSON.writeValueAsString(encoded);
        rejects(IllegalArgumentException.class, () -> WorkflowCallbackMetadata.decodeStreamValue(tooDeep), "unbounded string encoding");
        rejects(IllegalArgumentException.class, () -> WorkflowCallbackMetadata.decodeStreamValue("\"" + TOKEN + "\" {}"), "trailing JSON tokens");
        WorkflowCallbackDeliveryChecks.ReplayFixture fixture = new ReplayFixture();
        ApprovalResultStreamPublisher publisher = new ApprovalResultStreamPublisher(fixture.instanceMapper, fixture.streams, JSON, null);
        publisher.onProcessCompleted(new ProcessCompletedEvent(fixture, INSTANCE, "consumable", 19L, "reviewer"));
        Map<String, Object> sent = fixture.streams.published.get(0);
        equal(TOKEN, sent.get("oaRequestToken"), "publisher forwards persisted reservation token");
        equal(WorkflowCallbackMetadata.MESSAGE_FIELDS, sent.keySet(), "publisher sends only callback fields and one metadata field");
        check(!sent.toString().contains("PRIVATE_"), "publisher never leaks form, amount or approval model");
        equal("APPROVED", sent.get("approvalResult"), "completion result is retained");
        publisher.onProcessRejected(new ProcessRejectedEvent(fixture, INSTANCE, "consumable", 19L, "reviewer", "review", "declined"));
        equal("REJECTED", fixture.streams.published.get(1).get("approvalResult"), "rejected callback also carries token");
        Map<String, Object> variables = fixture.variables();
        variables.remove("oaRequestToken");
        fixture.instance.setVariables(JSON.writeValueAsString(variables));
        rejects(IllegalArgumentException.class,
                () -> publisher.onProcessCompleted(new ProcessCompletedEvent(fixture, INSTANCE, "consumable", 19L, "reviewer")), "publisher rejects missing required token");
        equal(2, fixture.streams.published.size(), "invalid publication never reaches the stream");
        variables.put("businessType", "LEGACY_REQUEST");
        fixture.instance.setVariables(JSON.writeValueAsString(variables));
        publisher.onProcessCompleted(new ProcessCompletedEvent(fixture, INSTANCE, "legacy", null, null));
        check(!fixture.streams.published.get(2).containsKey("oaRequestToken"), "legacy publication remains token optional");
        fixture.streams.failPublish = true;
        rejects(IllegalStateException.class,
                () -> publisher.onProcessCompleted(new ProcessCompletedEvent(fixture, INSTANCE, "legacy", null, null)), "unconfirmed publish cannot look successful");
    }

    private static void replayBoundaries() throws Exception {
        WorkflowCallbackDeliveryChecks.ReplayFixture valid = new ReplayFixture();
        valid.replayer.replay(valid.deadLetter);
        equal(1, valid.updates, "successful replay updates only its dead-letter record");
        equal("REPLAYED", valid.deadLetter.getStatus(), "successful replay marks the dead letter");
        equal(TOKEN, valid.streams.published.get(0).get("oaRequestToken"), "old missing token is restored from the persisted instance");
        check(!valid.streams.published.get(0).toString().contains("PRIVATE_"), "replay strips full variables and private payload fields");
        equal("PASSED", valid.instance.getStatus(), "replay cannot change process state");
        equal(1, valid.instanceReads, "replay reads the persisted instance under an explicit tenant predicate");
        WorkflowCallbackDeliveryChecks.ReplayFixture rejected = new ReplayFixture();
        rejected.instance.setStatus("REJECTED");
        rejected.payload.put("approvalResult", "REJECTED");
        rejected.sync();
        rejected.replayer.replay(rejected.deadLetter);
        equal("REJECTED", rejected.streams.published.get(0).get("approvalResult"), "persisted rejected result can be replayed");
        WorkflowCallbackDeliveryChecks.ReplayFixture encoded = new ReplayFixture();
        encoded.payload.put("oaRequestToken", TOKEN);
        for (String field : new ArrayList<>(encoded.payload.keySet())) {
            encoded.payload.put(field, JSON.writeValueAsString(JSON.writeValueAsString(encoded.payload.get(field))));
        }
        encoded.sync();
        encoded.replayer.replay(encoded.deadLetter);
        equal(TOKEN, encoded.streams.published.get(0).get("oaRequestToken"), "old encoded payload is normalized without changing token");
        List<ReplayMutation> invalid = List.of(
                new ReplayMutation("foreign dead letter", fixture -> fixture.deadLetter.setTenantId(FOREIGN)),
                new ReplayMutation("foreign stored instance", fixture -> fixture.instance.setTenantId(FOREIGN)),
                new ReplayMutation("wrong stored instance", fixture -> fixture.instance.setInstanceId(UUID.randomUUID().toString())),
                new ReplayMutation("deleted instance", fixture -> fixture.instance.setDeleted(1)),
                new ReplayMutation("non-final instance", fixture -> fixture.instance.setStatus("RUNNING")),
                new ReplayMutation("cancelled instance", fixture -> fixture.instance.setStatus("CANCELLED")),
                new ReplayMutation("wrong final result", fixture -> fixture.payload.put("approvalResult", "REJECTED")),
                new ReplayMutation("forged payload tenant", fixture -> fixture.payload.put("tenantId", FOREIGN.toString())),
                new ReplayMutation("forged payload type", fixture -> fixture.payload.put("businessType", "LEGACY_REQUEST")),
                new ReplayMutation("forged business id", fixture -> fixture.payload.put("businessId", "999")),
                new ReplayMutation("forged instance id", fixture -> fixture.payload.put("processInstanceId", UUID.randomUUID().toString())),
                new ReplayMutation("forged token", fixture -> fixture.payload.put("oaRequestToken", "F:00000000-0000-4000-8000-000000000000")),
                new ReplayMutation("blank token", fixture -> fixture.payload.put("oaRequestToken", "")),
                new ReplayMutation("padded token", fixture -> fixture.payload.put("oaRequestToken", TOKEN + " ")),
                new ReplayMutation("wrong stream", fixture -> fixture.deadLetter.setStreamKey("another:callback:stream")),
                new ReplayMutation("already replayed", fixture -> fixture.deadLetter.setStatus("REPLAYED")),
                new ReplayMutation("missing instance", fixture -> fixture.missingInstance = true));
        for (ReplayMutation mutation : invalid) {
            WorkflowCallbackDeliveryChecks.ReplayFixture fixture = new ReplayFixture();
            mutation.apply().accept(fixture);
            fixture.sync();
            rejects(RuntimeException.class, () -> fixture.replayer.replay(fixture.deadLetter), mutation.label());
            equal(0, fixture.streams.published.size(), mutation.label() + " never publishes");
            equal(0, fixture.updates, mutation.label() + " never marks the dead letter replayed");
        }
        for (String field : List.of("businessType", "businessId", "oaRequestToken")) {
            WorkflowCallbackDeliveryChecks.ReplayFixture fixture = new ReplayFixture();
            Map<String, Object> variables = fixture.variables();
            variables.put(field, "wrong");
            fixture.instance.setVariables(JSON.writeValueAsString(variables));
            rejects(RuntimeException.class, () -> fixture.replayer.replay(fixture.deadLetter), "persisted metadata mismatch " + field);
            equal(0, fixture.streams.published.size(), "invalid persisted metadata cannot produce a replay");
        }
        WorkflowCallbackDeliveryChecks.ReplayFixture absent = new ReplayFixture();
        identity(null);
        rejects(IllegalArgumentException.class, () -> absent.replayer.replay(absent.deadLetter), "missing tenant context");
        identity(TENANT);
        TenantContext.setTenantId(FOREIGN);
        rejects(IllegalArgumentException.class, () -> absent.replayer.replay(absent.deadLetter), "conflicting tenant contexts");
        identity(TENANT);
        WorkflowCallbackDeliveryChecks.ReplayFixture legacy = new ReplayFixture();
        Map<String, Object> variables = legacy.variables();
        variables.put("businessType", "LEGACY_REQUEST");
        variables.remove("oaRequestToken");
        legacy.instance.setVariables(JSON.writeValueAsString(variables));
        legacy.deadLetter.setBusinessType("LEGACY_REQUEST");
        legacy.payload.put("businessType", "LEGACY_REQUEST");
        legacy.sync();
        legacy.replayer.replay(legacy.deadLetter);
        check(!legacy.streams.published.get(0).containsKey("oaRequestToken"), "legacy final callbacks remain replayable without an OA token");
        WorkflowCallbackDeliveryChecks.ReplayFixture trigger = new ReplayFixture();
        trigger.deadLetter.setBusinessType(WorkflowTriggerService.BUSINESS_TYPE);
        trigger.replayer.replay(trigger.deadLetter);
        equal(1, trigger.triggerReplays, "existing workflow trigger replay remains delegated");
        equal(0, trigger.instanceReads, "trigger replay is not reinterpreted as an approval callback");
    }

    private static void offlineDelivery() throws Exception {
        WorkflowCallbackDeliveryChecks.MemoryRedis memory = new MemoryRedis();
        WorkflowCallbackDeliveryChecks.ProbeStreams streams = new ProbeStreams();
        WorkflowCallbackProperties properties = properties(STREAM);
        AtomicInteger calls = new AtomicInteger();
        try (CallbackIdempotentStore store = new CallbackIdempotentStore(memory, "offline:idem:")) {
            AtomicReference<ApprovalResultDTO> captured = new AtomicReference<ApprovalResultDTO>();
            WorkflowApprovalCallbackStreamConsumer consumer = consumer(dto -> { calls.incrementAndGet(); captured.set(dto); equal(TENANT, UserContext.getTenantId(), "consumer supplies tenant user context");
                equal(TENANT, TenantContext.getTenantId(), "consumer supplies SQL tenant context"); }, streams, properties, store);
            Map<String, String> original = body();
            original.put("oaRequestToken", TOKEN);
            original.put("variables", "PRIVATE_VARIABLES");
            consumer.onMessage(record("1-0", original, STREAM));
            equal(Map.of("oaRequestToken", TOKEN), captured.get().getVariables(), "consumer restores one allowlisted DTO variable");
            equal(List.of("1-0"), memory.acknowledged, "success is acknowledged only after DONE");
            equal(TENANT, UserContext.getTenantId(), "consumer restores prior user tenant");
            consumer.onMessage(record("2-0", original, STREAM));
            equal(1, calls.get(), "completed duplicate never repeats business work");
            equal(List.of("1-0", "2-0"), memory.acknowledged, "completed duplicate can be acknowledged");
        }
        processingCompetition();
        WorkflowCallbackDeliveryChecks.MemoryRedis failedMemory = new MemoryRedis();
        WorkflowCallbackDeliveryChecks.ProbeStreams failedStreams = new ProbeStreams();
        try (CallbackIdempotentStore store = new CallbackIdempotentStore(failedMemory, "offline:failure:")) {
            AtomicInteger attempts = new AtomicInteger();
            WorkflowApprovalCallbackStreamConsumer consumer = consumer(dto -> { if (attempts.incrementAndGet() == 1) throw new IllegalStateException("business-failed"); }, failedStreams, properties, store);
            consumer.onMessage(record("3-0", tokenBody(), STREAM));
            equal(0, failedMemory.acknowledged.size(), "business failure cannot acknowledge before retry");
            consumer.onMessage(record("3-0", tokenBody(), STREAM));
            equal(2, attempts.get(), "failed owner releases its short lease for retry");
            equal(List.of("3-0"), failedMemory.acknowledged, "successful retry is acknowledged");
        }
        WorkflowCallbackDeliveryChecks.ProbeStreams poisonStreams = new ProbeStreams();
        WorkflowCallbackDeliveryChecks.MemoryRedis poisonMemory = new MemoryRedis();
        try (CallbackIdempotentStore store = new CallbackIdempotentStore(poisonMemory, "offline:poison:")) {
            WorkflowApprovalCallbackStreamConsumer consumer = consumer(dto -> { throw new AssertionError("Missing token reached business code"); }, poisonStreams, properties, store);
            consumer.onMessage(record("4-0", body(), STREAM));
            equal(0, poisonStreams.acknowledged.size(), "old missing-token message stays pending below retry limit");
            poisonStreams.deliveryCount = 5;
            poisonStreams.failPublish = true;
            consumer.onMessage(record("4-0", body(), STREAM));
            equal(0, poisonStreams.acknowledged.size(), "unconfirmed dead letter publication cannot discard original message");
            poisonStreams.failPublish = false;
            Map<String, String> encoded = body();
            encoded.replaceAll((field, value) -> encode(value));
            encoded.put("variables", "PRIVATE_VARIABLES");
            consumer.onMessage(record("4-0", encoded, STREAM));
            equal(List.of("4-0"), poisonStreams.acknowledged, "old poison message is acknowledged after durable dead letter forwarding");
            Map<String, Object> payload = poisonStreams.published.get(0);
            equal(TENANT.toString(), payload.get("tenantId"), "dead-letter forwarding removes the previous JSON string encoding layer");
            check(!payload.containsKey("variables"), "dead-letter forwarding cannot include full variables");
        }
        WorkflowCallbackDeliveryChecks.MemoryRedis ackMemory = new MemoryRedis();
        ackMemory.failAcknowledge = true;
        AtomicInteger ackCalls = new AtomicInteger();
        try (CallbackIdempotentStore store = new CallbackIdempotentStore(ackMemory, "offline:ack:")) {
            WorkflowApprovalCallbackStreamConsumer consumer = consumer(dto -> ackCalls.incrementAndGet(), new ProbeStreams(), properties, store);
            consumer.onMessage(record("5-0", tokenBody(), STREAM));
            equal(0, ackMemory.acknowledged.size(), "failed acknowledgement leaves the message pending");
            ackMemory.failAcknowledge = false;
            consumer.onMessage(record("5-0", tokenBody(), STREAM));
            equal(1, ackCalls.get(), "acknowledgement retry honors the retained DONE marker");
            equal(List.of("5-0"), ackMemory.acknowledged, "acknowledgement retry completes without repeating business work");
        }
        WorkflowCallbackDeliveryChecks.MemoryRedis staleMemory = new MemoryRedis();
        WorkflowCallbackDeliveryChecks.ProbeStreams staleStreams = new ProbeStreams();
        staleStreams.deliveryCount = 5;
        try (CallbackIdempotentStore store = new CallbackIdempotentStore(staleMemory, "offline:stale:")) {
            AtomicReference<CallbackIdempotentStore.Lease> nextOwner = new AtomicReference<CallbackIdempotentStore.Lease>();
            WorkflowApprovalCallbackStreamConsumer consumer = consumer(dto -> {
                staleMemory.clock.addAndGet(31_000);
                CallbackIdempotentStore.Lease replacement = store.acquire(TENANT, INSTANCE, Duration.ofSeconds(30));
                nextOwner.set(replacement);
                check(store.complete(replacement, Duration.ofHours(72)), "replacement owner records successful completion");
                throw new IllegalStateException("old-owner-failed");
            }, staleStreams, properties, store);
            consumer.onMessage(record("6-0", tokenBody(), STREAM));
            equal("DONE", staleMemory.value(nextOwner.get().key()), "late old-owner failure cannot delete new success");
            equal(0, staleStreams.published.size(), "old owner cannot create a dead letter after losing its lease");
            equal(0, staleMemory.acknowledged.size(), "old owner cannot acknowledge a message it no longer owns");
        }
    }

    private static void processingCompetition() throws Exception {
        WorkflowCallbackDeliveryChecks.MemoryRedis memory = new MemoryRedis();
        AtomicInteger calls = new AtomicInteger();
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService workers = Executors.newFixedThreadPool(2);
        try (CallbackIdempotentStore store = new CallbackIdempotentStore(memory, "offline:competing:")) {
            WorkflowApprovalCallbackStreamConsumer consumer = consumer(dto -> { calls.incrementAndGet(); entered.countDown(); await(release); }, new ProbeStreams(), properties(STREAM), store);
            Future<?> first = workers.submit(() -> consumer.onMessage(record("10-0", tokenBody(), STREAM)));
            await(entered);
            workers.submit(() -> consumer.onMessage(record("11-0", tokenBody(), STREAM))).get(5, TimeUnit.SECONDS);
            equal(1, calls.get(), "PROCESSING duplicate cannot enter business work");
            equal(0, memory.acknowledged.size(), "PROCESSING duplicate cannot acknowledge either delivery");
            release.countDown();
            first.get(5, TimeUnit.SECONDS);
            equal(List.of("10-0"), memory.acknowledged, "only finished delivery is acknowledged");
            consumer.onMessage(record("11-0", tokenBody(), STREAM));
            equal(1, calls.get(), "pending duplicate is safe after completion");
            equal(2, memory.acknowledged.size(), "pending duplicate is eventually acknowledged after DONE");
        } finally {
            release.countDown();
            workers.shutdownNow();
        }
    }

    private static void pendingProtocolAndConfiguration() throws Exception {
        WorkflowCallbackProperties properties = properties(STREAM);
        equal(60L, properties.getPendingMinIdleSeconds(), "default reclaim idle floor is 60 seconds");
        equal(30L, properties.getProcessingLeaseSeconds(), "default processing lease is 30 seconds");
        equal(72, properties.getIdempotentTtlHours(), "DONE retention remains configurable with a 72-hour default");
        equal(100, properties.getPendingBatchSize(), "default pending scan is bounded to 100");
        properties.setPendingMinIdleSeconds(59);
        rejects(IllegalArgumentException.class, properties::validate, "unsafe reclaim idle floor");
        properties.setPendingMinIdleSeconds(60);
        properties.setProcessingLeaseSeconds(61);
        rejects(IllegalArgumentException.class, properties::validate, "unbounded processing lease");
        properties.setProcessingLeaseSeconds(30);
        properties.setPendingBatchSize(101);
        rejects(IllegalArgumentException.class, properties::validate, "unbounded pending batch");
        properties.setPendingBatchSize(2);
        properties.setPendingPollIntervalSeconds(0);
        rejects(IllegalArgumentException.class, properties::validate, "busy polling interval");
        properties.setPendingPollIntervalSeconds(10);
        WorkflowCallbackDeliveryChecks.PendingRedis pending = new PendingRedis();
        pending.entries.add(new PendingEntry("1000-0", 59_999));
        pending.entries.add(new PendingEntry("1001-0", 1));
        pending.entries.add(new PendingEntry("1002-0", 60_000));
        ArrayList<String> delivered = new ArrayList<String>();
        try (WorkflowCallbackPendingReclaimer reclaimer = new WorkflowCallbackPendingReclaimer(pending, properties, message -> delivered.add(message.getId().getValue()))) {
            equal(0, reclaimer.reclaimPending(), "young first batch is never claimed");
            equal(0, pending.claimCalls, "no empty or early claim is sent");
            equal(1, reclaimer.reclaimPending(), "cursor reaches eligible pending outside the first batch");
            equal(List.of("1002-0"), delivered, "claimed record is handed to the supplied consumer");
            equal(Duration.ofSeconds(60), pending.minIdle, "XCLAIM repeats the server-side idle floor");
            check(pending.counts.stream().allMatch(count -> count == 2L), "every XPENDING request obeys the configured batch bound");
            reclaimer.close();
            int requests = pending.counts.size();
            equal(0, reclaimer.reclaimPending(), "closed reclaimer performs no work");
            equal(requests, pending.counts.size(), "closed reclaimer makes no Redis request");
        }
        Method method = WorkflowCallbackAutoConfiguration.class.getMethod("workflowCallbackPendingReclaimer", StringRedisTemplate.class,
                WorkflowCallbackProperties.class, WorkflowApprovalCallbackStreamConsumer.class);
        equal("start", method.getAnnotation(Bean.class).initMethod(), "pending scan starts with the bean lifecycle");
        equal("close", method.getAnnotation(Bean.class).destroyMethod(), "pending scan stops with the bean lifecycle");
        equal(List.of("workflowApprovalCallbackSubscription"), List.of(method.getAnnotation(DependsOn.class).value()), "group setup precedes pending scanning");
        groupInitialization();
    }

    private static void redisChecks() throws Exception {
        try (WorkflowCallbackDeliveryChecks.RedisFixture fixture = new RedisFixture()) {
            fixture.createGroup();
            try (CallbackIdempotentStore store = new CallbackIdempotentStore(fixture.redis, fixture.namespace + ":idem:")) {
                CallbackIdempotentStore.Lease lease = store.acquire(TENANT, "lease-race", Duration.ofMillis(120));
                equal(CallbackIdempotentStore.State.ACQUIRED, lease.state(), "real Redis grants first processing lease");
                equal(CallbackIdempotentStore.State.PROCESSING,
                        store.acquire(TENANT, "lease-race", Duration.ofSeconds(30)).state(), "real Redis distinguishes PROCESSING from DONE");
                CallbackIdempotentStore.Lease foreign = store.acquire(FOREIGN, "lease-race", Duration.ofSeconds(30));
                equal(CallbackIdempotentStore.State.ACQUIRED, foreign.state(), "same instance id is isolated by tenant");
                check(store.release(foreign), "foreign tenant lease can be released independently");
                Thread.sleep(180);
                CallbackIdempotentStore.Lease replacement = store.acquire(TENANT, "lease-race", Duration.ofSeconds(30));
                equal(CallbackIdempotentStore.State.ACQUIRED, replacement.state(), "expired owner cannot block restarted worker");
                check(!store.release(lease), "old failed owner cannot release new processing lease");
                check(!store.complete(lease, Duration.ofHours(72)), "old owner cannot declare new worker completed");
                check(!store.renew(lease, Duration.ofSeconds(30)), "old owner cannot renew new worker lease");
                check(store.complete(replacement, Duration.ofHours(72)), "new owner can mark completion");
                check(!store.release(lease), "old failure cannot delete new DONE marker");
                fixture.redis.guard(replacement.key());
                equal("DONE", fixture.redis.opsForValue().get(replacement.key()), "DONE survives stale release");
                long ttl = fixture.redis.getExpire(replacement.key(), TimeUnit.MILLISECONDS);
                check(ttl > Duration.ofHours(71).toMillis() && ttl <= Duration.ofHours(72).toMillis(), "real DONE retention is 72 hours");
                CallbackIdempotentStore.Lease renewal = store.acquire(TENANT, "renewal", Duration.ofMillis(180));
                Thread.sleep(70);
                check(store.renew(renewal, Duration.ofSeconds(1)), "current owner can renew short processing lease");
                fixture.redis.guard(renewal.key());
                check(fixture.redis.getExpire(renewal.key(), TimeUnit.MILLISECONDS) > 500, "renewal extends only current owner TTL");
                check(store.release(renewal), "renewed processing lease is releasable");
                String failedRecord = fixture.streams.publishGlobal(fixture.stream, new LinkedHashMap<>(tokenBody()));
                fixture.read();
                CallbackIdempotentStore.Lease expiredFailure = store.acquire(TENANT, "failure-ack-race", Duration.ofMillis(100));
                Thread.sleep(160);
                CallbackIdempotentStore.Lease liveFailure = store.acquire(TENANT, "failure-ack-race", Duration.ofSeconds(30));
                check(!store.acknowledgeFailure(expiredFailure, fixture.stream, fixture.group, failedRecord), "old failed owner cannot atomically acknowledge new owner pending entry");
                equal(1L, fixture.pending(), "rejected stale acknowledgement keeps original pending record");
                check(store.acknowledgeFailure(liveFailure, fixture.stream, fixture.group, failedRecord), "current owner can atomically finish confirmed failure routing");
                equal(0L, fixture.pending(), "owned failure acknowledgement clears only its pending entry");
                redisCompetition(fixture, store);
                redisReclaimAndReplay(fixture, store, fixture.redis);
                redisBusinessFailure(fixture, store);
            }
            subscriptionRecovery(fixture, fixture.factory, "Lettuce");
        } catch (AssertionError failure) {
            throw failure;
        } catch (Exception failure) {
            throw new IllegalStateException("Isolated Redis verification failed; exception type=" + failure.getClass().getSimpleName());
        }
    }

    private static void redissonChecks() throws Exception {
        try (WorkflowCallbackDeliveryChecks.RedisFixture fixture = new RedisFixture()) {
            fixture.createGroup();
            Config configuration = new Config().setThreads(2).setNettyThreads(2);
            SingleServerConfig server = configuration.useSingleServer()
                    .setAddress("redis://" + System.getenv("REDIS_HOST") + ":" + System.getenv("REDIS_PORT"))
                    .setDatabase(Integer.parseInt(System.getenv("REDIS_DB")))
                    .setConnectionMinimumIdleSize(1).setConnectionPoolSize(4)
                    .setSubscriptionConnectionMinimumIdleSize(1).setSubscriptionConnectionPoolSize(2);
            String password = System.getenv("REDIS_PASSWORD");
            if (password != null && !password.isEmpty()) server.setPassword(password);
            RedissonClient client = Redisson.create(configuration);
            RedissonConnectionFactory factory = new RedissonConnectionFactory(client);
            WorkflowCallbackDeliveryChecks.SafeRedisTemplate redis = new SafeRedisTemplate(factory, fixture.namespace);
            try {
                WorkflowCallbackProperties properties = properties(fixture.stream);
                ArrayList<MapRecord<String, String, String>> delivered = new ArrayList<MapRecord<String, String, String>>();
                String identifier = fixture.streams.publishGlobal(fixture.stream, new LinkedHashMap<>(tokenBody()));
                fixture.read();
                try (WorkflowCallbackPendingReclaimer first = new WorkflowCallbackPendingReclaimer(redis, properties, delivered::add);
                     WorkflowCallbackPendingReclaimer second = new WorkflowCallbackPendingReclaimer(redis, properties, delivered::add)) {
                    equal(0, first.reclaimPending(), "production Redisson adapter preserves the 60-second idle floor");
                    fixture.age(identifier, 60_001);
                    equal(1, first.reclaimPending(), "production Redisson adapter claims an abandoned callback without option null failures");
                    equal(1, delivered.size(), "Redisson claim decodes exactly one record");
                    equal(identifier, delivered.get(0).getId().getValue(), "Redisson claim preserves the original message identifier");
                    equal(TOKEN, WorkflowCallbackMetadata.decodeStreamValue(delivered.get(0).getValue().get("oaRequestToken")), "Redisson claim preserves request identity metadata");
                    equal(2L, fixture.deliveries(identifier), "Redisson claim increments the durable delivery counter exactly once");
                    equal(0, second.reclaimPending(), "Redisson claim resets idle time and prevents immediate competing reclaim");
                    equal(2L, fixture.deliveries(identifier), "idle rejection does not inflate delivery count");
                }
                fixture.streams.ackGlobal(fixture.stream, fixture.group, identifier);
                fixture.streams.deleteGlobal(fixture.stream, identifier);
                try (CallbackIdempotentStore store = new CallbackIdempotentStore(redis, fixture.namespace + ":redisson-idem:")) {
                    redisReclaimAndReplay(fixture, store, redis);
                }
                subscriptionRecovery(fixture, factory, "Redisson");
            } finally {
                fixture.redis.owned.addAll(redis.owned);
                client.shutdown();
            }
        } catch (AssertionError failure) {
            throw failure;
        } catch (Exception failure) {
            throw new IllegalStateException("Isolated Redisson verification failed; exception type=" + failure.getClass().getSimpleName());
        }
    }

    private static void redisBusinessFailure(RedisFixture fixture, CallbackIdempotentStore store) {
        WorkflowCallbackProperties properties = properties(fixture.stream);
        properties.setMaxRetry(2);
        AtomicInteger calls = new AtomicInteger();
        WorkflowApprovalCallbackStreamConsumer consumer = consumer(dto -> { calls.incrementAndGet(); throw new IllegalStateException("isolated-business-failure"); },
                fixture.streams, properties, store);
        Map<String, String> payload = tokenBody();
        payload.put("processInstanceId", "failed-business-instance");
        String identifier = fixture.streams.publishGlobal(fixture.stream, new LinkedHashMap<>(payload));
        consumer.onMessage(fixture.read().get(0));
        equal(1L, fixture.pending(), "valid business failure keeps the first delivery pending");
        fixture.age(identifier, 60_001);
        try (WorkflowCallbackPendingReclaimer reclaimer = new WorkflowCallbackPendingReclaimer(fixture.redis, properties, consumer)) {
            equal(1, reclaimer.reclaimPending(), "valid business failure is retried through the original consumer");
        }
        equal(2, calls.get(), "business work retries up to the configured limit");
        equal(0L, fixture.pending(), "owned business failure is acknowledged atomically after dead-letter publication");
        equal(2L, fixture.redis.opsForStream().size(fixture.deadLetters), "business failure adds one additional dead letter");
        CallbackIdempotentStore.Lease replayable = store.acquire(TENANT, "failed-business-instance", Duration.ofSeconds(30));
        equal(CallbackIdempotentStore.State.ACQUIRED, replayable.state(), "failed dead-letter routing does not leave a false DONE marker blocking admin replay");
        check(store.release(replayable), "isolated replayability probe releases only its own lease");
    }

    private static void subscriptionRecovery(RedisFixture fixture, RedisConnectionFactory factory, String adapter) throws Exception {
        AtomicInteger faults = new AtomicInteger(2);
        AtomicInteger attemptedReads = new AtomicInteger();
        CopyOnWriteArrayList<Long> readTimes = new CopyOnWriteArrayList<Long>();
        ConcurrentHashMap<String, AtomicInteger> delivered = new ConcurrentHashMap<String, AtomicInteger>();
        RedisConnectionFactory guardedFactory = (RedisConnectionFactory) Proxy.newProxyInstance(factory.getClass().getClassLoader(),
                new Class<?>[]{RedisConnectionFactory.class}, (proxy, method, supplied) -> {
                    Object result = invoke(factory, method, supplied);
                    if (!method.getName().equals("getConnection")) return result;
                    RedisConnection connection = (RedisConnection) result;
                    return Proxy.newProxyInstance(connection.getClass().getClassLoader(), new Class<?>[]{RedisConnection.class},
                            (connectionProxy, operation, arguments) -> {
                                Object value = invoke(connection, operation, arguments);
                                if (!operation.getName().equals("streamCommands")) return value;
                                return Proxy.newProxyInstance(RedisStreamCommands.class.getClassLoader(), new Class<?>[]{RedisStreamCommands.class},
                                        (streamProxy, command, parameters) -> {
                                            if (command.getName().equals("xReadGroup")) {
                                                attemptedReads.incrementAndGet();
                                                int remaining = faults.getAndUpdate(current -> Math.max(0, current - 1));
                                                if (remaining > 0) {
                                                    readTimes.add(System.nanoTime());
                                                    if (remaining == 2) return null;
                                                    throw new RedisConnectionFailureException("injected-read-outage");
                                                }
                                            }
                                            return invoke(value, command, parameters);
                                        });
                            });
                });
        WorkflowCallbackAutoConfiguration configuration = new WorkflowCallbackAutoConfiguration();
        WorkflowCallbackProperties properties = properties(fixture.stream);
        StreamMessageListenerContainer<String, MapRecord<String, String, String>> container = configuration.workflowApprovalCallbackContainer(guardedFactory);
        try (CallbackIdempotentStore store = new CallbackIdempotentStore(fixture.redis, fixture.namespace + ":subscription-idem:")) {
            WorkflowApprovalCallbackStreamConsumer consumer = consumer(dto -> delivered.computeIfAbsent(dto.getProcessInstanceId(), ignored -> new AtomicInteger()).incrementAndGet(),
                    fixture.streams, properties, store);
            Subscription subscription = configuration.workflowApprovalCallbackSubscription(container, fixture.redis, consumer, properties);
            String firstInstance = "subscription-first-" + adapter;
            Map<String, String> payload = tokenBody();
            payload.put("processInstanceId", firstInstance);
            fixture.streams.publishGlobal(fixture.stream, new LinkedHashMap<>(payload));
            waitFor(() -> delivered.containsKey(firstInstance), adapter + " recovers null read and transient outage without service restart");
            equal(0, faults.get(), adapter + " exercises both injected driver-boundary failures");
            check(attemptedReads.get() >= 3, adapter + " performs a real stream read after failed reads");
            check(subscription.isActive(), adapter + " keeps callback subscription active after faults");
            check(readTimes.get(1) - readTimes.get(0) >= TimeUnit.MILLISECONDS.toNanos(900), adapter + " read retry is rate limited");
            waitFor(() -> fixture.pending() == 0L, adapter + " confirms original message only after successful processing");
            String duplicate = fixture.streams.publishGlobal(fixture.stream, new LinkedHashMap<>(payload));
            waitFor(() -> fixture.redis.opsForStream().range(fixture.stream, Range.just(duplicate)).isEmpty(),
                    adapter + " confirms and removes the repeated delivery through the real subscription");
            equal(1, delivered.get(firstInstance).get(), adapter + " repeated delivery remains business-idempotent");
            equal(0L, fixture.pending(), adapter + " repeated delivery is safely acknowledged");
            Thread.sleep(1300);
            check(subscription.isActive(), adapter + " idle blocking reads do not disable the subscriber");
            faults.set(2);
            waitFor(() -> faults.get() == 0 && readTimes.size() == 4, adapter + " recovers repeated faults while already running");
            String secondInstance = "subscription-next-" + adapter;
            payload.put("processInstanceId", secondInstance);
            fixture.streams.publishGlobal(fixture.stream, new LinkedHashMap<>(payload));
            waitFor(() -> delivered.containsKey(secondInstance) && fixture.pending() == 0L, adapter + " receives the next real callback after repeated faults");
            container.stop();
            Thread.sleep(1300);
            String restartedInstance = "subscription-restarted-" + adapter;
            payload.put("processInstanceId", restartedInstance);
            fixture.streams.publishGlobal(fixture.stream, new LinkedHashMap<>(payload));
            Thread.sleep(200);
            check(!delivered.containsKey(restartedInstance), adapter + " stopped container cannot process newly published callbacks");
            container.start();
            waitFor(() -> delivered.containsKey(restartedInstance) && fixture.pending() == 0L, adapter + " restart preserves the group and processes backlog");
            equal(3, delivered.size(), adapter + " receives exactly three distinct workflow results");
            check(delivered.values().stream().allMatch(count -> count.get() == 1), adapter + " restart and read failures never duplicate business effects");
            System.out.println("CALLBACK_SUBSCRIPTION: adapter=" + adapter + "; injected_null_reads=2; injected_read_outages=2; real_redis=true; messages=4; business_effects=3; recovered=true");
        } finally {
            container.stop();
        }
    }

    private static Object invoke(Object target, java.lang.reflect.Method method, Object[] arguments) throws Throwable {
        try {
            return method.invoke(target, arguments);
        } catch (InvocationTargetException failure) {
            throw failure.getCause();
        }
    }

    private static void waitFor(java.util.function.BooleanSupplier condition, String label) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (!condition.getAsBoolean() && System.nanoTime() < deadline) Thread.sleep(25);
        check(condition.getAsBoolean(), label);
    }

    private static void redisCompetition(RedisFixture fixture, CallbackIdempotentStore store) throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger calls = new AtomicInteger();
        ExecutorService workers = Executors.newFixedThreadPool(2);
        WorkflowCallbackProperties properties = properties(fixture.stream);
        WorkflowApprovalCallbackStreamConsumer consumer = consumer(dto -> { calls.incrementAndGet(); entered.countDown(); await(release); }, fixture.streams, properties, store);
        Map<String, String> payload = tokenBody();
        payload.put("processInstanceId", "parallel-instance");
        fixture.streams.publishGlobal(fixture.stream, new LinkedHashMap<>(payload));
        fixture.streams.publishGlobal(fixture.stream, new LinkedHashMap<>(payload));
        List<MapRecord<String, String, String>> messages = fixture.read();
        equal(2, messages.size(), "two actual Redis deliveries are pending before competition");
        try {
            Future<?> first = workers.submit(() -> consumer.onMessage(messages.get(0)));
            await(entered);
            workers.submit(() -> consumer.onMessage(messages.get(1))).get(5, TimeUnit.SECONDS);
            equal(1, calls.get(), "real Redis concurrent duplicate cannot enter processing twice");
            equal(2L, fixture.pending(), "real Redis PROCESSING duplicate never acknowledges the stream");
            release.countDown();
            first.get(5, TimeUnit.SECONDS);
            equal(1L, fixture.pending(), "business completion acknowledges its own delivery only");
            consumer.onMessage(messages.get(1));
            equal(1, calls.get(), "DONE duplicate does not call business again");
            equal(0L, fixture.pending(), "DONE duplicate is eventually acknowledged");
        } finally {
            release.countDown();
            workers.shutdownNow();
        }
    }

    private static void redisReclaimAndReplay(RedisFixture fixture, CallbackIdempotentStore store, StringRedisTemplate reclaimerRedis) throws Exception {
        AtomicInteger calls = new AtomicInteger();
        WorkflowCallbackProperties properties = properties(fixture.stream);
        WorkflowApprovalCallbackStreamConsumer consumer = consumer(dto -> {
            calls.incrementAndGet();
            equal(TENANT, UserContext.getTenantId(), "reclaimed callback supplies tenant context");
            equal(Map.of("oaRequestToken", TOKEN), dto.getVariables(), "actual Redis callback retains only the persisted request token");
        }, fixture.streams, properties, store);
        Map<String, String> payload = tokenBody();
        payload.put("processInstanceId", "dead-worker-instance");
        String orphan = fixture.streams.publishGlobal(fixture.stream, new LinkedHashMap<>(payload));
        fixture.read();
        try (WorkflowCallbackPendingReclaimer first = new WorkflowCallbackPendingReclaimer(reclaimerRedis, properties, consumer);
             WorkflowCallbackPendingReclaimer second = new WorkflowCallbackPendingReclaimer(reclaimerRedis, properties, consumer)) {
            equal(0, first.reclaimPending(), "actual Redis pending below 60 seconds is not reclaimed");
            equal(1L, fixture.pending(), "young pending record remains owned by previous consumer");
            fixture.age(orphan, 60_001);
            ExecutorService workers = Executors.newFixedThreadPool(2);
            try {
                Future<Integer> firstResult = workers.submit(first::reclaimPending);
                Future<Integer> secondResult = workers.submit(second::reclaimPending);
                equal(1, firstResult.get(5, TimeUnit.SECONDS) + secondResult.get(5, TimeUnit.SECONDS), "two workers atomically claim eligible pending exactly once");
            } finally {
                workers.shutdownNow();
            }
            equal(1, calls.get(), "one claimed callback reaches the original consumer");
            equal(0L, fixture.pending(), "cross-worker recovery finishes the pending entry");
        }
        String legacy = fixture.streams.publishGlobal(fixture.stream, new LinkedHashMap<>(body()));
        consumer.onMessage(fixture.read().get(0));
        equal(1L, fixture.pending(), "old missing-token message remains pending on first failure");
        for (int attempt = 2; attempt <= properties.getMaxRetry(); attempt++) {
            fixture.age(legacy, 60_001);
            try (WorkflowCallbackPendingReclaimer restarted = new WorkflowCallbackPendingReclaimer(reclaimerRedis, properties, consumer)) {
                equal(1, restarted.reclaimPending(), "new worker resumes previous pending attempt " + attempt);
            }
            if (attempt < properties.getMaxRetry()) equal((long) attempt, fixture.deliveries(legacy), "delivery count survives new worker instance");
        }
        equal(0L, fixture.pending(), "exhausted missing-token message is acknowledged only after dead-letter forwarding");
        equal(1, calls.get(), "missing-token attempts never reach business state mutation");
        List<MapRecord<String, String, String>> letters = fixture.redis.<String, String>opsForStream().range(fixture.deadLetters, Range.unbounded());
        equal(1, letters.size(), "exactly one dead letter is forwarded after retry exhaustion");
        LinkedHashMap<String, String> deadPayload = new LinkedHashMap<>(letters.get(0).getValue());
        equal("5", WorkflowCallbackMetadata.decodeStreamValue(deadPayload.get("__retryCount")), "persisted Redis delivery count reaches the configured retry limit");
        equal(TENANT.toString(), WorkflowCallbackMetadata.decodeStreamValue(deadPayload.get("tenantId")), "dead-letter identity does not accumulate JSON quotation layers");
        deadPayload.keySet().removeIf(field -> field.startsWith("__"));
        WorkflowCallbackDeliveryChecks.ReplayFixture replay = new ReplayFixture();
        Map<String, Object> variables = replay.variables();
        variables.put("callbackStreamKey", fixture.stream);
        replay.instance.setVariables(JSON.writeValueAsString(variables));
        replay.deadLetter.setStreamKey(fixture.stream);
        replay.deadLetter.setPayloadJson(JSON.writeValueAsString(deadPayload));
        CallbackDlqReplayer replayer = new CallbackDlqReplayer(replay.deadLetterMapper, JSON, fixture.streams, null, replay.instanceMapper);
        replayer.replay(replay.deadLetter);
        equal("REPLAYED", replay.deadLetter.getStatus(), "validated persisted-instance replay queues a new delivery");
        List<MapRecord<String, String, String>> recovered = fixture.read();
        equal(1, recovered.size(), "replay emits exactly one corrected callback");
        consumer.onMessage(recovered.get(0));
        equal(2, calls.get(), "corrected token reaches business only after validated replay");
        equal(0L, fixture.pending(), "corrected replay completes and is acknowledged");
        equal("PASSED", replay.instance.getStatus(), "recovery does not rewrite approval state");
        equal(1, replay.updates, "recovery updates only the isolated dead-letter fixture");
    }

    private static final class RedisFixture implements AutoCloseable {
        final String namespace = "h-callback-check:" + UUID.randomUUID();
        final String stream = namespace + ":stream";
        final String deadLetters = namespace + ":dead-letters";
        final String group = "callback-checks";
        final LettuceConnectionFactory factory;
        final SafeRedisTemplate redis;
        final IsolatedStreams streams;

        RedisFixture() throws Exception {
            RedisStandaloneConfiguration configuration = new RedisStandaloneConfiguration(System.getenv("REDIS_HOST"), Integer.parseInt(System.getenv("REDIS_PORT")));
            configuration.setDatabase(Integer.parseInt(System.getenv("REDIS_DB")));
            String password = System.getenv("REDIS_PASSWORD");
            if (password != null && !password.isEmpty()) configuration.setPassword(password);
            LettuceClientConfiguration client = LettuceClientConfiguration.builder().commandTimeout(Duration.ofSeconds(5)).shutdownTimeout(Duration.ZERO).build();
            factory = new LettuceConnectionFactory(configuration, client);
            factory.afterPropertiesSet();
            redis = new SafeRedisTemplate(factory, namespace);
            streams = new IsolatedStreams(this);
        }

        void createGroup() {
            redis.guard(stream);
            redis.execute((RedisCallback<String>) connection -> connection.streamCommands().xGroupCreate(
                    redis.getStringSerializer().serialize(stream), group, ReadOffset.from("0-0"), true));
            redis.expire(stream, Duration.ofMinutes(10));
        }

        List<MapRecord<String, String, String>> read() {
            return redis.<String, String>opsForStream().read(Consumer.from(group, "initial-worker"), StreamReadOptions.empty().count(20),
                    StreamOffset.create(stream, ReadOffset.lastConsumed()));
        }

        long pending() {
            return redis.opsForStream().pending(stream, group).getTotalPendingMessages();
        }

        long deliveries(String identifier) {
            return redis.opsForStream().pending(stream, group, Range.just(identifier), 1).get(0).getTotalDeliveryCount();
        }

        void age(String identifier, long idle) {
            long deliveries = deliveries(identifier);
            redis.opsForStream().claim(stream, group, "elapsed-time-fixture",
                    RedisStreamCommands.XClaimOptions.minIdle(Duration.ZERO).ids(identifier).idle(Duration.ofMillis(idle)).retryCount(deliveries));
        }

        @Override
        public void close() {
            try {
                ArrayList<String> owned = new ArrayList<>(redis.owned);
                owned.forEach(redis::guard);
                if (!owned.isEmpty()) redis.delete(owned);
                check(owned.stream().allMatch(key -> key.startsWith(namespace + ":")), "cleanup is restricted to exact owned random-namespace keys");
                check(owned.stream().noneMatch(key -> Boolean.TRUE.equals(redis.hasKey(key))), "every owned isolated Redis key is removed after verification");
            } finally {
                factory.destroy();
            }
        }
    }

    private static final class SafeRedisTemplate extends StringRedisTemplate {
        final String namespace;
        final Set<String> owned = ConcurrentHashMap.newKeySet();

        SafeRedisTemplate(RedisConnectionFactory factory, String namespace) {
            super(factory);
            this.namespace = namespace;
        }

        void guard(String key) {
            if (key == null || !key.startsWith(namespace + ":")) throw new AssertionError("Refusing access outside isolated Redis namespace");
            owned.add(key);
        }

        @Override
        public <Result> Result execute(RedisScript<Result> script, List<String> keys, Object... arguments) {
            keys.forEach(this::guard);
            return super.execute(script, keys, arguments);
        }

        @Override
        @SuppressWarnings("unchecked")
        public <HashKey, HashValue> StreamOperations<String, HashKey, HashValue> opsForStream() {
            StreamOperations<String, HashKey, HashValue> delegate = super.<HashKey, HashValue>opsForStream();
            return (StreamOperations<String, HashKey, HashValue>) Proxy.newProxyInstance(getClass().getClassLoader(),
                    new Class<?>[]{StreamOperations.class}, (proxy, method, supplied) -> {
                        if (method.getName().equals("read")) {
                            for (Object argument : supplied) {
                                if (argument instanceof StreamOffset<?>[] offsets) {
                                    for (StreamOffset<?> offset : offsets) guard((String) offset.getKey());
                                }
                            }
                        } else if (supplied != null && supplied.length > 0 && supplied[0] instanceof String key) guard(key);
                        else if (supplied != null && supplied.length > 0 && supplied[0] instanceof MapRecord<?, ?, ?> message) guard((String) message.getStream());
                        else throw new AssertionError("Refusing unscoped Redis stream operation");
                        try {
                            return method.invoke(delegate, supplied);
                        } catch (InvocationTargetException failure) {
                            throw failure.getCause();
                        }
                    });
        }
    }

    private static final class IsolatedStreams extends RedisStreamUtil {
        final RedisFixture fixture;
        final RedisStreamUtil delegate = new RedisStreamUtil();

        IsolatedStreams(RedisFixture fixture) throws Exception {
            this.fixture = fixture;
            RedisTemplate<String, Object> template = new RedisConfig().redisTemplate(fixture.factory);
            Field field = RedisStreamUtil.class.getDeclaredField("redisTemplate");
            field.setAccessible(true);
            field.set(delegate, template);
        }

        @Override
        public String publishGlobal(String key, Map<String, Object> body) {
            String target = DefaultDeadLetterHandler.DLQ_STREAM_KEY.equals(key) ? fixture.deadLetters : key;
            fixture.redis.guard(target);
            String identifier = delegate.publishGlobal(target, body);
            fixture.redis.expire(target, Duration.ofMinutes(10));
            return identifier;
        }

        @Override
        public long pendingDeliveryCountGlobal(String key, String group, String identifier) {
            fixture.redis.guard(key);
            return delegate.pendingDeliveryCountGlobal(key, group, identifier);
        }

        @Override
        public Long ackGlobal(String key, String group, String... identifiers) {
            fixture.redis.guard(key);
            return delegate.ackGlobal(key, group, identifiers);
        }

        @Override
        public Long deleteGlobal(String key, String... identifiers) {
            fixture.redis.guard(key);
            return delegate.deleteGlobal(key, identifiers);
        }
    }

    private static void groupInitialization() throws Exception {
        WorkflowCallbackDeliveryChecks.GroupRedis redis = new GroupRedis();
        AtomicInteger receives = new AtomicInteger();
        @SuppressWarnings("unchecked")
        StreamMessageListenerContainer<String, MapRecord<String, String, String>> container = (StreamMessageListenerContainer<String, MapRecord<String, String, String>>) Proxy.newProxyInstance(
                WorkflowCallbackDeliveryChecks.class.getClassLoader(), new Class<?>[]{StreamMessageListenerContainer.class}, (proxy, method, supplied) -> {
                    if (!method.getName().equals("register")) throw new AssertionError("Unexpected container operation");
                    receives.incrementAndGet();
                    StreamMessageListenerContainer.ConsumerStreamReadRequest<?> request = (StreamMessageListenerContainer.ConsumerStreamReadRequest<?>) supplied[0];
                    StreamOffset<?> offset = request.getStreamOffset();
                    equal(STREAM, offset.getKey(), "fresh subscription uses the configured global stream");
                    equal(">", offset.getOffset().getOffset(), "fresh delivery remains lastConsumed alongside pending reclaim");
                    equal("callback-checks", request.getConsumer().getGroup(), "callback subscription uses its configured consumer group");
                    check(!request.isAutoAcknowledge(), "callback consumption never acknowledges before business completion");
                    check(!request.getCancelSubscriptionOnError().test(new NullPointerException()), "empty driver result cannot disable callback subscription");
                    check(!request.getCancelSubscriptionOnError().test(new RedisConnectionFailureException("offline")), "transient read outage cannot disable callback subscription");
                    check(request.getErrorHandler() != null, "read failures have an explicit bounded retry handler");
                    return Proxy.newProxyInstance(Subscription.class.getClassLoader(), new Class<?>[]{Subscription.class},
                            (subscription, operation, arguments) -> operation.getReturnType() == boolean.class ? true : null);
                });
        try (CallbackIdempotentStore store = new CallbackIdempotentStore(new MemoryRedis(), "offline:group:")) {
            WorkflowApprovalCallbackStreamConsumer consumer = consumer(dto -> {}, new ProbeStreams(), properties(STREAM), store);
            WorkflowCallbackAutoConfiguration configuration = new WorkflowCallbackAutoConfiguration();
            configuration.workflowApprovalCallbackSubscription(container, redis, consumer, properties(STREAM));
            equal("0-0", redis.offset, "new group starts before existing backlog");
            equal(true, redis.makeStream, "new empty stream is created with the group");
            redis.failure = new IllegalStateException("outer", new IllegalStateException("BUSYGROUP already exists"));
            configuration.workflowApprovalCallbackSubscription(container, redis, consumer, properties(STREAM));
            equal(2, receives.get(), "existing group is preserved across service restarts");
            redis.failure = new IllegalStateException("redis unavailable");
            rejects(IllegalStateException.class, () -> configuration.workflowApprovalCallbackSubscription(container, redis, consumer, properties(STREAM)),
                    "group initialization failure cannot be silently ignored");
            equal(2, receives.get(), "subscription cannot start after unconfirmed group creation");
        }
    }

    private static final class ReplayFixture {
        final WfProcessInstance instance = new WfProcessInstance();
        final WfCallbackDeadLetter deadLetter = new WfCallbackDeadLetter();
        final Map<String, String> payload = body();
        final ProbeStreams streams = new ProbeStreams();
        final WfProcessInstanceMapper instanceMapper;
        final WfCallbackDeadLetterMapper deadLetterMapper;
        final CallbackDlqReplayer replayer;
        int instanceReads;
        int updates;
        int triggerReplays;
        boolean missingInstance;

        ReplayFixture() throws Exception {
            instance.setInstanceId(INSTANCE);
            instance.setTenantId(TENANT);
            instance.setStatus("PASSED");
            instance.setDeleted(0);
            instance.setEndTime(LocalDateTime.of(2026, 9, 14, 15, 7, 38));
            instance.setVariables(JSON.writeValueAsString(Map.of("businessType", TYPE, "businessId", 102L,
                    "businessNo", "offline-request", "callbackStreamKey", STREAM, "oaRequestToken", TOKEN,
                    "formData", "PRIVATE_FORM", "amount", "PRIVATE_AMOUNT", "approvalModel", "PRIVATE_MODEL")));
            deadLetter.setId(12L);
            deadLetter.setTenantId(TENANT);
            deadLetter.setProcessInstanceId(INSTANCE);
            deadLetter.setBusinessType(TYPE);
            deadLetter.setBusinessId(102L);
            deadLetter.setStreamKey(STREAM);
            deadLetter.setStatus("PENDING");
            payload.put("variables", "PRIVATE_VARIABLES");
            payload.put("formData", "PRIVATE_FORM");
            payload.put("amount", "PRIVATE_AMOUNT");
            sync();
            instanceMapper = (WfProcessInstanceMapper) Proxy.newProxyInstance(getClass().getClassLoader(),
                    new Class<?>[]{WfProcessInstanceMapper.class}, (proxy, method, supplied) -> {
                        instanceReads++;
                        if (method.getName().equals("selectOne")) {
                            LambdaQueryWrapper<?> query = (LambdaQueryWrapper<?>) supplied[0];
                            String sql = query.getSqlSegment();
                            check(sql.contains("tenant_id") && sql.contains("instance_id"), "persisted lookup explicitly binds tenant and instance");
                            check(query.getParamNameValuePairs().containsValue(TENANT), "persisted lookup uses the current tenant");
                            check(query.getParamNameValuePairs().containsValue(INSTANCE), "persisted lookup uses the original instance id");
                        } else if (method.getName().equals("selectById")) {
                            equal(INSTANCE, supplied[0], "publisher reads its actual persisted instance");
                        } else {
                            throw new AssertionError("Process writes or history fabrication are forbidden: " + method.getName());
                        }
                        return missingInstance ? null : instance;
                    });
            deadLetterMapper = (WfCallbackDeadLetterMapper) Proxy.newProxyInstance(getClass().getClassLoader(),
                    new Class<?>[]{WfCallbackDeadLetterMapper.class}, (proxy, method, supplied) -> {
                        if (!method.getName().equals("updateById")) throw new AssertionError("Unexpected dead letter operation");
                        updates++;
                        equal(deadLetter, supplied[0], "replay updates its original dead-letter record only");
                        return 1;
                    });
            WorkflowTriggerService trigger = new WorkflowTriggerService(null, null, null, null, null, null, null, null, null,
                    null, null, null, null, null, null, null, null, null, null) {
                @Override
                public void replay(WfCallbackDeadLetter value) {
                    triggerReplays++;
                }
            };
            replayer = new CallbackDlqReplayer(deadLetterMapper, JSON, streams, trigger, instanceMapper);
        }

        Map<String, Object> variables() throws Exception {
            return JSON.readValue(instance.getVariables(), new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
        }

        void sync() throws Exception {
            deadLetter.setPayloadJson(JSON.writeValueAsString(payload));
        }
    }

    private static final class ProbeStreams extends RedisStreamUtil {
        final List<Map<String, Object>> published = new ArrayList<>();
        final List<String> acknowledged = new ArrayList<>();
        final List<String> deleted = new ArrayList<>();
        boolean failPublish;
        long deliveryCount = 1;

        @Override
        public String publishGlobal(String key, Map<String, Object> body) {
            if (failPublish) return null;
            published.add(new LinkedHashMap<>(body));
            return published.size() + "-0";
        }

        @Override
        public long pendingDeliveryCountGlobal(String key, String group, String identifier) {
            return deliveryCount;
        }

        @Override
        public Long ackGlobal(String key, String group, String... identifiers) {
            acknowledged.addAll(List.of(identifiers));
            return (long) identifiers.length;
        }

        @Override
        public Long deleteGlobal(String key, String... identifiers) {
            deleted.addAll(List.of(identifiers));
            return (long) identifiers.length;
        }
    }

    private static final class MemoryRedis extends StringRedisTemplate {
        final AtomicLong clock = new AtomicLong(1_000);
        final Map<String, Cell> values = new HashMap<>();
        final List<String> acknowledged = new ArrayList<>();
        boolean failAcknowledge;

        @Override
        @SuppressWarnings("unchecked")
        public synchronized <Result> Result execute(RedisScript<Result> script, List<String> keys, Object... supplied) {
            String source = script.getScriptAsString();
            String key = keys.get(0);
            String current = value(key);
            String owner = supplied[0].toString();
            long result = 0;
            if (source.contains("local current")) {
                if ("DONE".equals(current)) result = 2;
                else if (current == null) {
                    values.put(key, new Cell(owner, clock.get() + Long.parseLong(supplied[1].toString())));
                    result = 1;
                }
            } else {
                check(source.contains("redis.call('GET', KEYS[1]) ~= ARGV[1]"), "every ownership mutation uses compare-and-set");
                if (Objects.equals(current, owner)) {
                    if (source.contains("'XACK'")) {
                        if (failAcknowledge) throw new IllegalStateException("ack-failed");
                        equal(2, keys.size(), "ownership and stream acknowledgement are one atomic operation");
                        acknowledged.add(supplied[2].toString());
                        if (!"DONE".equals(owner)) values.remove(key);
                    } else if (source.contains("'PEXPIRE'")) {
                        values.put(key, new Cell(current, clock.get() + Long.parseLong(supplied[1].toString())));
                    } else if (source.contains("'SET'")) {
                        values.put(key, new Cell("DONE", clock.get() + Long.parseLong(supplied[1].toString())));
                    } else if (source.contains("'DEL'")) {
                        values.remove(key);
                    } else throw new AssertionError("Unknown callback Redis script");
                    result = 1;
                }
            }
            return (Result) Long.valueOf(result);
        }

        synchronized String value(String key) {
            WorkflowCallbackDeliveryChecks.Cell cell = values.get(key);
            if (cell != null && cell.expires() <= clock.get()) { values.remove(key); return null; }
            return cell == null ? null : cell.value();
        }
    }

    private record Cell(String value, long expires) {
    }

    private static final class PendingEntry {
        final String identifier;
        long idle;

        PendingEntry(String identifier, long idle) {
            this.identifier = identifier;
            this.idle = idle;
        }
    }

    private static final class PendingRedis extends StringRedisTemplate {
        final List<PendingEntry> entries = new ArrayList<>();
        final List<Long> counts = new ArrayList<>();
        Duration minIdle;
        int claimCalls;

        @Override
        @SuppressWarnings("unchecked")
        public <HashKey, HashValue> StreamOperations<String, HashKey, HashValue> opsForStream() {
            return (StreamOperations<String, HashKey, HashValue>) Proxy.newProxyInstance(getClass().getClassLoader(),
                    new Class<?>[]{StreamOperations.class}, (proxy, method, supplied) -> {
                        if (method.getName().equals("pending")) {
                            Range<String> range = (Range<String>) supplied[2];
                            long count = ((Number) supplied[3]).longValue();
                            counts.add(count);
                            List<PendingMessage> page = entries.stream().filter(entry -> range.contains(entry.identifier)).limit(count)
                                    .map(entry -> new PendingMessage(RecordId.of(entry.identifier), Consumer.from("callback-checks", "dead-worker"),
                                            Duration.ofMillis(entry.idle), 1)).toList();
                            return new PendingMessages("callback-checks", range, page);
                        }
                        throw new AssertionError("Unexpected pending operation: " + method.getName());
                    });
        }

        @Override
        @SuppressWarnings("unchecked")
        public <Result> Result execute(RedisScript<Result> script, List<String> keys, Object... arguments) {
            equal(List.of(STREAM), keys, "pending claim uses one explicitly bound global stream key");
            check(script.getScriptAsString().contains("redis.call('XCLAIM'"), "pending claim bypasses driver-specific XClaimOptions conversion");
            claimCalls++;
            minIdle = Duration.ofMillis(Long.parseLong((String) arguments[2]));
            Set<Object> identifiers = Set.of(Arrays.copyOfRange(arguments, 3, arguments.length));
            ArrayList<List<Object>> result = new ArrayList<List<Object>>();
            for (PendingEntry entry : entries) {
                if (identifiers.contains(entry.identifier) && entry.idle >= minIdle.toMillis()) {
                    entry.idle = 0;
                    ArrayList<String> fields = new ArrayList<String>();
                    tokenBody().forEach((field, value) -> { fields.add(field); fields.add(value); });
                    result.add(List.of(entry.identifier, fields));
                }
            }
            return (Result) result;
        }
    }

    private static final class GroupRedis extends StringRedisTemplate {
        RuntimeException failure;
        String offset;
        boolean makeStream;

        @Override
        public <Result> Result execute(RedisCallback<Result> callback) {
            if (failure != null) throw failure;
            RedisStreamCommands streams = (RedisStreamCommands) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{RedisStreamCommands.class},
                    (proxy, method, supplied) -> {
                        if (!method.getName().equals("xGroupCreate")) throw new AssertionError("Unexpected group command");
                        equal(STREAM, new String((byte[]) supplied[0], java.nio.charset.StandardCharsets.UTF_8), "group is created under the global stream key");
                        offset = ((ReadOffset) supplied[2]).getOffset();
                        makeStream = (boolean) supplied[3];
                        return "OK";
                    });
            RedisConnection connection = (RedisConnection) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{RedisConnection.class},
                    (proxy, method, supplied) -> {
                        if (method.getName().equals("streamCommands")) return streams;
                        throw new AssertionError("Unexpected offline connection operation");
                    });
            return callback.doInRedis(connection);
        }
    }

    private record ReplayMutation(String label, java.util.function.Consumer<ReplayFixture> apply) {
    }

    private static WorkflowCallbackProperties properties(String stream) {
        WorkflowCallbackProperties properties = new WorkflowCallbackProperties();
        properties.setStreamKey(stream);
        properties.setGroup("callback-checks");
        properties.setConsumerPrefix("callback-checks");
        return properties;
    }

    private static WorkflowApprovalCallbackStreamConsumer consumer(WorkflowCallbackService service, RedisStreamUtil streams,
            WorkflowCallbackProperties properties, CallbackIdempotentStore store) {
        return new WorkflowApprovalCallbackStreamConsumer(service, streams, properties, store, new DefaultDeadLetterHandler(streams));
    }

    private static Map<String, String> body() {
        LinkedHashMap<String, String> body = new LinkedHashMap<String, String>();
        body.put("tenantId", TENANT.toString());
        body.put("processInstanceId", INSTANCE);
        body.put("businessType", TYPE);
        body.put("businessId", "102");
        body.put("businessNo", "offline-request");
        body.put("approvalResult", "APPROVED");
        body.put("approvalComment", "approved");
        body.put("approverId", "19");
        body.put("approverName", "reviewer");
        body.put("approvalTime", "1800000000000");
        return body;
    }

    private static Map<String, String> tokenBody() {
        Map<String, String> body = body();
        body.put("oaRequestToken", TOKEN);
        return body;
    }

    private static MapRecord<String, String, String> record(String identifier, Map<String, String> body, String stream) {
        return MapRecord.create(stream, body).withId(RecordId.of(identifier));
    }

    private static void identity(Long tenant) {
        UserContext.setTenantId(tenant);
        TenantContext.setTenantId(tenant);
    }

    private static String encode(String value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (Exception failure) {
            throw new AssertionError("Fixture encoding failed", failure);
        }
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) throw new AssertionError("Callback competition checkpoint timed out");
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new AssertionError("Callback competition interrupted", interrupted);
        }
    }

    private static void rejects(Class<? extends Throwable> type, CheckedAction action, String label) {
        try {
            action.run();
        } catch (Throwable failure) {
            check(type.isInstance(failure), label + " failed with expected exception type");
            return;
        }
        throw new AssertionError(label + " unexpectedly succeeded");
    }

    private static void equal(Object expected, Object actual, String label) {
        check(Objects.equals(expected, actual), label + "; expected=" + expected + "; actual=" + actual);
    }

    private static void check(boolean condition, String label) {
        int number = CHECKS.incrementAndGet();
        if (!condition) throw new AssertionError("Callback check " + number + ": " + label);
    }

    private interface CheckedAction {
        void run() throws Exception;
    }
}
