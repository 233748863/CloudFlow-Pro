package com.cloudflow.gateway.filter;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.gateway.config.GatewayAuthProperties;
import java.lang.reflect.Field;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ReactorHttpHandlerAdapter;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.adapter.HttpWebHandlerAdapter;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Scheduler;
import reactor.core.scheduler.Schedulers;
import reactor.netty.DisposableServer;
import reactor.netty.http.server.HttpServer;

public class GatewayAuthenticationChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        AtomicReference<String> validationThread = new AtomicReference<>();
        AtomicReference<String> refreshThread = new AtomicReference<>();
        AtomicInteger forwarded = new AtomicInteger();
        AtomicBoolean tenantEnabled = new AtomicBoolean(true);
        AtomicBoolean trustedIdentity = new AtomicBoolean();
        AtomicBoolean untrustedHeadersRemoved = new AtomicBoolean();
        TokenService tokens = new TokenService() {
            @Override
            public Map<String, Object> verifyToken(String token) {
                validationThread.set(Thread.currentThread().getName());
                if (Thread.currentThread().getName().startsWith("redisson-netty-check")) return null;
                return "gateway-unit-token".equals(token) ? Map.of("tenantId", 100000L, "username", "gateway-unit-user") : null;
            }

            @Override
            public long getExpirationSeconds() {
                refreshThread.set(Thread.currentThread().getName());
                if (Thread.currentThread().getName().startsWith("redisson-netty-check")) throw new IllegalStateException("Blocking cookie refresh on Redis listener");
                return 3600L;
            }
        };
        GatewayAuthProperties properties = new GatewayAuthProperties() {
            @Override
            public List<String> effectiveWhitelist() {
                return List.of("/anonymous-check");
            }
        };
        TenantStatusChecker tenants = new TenantStatusChecker(WebClient.builder(), null) {
            @Override
            public Mono<Boolean> isAvailable(Long tenantId) {
                return Mono.just(tenantEnabled.get());
            }
        };
        AuthFilter filter = new AuthFilter();
        inject(filter, "tokenService", tokens);
        inject(filter, "authProperties", properties);
        inject(filter, "tenantStatusChecker", tenants);
        Scheduler listener = Schedulers.newSingle("redisson-netty-check");
        HttpWebHandlerAdapter handler = new HttpWebHandlerAdapter(exchange -> Mono.defer(() -> filter.filter(exchange, authenticated -> {
            forwarded.incrementAndGet();
            TraceGlobalFilter.Identity identity = authenticated.<TraceGlobalFilter.Identity>getAttribute(TraceGlobalFilter.IDENTITY);
            if (!"/anonymous-check".equals(authenticated.getRequest().getURI().getPath())) {
                trustedIdentity.set(identity != null && identity.tenantId().equals(100000L)
                        && "gateway-unit-user".equals(identity.userName())
                        && "100000".equals(authenticated.getRequest().getHeaders().getFirst(SecurityConstants.TENANT_ID_HEADER))
                        && "Bearer gateway-unit-token".equals(authenticated.getRequest().getHeaders().getFirst("Authorization")));
                untrustedHeadersRemoved.set(List.of("X-User-Id", "X-User-Name", "X-User-Roles", "X-User-Dept-Name", "X-User-Tenant-Id",
                        "X-Auth-Token", SecurityConstants.INNER_CALL_HEADER, SecurityConstants.FROM_SERVICE_HEADER).stream()
                        .noneMatch(name -> authenticated.getRequest().getHeaders().containsKey(name)));
            }
            authenticated.getResponse().setStatusCode(HttpStatus.NO_CONTENT);
            return authenticated.getResponse().setComplete();
        })).subscribeOn(listener));
        DisposableServer server = HttpServer.create().host("127.0.0.1").port(0)
                .handle(new ReactorHttpHandlerAdapter(handler)).bindNow(Duration.ofSeconds(15));
        try {
            HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).version(HttpClient.Version.HTTP_1_1).build();
            URI address = URI.create("http://127.0.0.1:" + server.port() + "/protected-check");
            HttpRequest cookie = HttpRequest.newBuilder(address).timeout(Duration.ofSeconds(10))
                    .header("Cookie", "Authorization=gateway-unit-token; XSRF-TOKEN=unit-csrf")
                    .header("X-User-Id", "999999").header("X-User-Name", "forged")
                    .header("X-User-Roles", "admin").header("X-User-Dept-Name", "forged")
                    .header("X-User-Tenant-Id", "100001").header("X-Tenant-Id", "100001")
                    .header("X-Auth-Token", "forged").header(SecurityConstants.INNER_CALL_HEADER, "true")
                    .header(SecurityConstants.FROM_SERVICE_HEADER, "forged").GET().build();
            HttpResponse<String> valid = client.send(cookie, HttpResponse.BodyHandlers.ofString());
            check(valid.statusCode() == 204, "valid cookie survives Redis listener continuation");
            check(validationThread.get().startsWith("boundedElastic-"), "token validation leaves Redis event loop");
            check(refreshThread.get().startsWith("boundedElastic-"), "cookie expiration lookup leaves Redis event loop");
            check(forwarded.get() == 1, "successful completion forwards exactly once without unauthorized fallback");
            check(trustedIdentity.get(), "gateway identity and tenant headers derive from verified token");
            check(untrustedHeadersRemoved.get(), "untrusted identity and internal-call headers remain removed");
            check(valid.headers().allValues("set-cookie").stream().anyMatch(value -> value.startsWith("Authorization=") && value.toLowerCase().contains("httponly")), "valid cookie refresh remains HttpOnly");
            HttpResponse<String> invalid = client.send(HttpRequest.newBuilder(address).header("Cookie", "Authorization=invalid-unit-token").GET().build(), HttpResponse.BodyHandlers.ofString());
            check(invalid.statusCode() == 401 && forwarded.get() == 1, "invalid cookie remains denied before downstream");
            check(invalid.headers().allValues("set-cookie").stream().anyMatch(value -> value.startsWith("Authorization=") && value.contains("Max-Age=0")), "invalid cookie is cleared");
            HttpResponse<String> missing = client.send(HttpRequest.newBuilder(address).GET().build(), HttpResponse.BodyHandlers.ofString());
            check(missing.statusCode() == 401 && forwarded.get() == 1, "missing login remains denied");
            HttpResponse<String> bearer = client.send(HttpRequest.newBuilder(address).header("Authorization", "Bearer gateway-unit-token").GET().build(), HttpResponse.BodyHandlers.ofString());
            check(bearer.statusCode() == 204 && forwarded.get() == 2, "verified bearer identity still works");
            tenantEnabled.set(false);
            HttpResponse<String> disabled = client.send(cookie, HttpResponse.BodyHandlers.ofString());
            check(disabled.statusCode() == 403 && forwarded.get() == 2, "disabled tenant remains denied");
            int beforeAnonymous = forwarded.get();
            HttpResponse<String> anonymous = client.send(HttpRequest.newBuilder(address.resolve("/anonymous-check")).GET().build(), HttpResponse.BodyHandlers.ofString());
            check(anonymous.statusCode() == 204 && forwarded.get() == beforeAnonymous + 1, "existing anonymous whitelist remains unchanged");
        } finally {
            server.disposeNow(Duration.ofSeconds(5));
            listener.dispose();
        }
        System.out.println("Batch G gateway authentication checks passed: " + checks);
    }

    private static void inject(AuthFilter filter, String name, Object value) throws Exception {
        Field field = AuthFilter.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(filter, value);
    }

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }
}
