package com.cloudflow.auth.checks;

import com.cloudflow.common.config.RedisConfig;
import com.cloudflow.common.core.context.UserDataScopeSnapshot;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.core.BusinessEventEnvelopeCodec;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.common.redis.core.UserDataScopeStore;
import com.cloudflow.gateway.ratelimit.DynamicRateLimitFilter;
import com.cloudflow.gateway.ratelimit.SysApiRatelimitRuleSnapshot;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.data.domain.Range;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

/** Requires a new loopback-only Redis server created for this check. */
public final class PlatformRedisChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        int port = Integer.parseInt(arguments[0]);
        RedisStandaloneConfiguration configuration = new RedisStandaloneConfiguration("127.0.0.1", port);
        LettuceConnectionFactory connection = new LettuceConnectionFactory(configuration,
                LettuceClientConfiguration.builder().commandTimeout(Duration.ofSeconds(2)).build());
        connection.afterPropertiesSet(); connection.start();
        try {
            StringRedisTemplate strings = new StringRedisTemplate(connection);
            RedisTemplate<String, Object> values = new RedisConfig().redisTemplate(connection);
            rateLimits(connection, strings);
            snapshots(values, strings);
            envelopes(strings);
            System.out.println("PLATFORM_REDIS_CHECKS: passed=" + checks
                    + "; real_redis=true; real_lua=true; real_reactor=true; http=false; mysql=false");
        } finally { connection.destroy(); }
    }

    @SuppressWarnings("unchecked")
    private static void rateLimits(LettuceConnectionFactory connection, StringRedisTemplate strings) throws Exception {
        DynamicRateLimitFilter filter = new DynamicRateLimitFilter();
        set(filter, "reactiveStringRedisTemplate", new ReactiveStringRedisTemplate(connection));
        Field field = DynamicRateLimitFilter.class.getDeclaredField("activeRulesRef"); field.setAccessible(true);
        AtomicReference<List<SysApiRatelimitRuleSnapshot>> rules = (AtomicReference<List<SysApiRatelimitRuleSnapshot>>) field.get(filter);
        SysApiRatelimitRuleSnapshot rule = new SysApiRatelimitRuleSnapshot();
        rule.setId(91001L); rule.setRuleCode("quality"); rule.setStatus("ACTIVE"); rule.setPathPattern("/quality");
        rule.setDimension("GLOBAL"); rule.setRps(2); rule.setBurst(2); rule.setWindowSeconds(2); rule.setRejectStrategy("REJECT");
        rules.set(List.of(rule));
        String key = "ratelimit:91001:GLOBAL";
        AtomicInteger downstream = new AtomicInteger();
        filter.filter(exchange(), current -> { downstream.incrementAndGet(); return Mono.empty(); }).block();
        check("1".equals(strings.opsForValue().get(key)) && strings.getExpire(key) > 0, "first count and expiration are both committed");
        strings.expire(key, Duration.ofMillis(800));
        filter.filter(exchange(), current -> { downstream.incrementAndGet(); return Mono.empty(); }).block();
        check(strings.getExpire(key, TimeUnit.MILLISECONDS) <= 800, "last fractional second never extends the fixed window");
        MockServerWebExchange exceeded = exchange();
        filter.filter(exceeded, current -> { downstream.incrementAndGet(); return Mono.empty(); }).block();
        check(downstream.get() == 2 && HttpStatus.TOO_MANY_REQUESTS.equals(exceeded.getResponse().getStatusCode()),
                "over-limit request returns 429 without another downstream call");
        strings.delete(key); downstream.set(0);
        boolean failed = false;
        try { filter.filter(exchange(), current -> { downstream.incrementAndGet(); return Mono.error(new IllegalStateException("downstream")); }).block(); }
        catch (IllegalStateException expected) { failed = true; }
        check(failed && downstream.get() == 1, "downstream failure propagates after exactly one invocation");
        strings.opsForValue().set(key, "invalid-counter"); downstream.set(0);
        filter.filter(exchange(), current -> { downstream.incrementAndGet(); return Mono.empty(); }).block();
        check(downstream.get() == 1, "actual Redis script failure applies the existing allow policy exactly once");
        strings.opsForValue().set(key, "4");
        filter.filter(exchange(), current -> Mono.empty()).block();
        check(strings.getExpire(key) > 0, "an existing counter without expiration gets an expiration atomically");
        strings.delete(key);
    }

    private static void snapshots(RedisTemplate<String, Object> values, StringRedisTemplate strings) {
        RedisCache cache = new RedisCache(); cache.redisTemplate = values;
        UserDataScopeStore store = new UserDataScopeStore(cache);
        UserDataScopeSnapshot before = new UserDataScopeSnapshot(); before.setTenantId(91001L); before.setUserId(91L);
        before.setUserVersion(2); before.setDsType(2); before.setDsDeptIds(List.of(10L, 11L)); before.setRefreshedAt(LocalDateTime.of(2026, 11, 3, 9, 30));
        store.save(before);
        check(before.equals(store.get(91001L, 91L)), "typed permission snapshot survives production Redis serialization");
        check(store.get(91002L, 91L) == null, "the same user number under another tenant has no cache entry");
        long ttl = strings.getExpire("user:datascope:91001:91");
        check(ttl > 0 && ttl <= 300, "permission cache retains its five-minute lifetime");
        store.deleteAll(91001L, List.of(91L)); check(store.get(91001L, 91L) == null, "batch invalidation removes the exact tenant cache");
    }

    private static void envelopes(StringRedisTemplate strings) throws Exception {
        ObjectMapper json = new ObjectMapper().findAndRegisterModules();
        BusinessEventEnvelope original = BusinessEventEnvelope.builder().eventId("event-91001").eventType("QUALITY")
                .tenantId(91001L).sourceId(500L).sourceModule("cloudflow-auth")
                .occurredAt(LocalDateTime.of(2026, 11, 3, 9, 30, 11, 123456789)).payload("{\"value\":1}").build();
        String encoded = json.writeValueAsString(original);
        BusinessEventEnvelope decoded = BusinessEventEnvelopeCodec.read(encoded, json);
        check(original.getOccurredAt().equals(decoded.getOccurredAt()), "canonical event time retains nanoseconds");
        check(encoded.contains("2026-11-03T09:30:11.123456789"), "event time has one explicit canonical format");
        rejected(() -> BusinessEventEnvelopeCodec.read(json.writeValueAsString(encoded), json), "double-encoded envelope is rejected");
        rejected(() -> BusinessEventEnvelopeCodec.read(encoded.replace("2026-11-03T", "2026-11-03 "), json), "legacy space time is rejected");
        rejected(() -> BusinessEventEnvelopeCodec.read(encoded.replace("11.123456789\"", "11.123456789+08:00\""), json), "offset time cannot silently change local event semantics");
        rejected(() -> BusinessEventEnvelopeCodec.read(encoded + " {}", json), "trailing extra JSON is rejected");
        rejected(() -> BusinessEventEnvelopeCodec.read(encoded.replace("\"sourceId\":500", "\"sourceId\":500.5"), json), "fractional event identifiers are rejected");
        RedisStreamUtil transport = new RedisStreamUtil(); set(transport, "stringRedisTemplate", strings);
        String stream = "quality:business-events";
        String messageId = transport.publishGlobalText(stream, Map.of("eventId", original.getEventId(), "eventType", "QUALITY", "payload", encoded, "tenantId", "91001"));
        List<MapRecord<String, Object, Object>> records = strings.opsForStream().range(stream, Range.unbounded());
        check(messageId != null && records.size() == 1 && encoded.equals(records.get(0).getValue().get("payload")),
                "real Redis transport carries exactly one JSON layer");
        check(BusinessEventEnvelopeCodec.read((String) records.get(0).getValue().get("payload"), json).getEventId().equals(original.getEventId()),
                "consumer reads the exact canonical envelope from Redis");
        strings.delete(stream);
    }

    private static MockServerWebExchange exchange() { return MockServerWebExchange.from(MockServerHttpRequest.get("/quality").build()); }
    private static void set(Object target, String name, Object value) throws Exception { Field field = target.getClass().getDeclaredField(name); field.setAccessible(true); field.set(target, value); }
    @FunctionalInterface private interface CheckedCall { void run() throws Exception; }
    private static void rejected(CheckedCall call, String message) throws Exception {
        try { call.run(); } catch (Exception expected) { check(true, message); return; }
        throw new AssertionError(message);
    }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); checks++; }
}
