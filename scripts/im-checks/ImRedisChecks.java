package com.cloudflow.auth.im;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.redisson.spring.data.connection.RedissonConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

public final class ImRedisChecks {
    private static int assertions;

    public static void main(String[] arguments) throws Exception {
        int port = Integer.parseInt(System.getenv("IM_CHECK_REDIS_PORT"));
        String password = System.getenv("IM_CHECK_REDIS_PASSWORD");
        if (port <= 1024 || port >= 65536 || password == null || password.isBlank()) throw new IllegalStateException("Isolated Redis required");
        RedissonClient firstClient = client(port, password);
        RedissonClient secondClient = client(port, password);
        try {
            RedissonConnectionFactory factory = new RedissonConnectionFactory(firstClient);
            factory.afterPropertiesSet();
            StringRedisTemplate redis = new StringRedisTemplate(factory);
            redis.afterPropertiesSet();
            ImProperties properties = new ImProperties();
            properties.setSecretKey("isolated-im-cache-key-" + "Q".repeat(48));
            ImSecretCipher cipher = new ImSecretCipher(properties);
            ImAccessTokens first = new ImAccessTokens(redis, firstClient, cipher);
            ImAccessTokens second = new ImAccessTokens(redis, secondClient, cipher);
            run(redis, cipher, first, second, firstClient);
        } finally {
            secondClient.shutdown();
            firstClient.shutdown();
        }
        System.out.println("G4_IM_REDIS_CHECKS: assertions=" + assertions
                + "; failed=0; real_redis=true; redis_clients=2; concurrent_callers=24; grant_supplier=controlled; http=false; mysql=false; production_modified=false");
    }

    private static RedissonClient client(int port, String password) {
        Config config = new Config().setThreads(2).setNettyThreads(2);
        config.useSingleServer().setAddress("redis://127.0.0.1:" + port).setPassword(password).setRetryAttempts(0)
                .setConnectionMinimumIdleSize(1).setConnectionPoolSize(4)
                .setSubscriptionConnectionMinimumIdleSize(1).setSubscriptionConnectionPoolSize(2);
        return Redisson.create(config);
    }

    private static void run(StringRedisTemplate redis, ImSecretCipher cipher, ImAccessTokens first, ImAccessTokens second,
            RedissonClient lockClient) throws Exception {
        long tenantId = 1_000_000_000L + new java.security.SecureRandom().nextLong(1_000_000_000_000L);
        List<WeComCredentials> credentials = List.of(credential(tenantId, 100, 0), credential(tenantId + 1, 100, 0),
                credential(tenantId, 101, 0), credential(tenantId, 100, 1), credential(tenantId, 102, 0), credential(tenantId, 103, 0));
        List<String> ownedKeys = new ArrayList<>();
        for (WeComCredentials configuration : credentials) {
            ownedKeys.add(configuration.cacheKey());
            ownedKeys.add(configuration.cacheKey() + ":lock");
        }
        for (String key : ownedKeys) check(!Boolean.TRUE.equals(redis.hasKey(key)), "new isolated namespace is empty");
        ExecutorService pool = Executors.newFixedThreadPool(12);
        try {
            WeComCredentials main = credentials.get(0);
            AtomicInteger refreshes = new AtomicInteger();
            CountDownLatch ready = new CountDownLatch(1);
            List<Future<String>> results = new ArrayList<>();
            for (int index = 0; index < 24; index++) {
                ImAccessTokens selected = index % 2 == 0 ? first : second;
                results.add(pool.submit(() -> {
                    ready.await();
                    return selected.resolve(main, () -> {
                        refreshes.incrementAndGet();
                        try { Thread.sleep(60); }
                        catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw ImFailure.remote(); }
                        return new ImAccessTokens.Grant("first-remote-token", 7200);
                    });
                }));
            }
            ready.countDown();
            for (Future<String> result : results) equal("first-remote-token", result.get(10, TimeUnit.SECONDS), "concurrent callers share one token");
            equal(1, refreshes.get(), "one provider refresh across two clients");
            long remaining = redis.getExpire(main.cacheKey(), TimeUnit.SECONDS);
            check(remaining > 7060 && remaining <= 7080, "provider expiry minus at least 120 seconds");
            String encrypted = redis.opsForValue().get(main.cacheKey());
            check(encrypted != null && encrypted.startsWith("im1:") && !encrypted.contains("first-remote-token"), "Redis stores only authenticated ciphertext");
            equal("first-remote-token", cipher.decrypt(main.tenantId(), "WECOM", ImSecretCipher.Field.ACCESS_TOKEN, encrypted), "cached token decrypts independently");
            equal("first-remote-token", second.resolve(main, () -> { throw new AssertionError("cache hit must not refresh"); }), "cache read reused by another client");
            for (int index = 1; index <= 3; index++) {
                String other = "different-token-" + index;
                equal(other, second.resolve(credentials.get(index), () -> new ImAccessTokens.Grant(other, 7200)), "tenant config and version separated");
            }
            first.discard(main, "another-token");
            check(Boolean.TRUE.equals(redis.hasKey(main.cacheKey())), "stale failure cannot discard a newer token");
            second.discard(main, "first-remote-token");
            check(!Boolean.TRUE.equals(redis.hasKey(main.cacheKey())), "exact rejected token discarded");
            equal("second-remote-token", first.resolve(main, () -> new ImAccessTokens.Grant("second-remote-token", 7200)), "subsequent request refreshes after explicit rejection");
            first.discard(main, "first-remote-token");
            equal("second-remote-token", second.resolve(main, () -> { throw new AssertionError("stale error removed fresh cache"); }), "late previous failure preserves fresh token");
            redis.expire(main.cacheKey(), Duration.ofMillis(40));
            Thread.sleep(100);
            equal("after-expiry-token", second.resolve(main, () -> new ImAccessTokens.Grant("after-expiry-token", 7200)), "real Redis expiry triggers refresh");
            WeComCredentials failure = credentials.get(4);
            rejected(() -> first.resolve(failure, () -> { throw ImFailure.remote(); }), "IM_PROVIDER_REJECTED");
            check(!Boolean.TRUE.equals(redis.hasKey(failure.cacheKey())), "failed refresh not cached");
            check(!Boolean.TRUE.equals(redis.hasKey(failure.cacheKey() + ":lock")), "failed refresh releases lease");
            redis.opsForValue().set(failure.cacheKey(), "not-authenticated-ciphertext", Duration.ofSeconds(30));
            rejected(() -> second.resolve(failure, () -> { throw new AssertionError("corrupt cache must fail closed"); }), "IM_SECRET_UNAVAILABLE");
            WeComCredentials lease = credentials.get(5);
            rejected(() -> first.resolve(lease, () -> {
                lockClient.getLock(lease.cacheKey() + ":lock").forceUnlock();
                return new ImAccessTokens.Grant("lost-lease-token", 7200);
            }), "IM_PROVIDER_REJECTED");
            check(!Boolean.TRUE.equals(redis.hasKey(lease.cacheKey())), "lost lease cannot publish token");
        } finally {
            pool.shutdownNow();
            if (!pool.awaitTermination(15, TimeUnit.SECONDS)) throw new AssertionError("IM workers still running; cleanup not safe");
            redis.delete(ownedKeys);
            for (String key : ownedKeys) check(!Boolean.TRUE.equals(redis.hasKey(key)), "owned cache and locks removed");
            System.out.println("G4_IM_REDIS_CLEANUP: owned_keys=" + ownedKeys.size() + "; remaining=0; shared_flush=false");
        }
    }

    private static WeComCredentials credential(long tenantId, long configId, int version) {
        return new WeComCredentials(tenantId, configId, version, "corpA", 77, "test-application-secret", null, null);
    }

    private static void check(boolean result, String name) { assertions++; if (!result) throw new AssertionError(name); }
    private static void equal(Object expected, Object actual, String name) { check(Objects.equals(expected, actual), name); }
    private static void rejected(Runnable action, String reason) {
        try { action.run(); throw new AssertionError("expected " + reason); }
        catch (ImFailure failure) { equal(reason, failure.getReasonCode(), "safe failure reason"); }
    }
}
