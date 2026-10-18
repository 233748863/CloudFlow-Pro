package com.cloudflow.auth.storage;

import com.cloudflow.common.config.ContextAwareExecutorService;
import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.context.TraceContext;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import feign.RequestInterceptor;
import feign.RequestTemplate;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.github.resilience4j.timelimiter.TimeLimiterRegistry;
import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Proxy;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import org.slf4j.MDC;
import org.springframework.cloud.circuitbreaker.resilience4j.Resilience4JCircuitBreakerFactory;
import org.springframework.cloud.client.circuitbreaker.CircuitBreaker;
import org.springframework.cloud.client.circuitbreaker.Customizer;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

public class FeignCircuitBreakerContextChecks {
    private static int checks;
    private static final List<String> TRACES = List.of("a0123456789abcdef0123456789abcdef", "b0123456789abcdef0123456789abcdef");

    public static void main(String[] arguments) throws Exception {
        ExecutorService worker = Executors.newSingleThreadExecutor();
        ContextAwareExecutorService executor = new ContextAwareExecutorService(worker);
        worker.submit(() -> { }).get(5, TimeUnit.SECONDS);
        com.cloudflow.auth.config.FeignRequestInterceptor auth = new com.cloudflow.auth.config.FeignRequestInterceptor("cloudflow-auth");
        com.cloudflow.oa.config.FeignRequestInterceptor oa = new com.cloudflow.oa.config.FeignRequestInterceptor("cloudflow-service-oa");
        com.cloudflow.crm.config.FeignRequestInterceptor crm = new com.cloudflow.crm.config.FeignRequestInterceptor("cloudflow-service-crm");
        com.cloudflow.hr.config.FeignRequestInterceptor hr = new com.cloudflow.hr.config.FeignRequestInterceptor("cloudflow-service-hr");
        com.cloudflow.workflow.config.FeignRequestInterceptor workflow = new com.cloudflow.workflow.config.FeignRequestInterceptor("cloudflow-service-workflow");
        List<Registration> configurations = List.of(
                new Registration("auth", auth, auth::feignCircuitBreakerContext),
                new Registration("oa", oa, oa::feignCircuitBreakerContext),
                new Registration("crm", crm, crm::feignCircuitBreakerContext),
                new Registration("hr", hr, hr::feignCircuitBreakerContext),
                new Registration("workflow", workflow, workflow::feignCircuitBreakerContext));
        try {
            for (Registration registration : configurations) {
                Resilience4JCircuitBreakerFactory factory = new Resilience4JCircuitBreakerFactory(CircuitBreakerRegistry.ofDefaults(), TimeLimiterRegistry.ofDefaults(), null);
                registration.configure().apply(executor).customize(factory);
                CircuitBreaker breaker = factory.create("batch-g-" + registration.name());
                for (int index = 0; index < TRACES.size(); index++) {
                    String trace = TRACES.get(index);
                    long tenantId = 100000L + index;
                    long userId = 101L + index;
                    UserContext.setUserId(userId);
                    UserContext.setTenantId(tenantId);
                    UserContext.setAuthToken("unit-feign-token-" + index);
                    UserContext.setPermissions(Set.of("system:log:list"));
                    TenantContext.setTenantId(tenantId);
                    MDC.put(TraceContext.MDC_KEY, trace);
                    HttpServletRequest request = (HttpServletRequest) Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(), new Class<?>[]{HttpServletRequest.class}, (proxy, method, values) -> { throw new IllegalStateException("Expired request must not be copied to circuit-breaker workers"); });
                    ServletRequestAttributes attributes = new ServletRequestAttributes(request);
                    RequestContextHolder.setRequestAttributes(attributes);
                    Snapshot snapshot = breaker.run(() -> {
                        RequestTemplate template = new RequestTemplate();
                        registration.interceptor().apply(template);
                        return new Snapshot(String.join(",", template.headers().get(TraceContext.HEADER)),
                                String.join(",", template.headers().get(SecurityConstants.TENANT_ID_HEADER)),
                                UserContext.getUserId(), UserContext.getAuthToken(), UserContext.getPermissions(),
                                RequestContextHolder.getRequestAttributes() == null);
                    });
                    check(snapshot.trace().equals(trace) && snapshot.tenant().equals(String.valueOf(tenantId)), registration.name() + " circuit breaker preserves trace and tenant on a reused worker");
                    check(snapshot.userId().equals(userId) && snapshot.token().equals("unit-feign-token-" + index)
                            && snapshot.permissions().equals(Set.of("system:log:list")) && snapshot.noRequest(), registration.name() + " circuit breaker transfers verified identity without servlet objects");
                    check(trace.equals(MDC.get(TraceContext.MDC_KEY)) && UserContext.getUserId().equals(userId)
                            && RequestContextHolder.getRequestAttributes() == attributes, registration.name() + " circuit breaker leaves caller context intact");
                    clear();
                }
                check(worker.submit(FeignCircuitBreakerContextChecks::empty).get(5, TimeUnit.SECONDS), registration.name() + " worker context is cleared after completion");
                check(breaker.run(() -> UserContext.getUserId() == null && TenantContext.getTenantId() == null && TraceContext.isValid(MDC.get(TraceContext.MDC_KEY))), registration.name() + " anonymous work does not inherit the previous caller");
            }
            try {
                executor.submit(() -> { throw new IllegalStateException("unit failure"); }).get(5, TimeUnit.SECONDS);
                throw new AssertionError("worker failure was hidden");
            } catch (ExecutionException expected) {
                check(expected.getCause() instanceof IllegalStateException, "worker failures remain observable");
            }
            check(worker.submit(FeignCircuitBreakerContextChecks::empty).get(5, TimeUnit.SECONDS), "failed work does not leak context");
        } finally {
            clear();
            executor.shutdownNow();
            check(executor.awaitTermination(5, TimeUnit.SECONDS) && executor.isShutdown() && executor.isTerminated(), "context executor shutdown reaches its delegate");
        }
        System.out.println("Batch G Feign circuit breaker context checks passed: " + checks);
    }

    private static boolean empty() {
        return UserContext.getUserId() == null && TenantContext.getTenantId() == null
                && MDC.get(TraceContext.MDC_KEY) == null && RequestContextHolder.getRequestAttributes() == null;
    }

    private static void clear() {
        UserContext.clear();
        TenantContext.clear();
        MDC.clear();
        RequestContextHolder.resetRequestAttributes();
    }

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }

    private record Registration(String name, RequestInterceptor interceptor,
                                Function<ExecutorService, Customizer<Resilience4JCircuitBreakerFactory>> configure) { }

    private record Snapshot(String trace, String tenant, Long userId, String token,
                            Set<String> permissions, boolean noRequest) { }
}
