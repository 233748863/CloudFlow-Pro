package com.cloudflow.auth.im;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.lang.reflect.Proxy;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.RedisScript;

public final class ImLoginChecks {
    private static int assertions;
    private static final String INVALID = "IM_LOGIN_CHALLENGE_INVALID";
    private static final String ORIGIN = "https://im-login.example.invalid";
    private static final String CALLBACK = ORIGIN + "/api/auth/im/WECOM/callback";
    private static final long TENANT = 700000000000L;

    public static void main(String[] arguments) throws Exception {
        cookies();
        int port = Integer.parseInt(System.getenv("IM_CHECK_REDIS_PORT"));
        String password = System.getenv("IM_CHECK_REDIS_PASSWORD");
        if (port <= 1024 || port >= 65536 || password == null || password.isBlank()) throw new IllegalStateException("Isolated Redis required");
        RedissonClient firstClient = client(port, password);
        RedissonClient secondClient = client(port, password);
        try {
            run(template(firstClient), template(secondClient));
        } finally {
            secondClient.shutdown();
            firstClient.shutdown();
        }
        System.out.println("G4_IM_LOGIN_CHALLENGES: assertions=" + assertions
                + "; failed=0; real_redis=true; clients=2; concurrent_callers=24; vendor_http=false; login_http=false; production_modified=false");
    }

    private static void run(StringRedisTemplate firstRedis, StringRedisTemplate secondRedis) throws Exception {
        ImProperties properties = new ImProperties();
        properties.setEnabled(true);
        properties.setSecretKey("isolated-login-key-" + ImLoginChallenges.randomToken());
        properties.setPublicUrl(ORIGIN);
        properties.setLoginRedirectPaths(List.of("/", "/dashboard", "/profile/im"));
        ImSecretCipher cipher = new ImSecretCipher(properties);
        ImLoginRedirects redirects = new ImLoginRedirects(properties);
        MutableClock clock = new MutableClock();
        ImLoginChallenges first = challenges(firstRedis, cipher, redirects, clock);
        ImLoginChallenges second = challenges(secondRedis, cipher, redirects, clock);
        List<String> owned = new ArrayList<>();
        String browser = ImLoginChallenges.randomToken();
        ImLoginChallenges.Context context = context(TENANT, 41, 2, ImLoginChallenges.Purpose.SCAN_LOGIN);
        ExecutorService pool = Executors.newFixedThreadPool(12);
        try {
            redirects(properties, redirects);
            credentials(context);
            rejected(() -> first.issue(null, browser), "IM_CONFIGURATION_INVALID");
            rejected(() -> first.issue(context, null), INVALID);
            for (String invalid : List.of("", "abc", " ".repeat(43), "A".repeat(42) + "B", "A".repeat(44))) {
                rejected(() -> first.consume(invalid, browser, context.purpose()), INVALID);
            }
            String token = issue(first, context, browser, owned);
            equal(43, token.length(), "state contains 32 random bytes in canonical base64url");
            check(!ImLoginChallenges.key(token).contains(token), "Redis key does not contain bearer state");
            long ttl = firstRedis.getExpire(ImLoginChallenges.key(token), TimeUnit.SECONDS);
            check(ttl > 290 && ttl <= 300, "real Redis state expires in five minutes");
            String raw = firstRedis.opsForValue().get(ImLoginChallenges.key(token));
            check(raw != null && raw.startsWith(TENANT + ":im1:") && !raw.contains(browser)
                    && !raw.contains(token) && !raw.contains(CALLBACK) && !raw.contains("corp-login"), "state is encrypted with no raw browser or identity");
            rejected(() -> cipher.decrypt(TENANT, "WECOM", ImSecretCipher.Field.ACCESS_TOKEN,
                    raw.substring(raw.indexOf(':') + 1)), "IM_SECRET_UNAVAILABLE");
            rejected(() -> second.consume(token, ImLoginChallenges.randomToken(), context.purpose()), INVALID);
            rejected(() -> second.consume(token, browser, ImLoginChallenges.Purpose.BIND), INVALID);
            rejected(() -> second.consume(token, browser, ImLoginChallenges.Purpose.EMBEDDED_LOGIN), INVALID);
            rejected(() -> second.consume(token, browser, null), INVALID);
            equal(context, second.consume(token, browser, context.purpose()), "correct browser remains usable after wrong purpose and browser");
            rejected(() -> first.consume(token, browser, context.purpose()), INVALID);
            String concurrent = issue(first, context, browser, owned);
            CountDownLatch start = new CountDownLatch(1);
            List<Future<Boolean>> results = new ArrayList<>();
            for (int index = 0; index < 24; index++) {
                ImLoginChallenges selected = index % 2 == 0 ? first : second;
                results.add(pool.submit(() -> {
                    start.await();
                    try {
                        if (!context.equals(selected.consume(concurrent, browser, context.purpose()))) throw new AssertionError("changed context");
                        return true;
                    } catch (ImFailure failure) {
                        if (!INVALID.equals(failure.getReasonCode())) throw failure;
                        return false;
                    }
                }));
            }
            int winners = 0;
            for (Future<Boolean> result : release(start, results)) if (result.get(15, TimeUnit.SECONDS)) winners++;
            equal(1, winners, "exactly one real Redis consumer wins across two clients");
            check(!Boolean.TRUE.equals(firstRedis.hasKey(ImLoginChallenges.key(concurrent))), "winning consume removes state");
            System.out.println("G4_IM_LOGIN_STATE_RACE: clients=2; callers=24; successes=" + winners + "; replays_rejected=23");
            String other = issue(first, context(TENANT + 1, 42, 3, context.purpose()), browser, owned);
            String otherRaw = firstRedis.opsForValue().get(ImLoginChallenges.key(other));
            firstRedis.opsForValue().set(ImLoginChallenges.key(token), otherRaw, Duration.ofSeconds(300));
            rejected(() -> second.consume(token, browser, context.purpose()), INVALID);
            equal(TENANT + 1, first.consume(other, browser, context.purpose()).tenantId(), "cross-key ciphertext substitution cannot change tenant");
            firstRedis.opsForValue().set(ImLoginChallenges.key(token), (TENANT + 1) + raw.substring(raw.indexOf(':')), Duration.ofSeconds(300));
            rejected(() -> second.consume(token, browser, context.purpose()), INVALID);
            for (String corrupt : List.of("not-encrypted", TENANT + ":im1:broken", "0:" + raw, "9".repeat(25) + ":x", "x".repeat(13000))) {
                firstRedis.opsForValue().set(ImLoginChallenges.key(token), corrupt, Duration.ofSeconds(300));
                rejected(() -> first.consume(token, browser, context.purpose()), INVALID);
            }
            String expiry = issue(first, context, browser, owned);
            firstRedis.expire(ImLoginChallenges.key(expiry), Duration.ofMillis(40));
            Thread.sleep(100);
            rejected(() -> second.consume(expiry, browser, context.purpose()), INVALID);
            String expired = issue(first, context, browser, owned);
            clock.advance(300000);
            rejected(() -> second.consume(expired, browser, context.purpose()), INVALID);
            clock.advance(-300000);
            String future = issue(first, context, browser, owned);
            clock.advance(-1000);
            rejected(() -> second.consume(future, browser, context.purpose()), INVALID);
            clock.advance(1000);
            String persistent = issue(first, context, browser, owned);
            firstRedis.persist(ImLoginChallenges.key(persistent));
            rejected(() -> second.consume(persistent, browser, context.purpose()), INVALID);
            String lost = issue(first, context, browser, owned);
            firstRedis.delete(ImLoginChallenges.key(lost));
            rejected(() -> second.consume(lost, browser, context.purpose()), INVALID);
            String revoked = issue(first, context, browser, owned);
            properties.setLoginRedirectPaths(List.of("/profile/im"));
            rejected(() -> second.consume(revoked, browser, context.purpose()), "IM_CONFIGURATION_INVALID");
            properties.setLoginRedirectPaths(List.of("/", "/dashboard", "/profile/im"));
            properties.setPublicUrl("https://replacement.example.invalid");
            rejected(() -> second.consume(revoked, browser, context.purpose()), INVALID);
            properties.setPublicUrl(ORIGIN);
            properties.setEnabled(false);
            rejected(() -> second.consume(revoked, browser, context.purpose()), "IM_DISABLED");
            properties.setEnabled(true);
            ImLoginChallenges.Context binding = context(TENANT, 41, 2, ImLoginChallenges.Purpose.BIND);
            String bindToken = issue(first, binding, browser, owned);
            rejected(() -> second.consume(bindToken, browser, context.purpose()), INVALID);
            equal(binding, second.consume(bindToken, browser, ImLoginChallenges.Purpose.BIND), "binding preserves server-owned account and session digest");
            check(!binding.toString().contains("private-release") && !binding.toString().contains("corp-login"), "context string output is redacted");
            for (int index = 0; index < 64; index++) {
                String unique = issue(first, context, browser, owned);
                equal(1L, owned.stream().filter(key -> key.equals(ImLoginChallenges.key(unique))).count(), "random state is unique");
            }
            racedConsumption(firstRedis, cipher, redirects, clock, context, browser, owned);
            unavailable(cipher, redirects, clock, context, browser);
            authorization(firstRedis, first, redirects, context, browser, owned);
        } finally {
            pool.shutdownNow();
            if (!pool.awaitTermination(15, TimeUnit.SECONDS)) throw new AssertionError("Login workers still active");
            firstRedis.delete(owned);
            for (String key : owned) check(!Boolean.TRUE.equals(firstRedis.hasKey(key)), "owned state removed");
            System.out.println("G4_IM_LOGIN_STATE_CLEANUP: owned_keys=" + owned.size() + "; remaining=0; shared_flush=false");
        }
    }

    private static void racedConsumption(StringRedisTemplate redis, ImSecretCipher cipher, ImLoginRedirects redirects,
            Clock clock, ImLoginChallenges.Context context, String browser, List<String> owned) {
        AtomicInteger scripts = new AtomicInteger();
        StringRedisTemplate changed = new StringRedisTemplate(Objects.requireNonNull(redis.getConnectionFactory())) {
            @Override
            public <Result> Result execute(RedisScript<Result> script, List<String> keys, Object... arguments) {
                scripts.incrementAndGet();
                redis.opsForValue().set(keys.get(0), "changed-after-read", Duration.ofSeconds(60));
                return super.execute(script, keys, arguments);
            }
        };
        ImLoginChallenges service = challenges(changed, cipher, redirects, clock);
        String token = issue(service, context, browser, owned);
        rejected(() -> service.consume(token, browser, context.purpose()), INVALID);
        equal(1, scripts.get(), "fault injected between decode and consume");
        equal("changed-after-read", redis.opsForValue().get(ImLoginChallenges.key(token)), "CAS preserves the replacement instead of deleting blindly");
    }

    private static void unavailable(ImSecretCipher cipher, ImLoginRedirects redirects, Clock clock,
            ImLoginChallenges.Context context, String browser) {
        StringRedisTemplate unavailable = new StringRedisTemplate() {
            @Override
            public ValueOperations<String, String> opsForValue() { throw new IllegalStateException("sensitive-redis-failure"); }
        };
        ImLoginChallenges service = challenges(unavailable, cipher, redirects, clock);
        rejected(() -> service.issue(context, browser), "IM_LOGIN_CHALLENGE_UNAVAILABLE");
        rejected(() -> service.consume(ImLoginChallenges.randomToken(), browser, context.purpose()), "IM_LOGIN_CHALLENGE_UNAVAILABLE");
    }

    private static void authorization(StringRedisTemplate redis, ImLoginChallenges challenges, ImLoginRedirects redirects,
            ImLoginChallenges.Context context, String browser, List<String> owned) {
        ImLoginAuthorization authorization = new ImLoginAuthorization(challenges, redirects);
        for (ImLoginChallenges.Purpose purpose : ImLoginChallenges.Purpose.values()) {
            ImLoginChallenges.Context selected = context(TENANT, 41, 2, purpose);
            ImLoginAuthorization.Grant grant = authorization.begin(credential(TENANT, 41, 2, "corp-login", 17), selected, browser);
            URI uri = URI.create(grant.authorizationUrl());
            Map<String, String> query = new HashMap<>();
            for (String part : uri.getRawQuery().split("&")) {
                String[] pair = part.split("=", 2);
                if (query.put(pair[0], URLDecoder.decode(pair[1], StandardCharsets.UTF_8)) != null) throw new AssertionError("duplicate URL parameter");
            }
            String token = query.get("state");
            owned.add(ImLoginChallenges.key(token));
            equal("https", uri.getScheme(), "authorization uses HTTPS");
            equal(purpose == ImLoginChallenges.Purpose.EMBEDDED_LOGIN ? "open.weixin.qq.com" : "open.work.weixin.qq.com",
                    uri.getHost(), "SDK authorization uses fixed official provider domain");
            equal(purpose == ImLoginChallenges.Purpose.BIND ? ORIGIN + "/api/auth/im/WECOM/binding-callback" : CALLBACK,
                    query.get("redirect_uri"), "SDK callback matches deployment address and exact purpose");
            equal("corp-login", query.get("appid"), "SDK authorization binds corp");
            if (purpose == ImLoginChallenges.Purpose.EMBEDDED_LOGIN) equal("snsapi_base", query.get("scope"), "embedded identity requests least scope");
            else equal("17", query.get("agentid"), "scan authorization binds app");
            equal(300, grant.expiresIn(), "authorization response expiration");
            check(!grant.toString().contains(token), "authorization string output hides state");
            check(Boolean.TRUE.equals(redis.hasKey(ImLoginChallenges.key(token))), "authorization URL creates actual Redis challenge");
            equal(selected, challenges.consume(token, browser, purpose), "SDK URL state resolves only its original context");
        }
        rejected(() -> authorization.begin(credential(TENANT + 1, 41, 2, "corp-login", 17), context, browser), INVALID);
    }

    private static void redirects(ImProperties properties, ImLoginRedirects redirects) {
        equal(CALLBACK, redirects.callbackUrl(), "login callback is separate from event callback");
        equal(ORIGIN + "/api/auth/im/WECOM/binding-callback", redirects.bindingCallbackUrl(), "binding callback is separate from login");
        equal(ORIGIN + "/workspace/im-bindings", redirects.bindingDestination(), "binding always returns to own protected page");
        ImLoginChallenges.Context binding = context(TENANT, 41, 2, ImLoginChallenges.Purpose.BIND);
        rejected(() -> redirects.verify(binding.callbackUrl(), binding.redirectPath()), INVALID);
        rejected(() -> redirects.verify(new ImLoginChallenges.Context(TENANT, 41, 2, "corp-login", 17, CALLBACK,
                binding.redirectPath(), ImLoginChallenges.Purpose.BIND, null, binding.ownerUserId(), binding.ownerVersion(),
                binding.ownerSessionDigest(), binding.ownerCredentialStamp(), binding.ownerProofNonce())), INVALID);
        rejected(() -> redirects.verify(new ImLoginChallenges.Context(TENANT, 41, 2, "corp-login", 17, binding.callbackUrl(),
                "/dashboard", ImLoginChallenges.Purpose.BIND, null, binding.ownerUserId(), binding.ownerVersion(),
                binding.ownerSessionDigest(), binding.ownerCredentialStamp(), binding.ownerProofNonce())), INVALID);
        equal(ORIGIN + "/dashboard", redirects.destination("/dashboard"), "whitelisted local target");
        for (String path : List.of("https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/%2f%2fevil.invalid", "/../dashboard",
                "/dashboard?next=https://evil.invalid", "/dashboard#fragment", "/dash\r\nboard", "/not-listed", "/dashboard/")) {
            rejected(() -> redirects.destination(path), "IM_CONFIGURATION_INVALID");
        }
        properties.setLoginRedirectPaths(List.of("/dashboard", "//evil.invalid"));
        rejected(() -> redirects.destination("/dashboard"), "IM_CONFIGURATION_INVALID");
        properties.setLoginRedirectPaths(List.of());
        rejected(() -> redirects.destination("/dashboard"), "IM_CONFIGURATION_INVALID");
        properties.setLoginRedirectPaths(List.of("/", "/dashboard", "/profile/im"));
        for (String origin : List.of("http://im-login.example.invalid", "https://user@im-login.example.invalid", "https://im-login.example.invalid/other",
                "https://im-login.example.invalid?next=evil", "https://im-login.example.invalid\\evil")) {
            properties.setPublicUrl(origin);
            rejected(redirects::callbackUrl, "IM_CONFIGURATION_INVALID");
        }
        properties.setPublicUrl(ORIGIN);
    }

    private static void credentials(ImLoginChallenges.Context context) {
        context.verifyConfiguration(credential(TENANT, 41, 2, "corp-login", 17));
        rejected(() -> context.verifyConfiguration(null), INVALID);
        for (WeComCredentials changed : List.of(credential(TENANT + 1, 41, 2, "corp-login", 17),
                credential(TENANT, 42, 2, "corp-login", 17), credential(TENANT, 41, 3, "corp-login", 17),
                credential(TENANT, 41, 2, "another-corp", 17), credential(TENANT, 41, 2, "corp-login", 18))) {
            rejected(() -> context.verifyConfiguration(changed), INVALID);
        }
        rejected(() -> new ImLoginChallenges.Context(TENANT, 41, 2, "corp-login", 17, CALLBACK, "/dashboard",
                ImLoginChallenges.Purpose.BIND, null, null, null, null), "IM_CONFIGURATION_INVALID");
        rejected(() -> new ImLoginChallenges.Context(TENANT, 41, 2, "corp-login", 17, CALLBACK, "/dashboard",
                ImLoginChallenges.Purpose.SCAN_LOGIN, null, 7L, 0, "a".repeat(64)), "IM_CONFIGURATION_INVALID");
    }

    private static void cookies() {
        List<Cookie> responseCookies = new ArrayList<>();
        HttpServletResponse response = (HttpServletResponse) Proxy.newProxyInstance(ImLoginChecks.class.getClassLoader(),
                new Class<?>[]{HttpServletResponse.class}, (proxy, method, values) -> {
                    if (!"addCookie".equals(method.getName())) throw new AssertionError("Unexpected response method");
                    responseCookies.add((Cookie) values[0]);
                    return null;
                });
        String browser = ImLoginBrowser.begin(request(null), response);
        equal(1, responseCookies.size(), "one challenge cookie set");
        Cookie cookie = responseCookies.get(0);
        equal("__Host-CloudFlowIM", cookie.getName(), "browser cookie is host bound");
        check(cookie.getSecure() && cookie.isHttpOnly(), "browser cookie is secure and unavailable to scripts");
        equal("/", cookie.getPath(), "host prefix requires root path");
        equal(null, cookie.getDomain(), "no domain cookie scope");
        equal("Lax", cookie.getAttribute("SameSite"), "top-level provider callback can return cookie");
        equal(300, cookie.getMaxAge(), "browser cookie expires with authorization");
        equal(browser, ImLoginBrowser.require(request(new Cookie[]{cookie})), "exact browser cookie restored");
        equal(browser, ImLoginBrowser.begin(request(new Cookie[]{cookie}), response), "parallel starts share valid browser identity");
        rejected(() -> ImLoginBrowser.require(request(null)), INVALID);
        rejected(() -> ImLoginBrowser.require(request(new Cookie[]{cookie, cookie})), INVALID);
        rejected(() -> ImLoginBrowser.require(request(new Cookie[]{new Cookie(cookie.getName(), "invalid")})), INVALID);
        rejected(() -> ImLoginBrowser.begin(null, response), INVALID);
    }

    private static HttpServletRequest request(Cookie[] cookies) {
        return (HttpServletRequest) Proxy.newProxyInstance(ImLoginChecks.class.getClassLoader(), new Class<?>[]{HttpServletRequest.class},
                (proxy, method, values) -> {
                    if (!"getCookies".equals(method.getName())) throw new AssertionError("Browser identity must not read client headers or parameters");
                    return cookies;
                });
    }

    private static ImLoginChallenges.Context context(long tenant, long config, int version, ImLoginChallenges.Purpose purpose) {
        return new ImLoginChallenges.Context(tenant, config, version, "corp-login", 17,
                purpose == ImLoginChallenges.Purpose.BIND ? ORIGIN + "/api/auth/im/WECOM/binding-callback" : CALLBACK,
                purpose == ImLoginChallenges.Purpose.BIND ? "/workspace/im-bindings" : "/dashboard", purpose,
                "private-release", purpose == ImLoginChallenges.Purpose.BIND ? 15L : null,
                purpose == ImLoginChallenges.Purpose.BIND ? 3 : null, purpose == ImLoginChallenges.Purpose.BIND ? "b".repeat(64) : null,
                purpose == ImLoginChallenges.Purpose.BIND ? "c".repeat(64) : null,
                purpose == ImLoginChallenges.Purpose.BIND ? ImLoginChallenges.randomToken() : null);
    }

    private static WeComCredentials credential(long tenant, long config, int version, String corp, long agent) {
        return new WeComCredentials(tenant, config, version, corp, agent, "test-secret", null, null);
    }

    private static ImLoginChallenges challenges(StringRedisTemplate redis, ImSecretCipher cipher, ImLoginRedirects redirects, Clock clock) {
        return new ImLoginChallenges(redis, cipher, redirects, new ObjectMapper(), clock);
    }

    private static String issue(ImLoginChallenges service, ImLoginChallenges.Context context, String browser, List<String> owned) {
        String token = service.issue(context, browser);
        owned.add(ImLoginChallenges.key(token));
        return token;
    }

    private static List<Future<Boolean>> release(CountDownLatch start, List<Future<Boolean>> results) {
        start.countDown();
        return results;
    }

    private static StringRedisTemplate template(RedissonClient client) throws Exception {
        RedissonConnectionFactory factory = new RedissonConnectionFactory(client);
        factory.afterPropertiesSet();
        StringRedisTemplate template = new StringRedisTemplate(factory);
        template.afterPropertiesSet();
        return template;
    }

    private static RedissonClient client(int port, String password) {
        Config configuration = new Config().setThreads(2).setNettyThreads(2);
        configuration.useSingleServer().setAddress("redis://127.0.0.1:" + port).setPassword(password).setRetryAttempts(0)
                .setConnectionMinimumIdleSize(1).setConnectionPoolSize(4)
                .setSubscriptionConnectionMinimumIdleSize(1).setSubscriptionConnectionPoolSize(2);
        return Redisson.create(configuration);
    }

    private static void rejected(Runnable operation, String reason) {
        try { operation.run(); throw new AssertionError("expected " + reason); }
        catch (ImFailure failure) {
            equal(reason, failure.getReasonCode(), "safe rejection reason");
            equal(null, failure.getCause(), "failure contains no sensitive cause");
        }
    }

    private static void check(boolean success, String message) { assertions++; if (!success) throw new AssertionError(message); }
    private static void equal(Object expected, Object actual, String message) { check(Objects.equals(expected, actual), message); }

    private static final class MutableClock extends Clock {
        private long milliseconds = System.currentTimeMillis();
        void advance(long milliseconds) { this.milliseconds += milliseconds; }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(instant(), zone); }
        @Override public Instant instant() { return Instant.ofEpochMilli(milliseconds); }
        @Override public long millis() { return milliseconds; }
    }
}
