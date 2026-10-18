package com.cloudflow.auth.storage;

import cn.hutool.extra.spring.SpringUtil;
import com.cloudflow.auth.config.FeignRequestInterceptor;
import com.cloudflow.common.config.ContextTaskDecorator;
import com.cloudflow.common.core.aspect.RequestLogAspect;
import com.cloudflow.common.excel.importing.ImportController;
import com.cloudflow.oa.controller.ErrorReportController;
import com.cloudflow.oa.controller.OaRuleWarningAdvice;
import com.cloudflow.oa.domain.FrontendErrorLog;
import com.cloudflow.common.core.context.TraceContext;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.SafeErrorResponse;
import com.cloudflow.common.core.filter.TraceIdFilter;
import com.cloudflow.common.core.utils.LogSanitizer;
import com.cloudflow.common.log.config.CloudFlowLogProperties;
import com.cloudflow.common.log.domain.SysApiErrorLog;
import com.cloudflow.common.log.domain.SysLogEntity;
import com.cloudflow.common.log.event.ApiErrorLogEvent;
import com.cloudflow.common.log.event.SysLogEvent;
import com.cloudflow.common.log.util.SysLogUtils;
import com.cloudflow.common.log.web.ApiAccessLogInterceptor;
import com.cloudflow.common.log.web.ApiErrorLogResolver;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.gateway.config.ReactorTraceConfiguration;
import com.fasterxml.jackson.databind.ObjectMapper;
import feign.RequestTemplate;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.concurrent.ExecutorService;
import org.slf4j.MDC;
import org.aspectj.lang.annotation.Pointcut;
import org.springframework.aop.aspectj.AspectJExpressionPointcut;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Scheduler;
import reactor.core.scheduler.Schedulers;

import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public class ObservabilityChecks {
    private static int checks;
    private static final String TRACE_A = "a0123456789abcdef0123456789abcdef";
    private static final String TRACE_B = "b0123456789abcdef0123456789abcdef";

    public static void main(String[] arguments) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        check(TraceContext.isValid(TRACE_A), "valid trace accepted");
        check(!TraceContext.isValid("bad\r\nheader"), "header injection rejected");
        check(TraceContext.normalize("short").length() == 32, "bad trace replaced");
        String json = LogSanitizer.json(Map.of("name", "example", "secret_key", "dummy-secret", "nested", Map.of("phone", "13800138000", "value", "110101199001011234")), mapper, 2000);
        check(mapper.readTree(json).isObject(), "sanitized JSON remains valid");
        check(!json.contains("dummy-secret") && !json.contains("13800138000") && !json.contains("110101199001011234"), "nested secrets and personal data masked");
        String text = LogSanitizer.text("access_key=dummy-ak authorization=Bearer dummy-auth token=dummy-token https://files.invalid/a?Signature=dummy-sign&other=value");
        for (String secret : List.of("dummy-ak", "dummy-auth", "dummy-token", "dummy-sign")) check(!text.contains(secret), "plain credential masked " + secret);
        check(!LogSanitizer.text("contact person@example.invalid or 13800138000 bank 6222021234567890123").contains("person@example.invalid"), "free text email masked");
        check(mapper.readTree(LogSanitizer.json(Map.of("value", "长".repeat(1000)), mapper, 256)).isTextual(), "oversize JSON uses valid notice");
        String stack = LogSanitizer.stack(new IllegalStateException("长".repeat(50000)));
        check(stack.getBytes(StandardCharsets.UTF_8).length <= 60000, "stack bounded by UTF-8 bytes");

        MDC.put(TraceContext.MDC_KEY, TRACE_A);
        check(SafeErrorResponse.withTraceId("失败").contains(TRACE_A), "response uses active trace");
        RequestTemplate template = new RequestTemplate();
        template.header(TraceContext.HEADER, TRACE_B);
        new FeignRequestInterceptor("cloudflow-auth").apply(template);
        check(template.headers().get(TraceContext.HEADER).equals(List.of(TRACE_A)), "Feign replaces stale trace without duplicate header");
        MDC.clear();
        pointcutChecks();
        contextChecks();
        requestLifetimeChecks();
        servletChecks();
        captureChecks(mapper);
        reactorChecks();
        System.out.println("Batch G observability checks passed: " + checks);
    }

    private static void pointcutChecks() throws Exception {
        AspectJExpressionPointcut pointcut = new AspectJExpressionPointcut();
        pointcut.setExpression(RequestLogAspect.class.getMethod("controllerLog").getAnnotation(Pointcut.class).value());
        check(pointcut.matches(ImportController.class.getMethod("types"), ImportController.class), "common import controllers capture request parameters outside controller packages");
        check(pointcut.matches(ErrorReportController.class.getMethod("report", FrontendErrorLog.class, HttpServletRequest.class), ErrorReportController.class), "ordinary REST controllers retain request logging");
        check(!pointcut.matches(OaRuleWarningAdvice.class.getMethod("supports", org.springframework.core.MethodParameter.class, Class.class), OaRuleWarningAdvice.class), "response advice is not logged as a separate API controller");
    }

    private static void contextChecks() throws Exception {
        ContextTaskDecorator decorator = new ContextTaskDecorator();
        ExecutorService worker = Executors.newSingleThreadExecutor();
        try {
            UserContext.setUserId(101L);
            UserContext.setTenantId(100000L);
            UserContext.setPermissions(Set.of("system:log:list"));
            TenantContext.setTenantId(100000L);
            MDC.put(TraceContext.MDC_KEY, TRACE_A);
            Runnable first = decorator.decorate(() -> {
                check(TRACE_A.equals(MDC.get(TraceContext.MDC_KEY)), "worker inherits trace");
                check(Long.valueOf(101).equals(UserContext.getUserId()), "worker inherits identity");
                check(UserContext.getPermissions().contains("system:log:list"), "worker inherits permissions");
            });
            MDC.put(TraceContext.MDC_KEY, TRACE_B);
            worker.submit(first).get(5, TimeUnit.SECONDS);
            check(worker.submit(() -> MDC.get(TraceContext.MDC_KEY) == null && UserContext.getUserId() == null && TenantContext.getTenantId() == null).get(), "worker context cleared after success");
            Runnable failed = decorator.decorate(() -> { throw new IllegalStateException("expected"); });
            try { worker.submit(failed).get(); } catch (java.util.concurrent.ExecutionException expected) { checks++; }
            check(worker.submit(() -> MDC.get(TraceContext.MDC_KEY) == null && UserContext.getUserId() == null).get(), "worker cleared after failure");
            TenantContext.setTenantSkip();
            decorator.decorate(() -> {
                MDC.put(TraceContext.MDC_KEY, TRACE_A);
                UserContext.setUserId(999L);
                TenantContext.clear();
            }).run();
            check(TRACE_B.equals(MDC.get(TraceContext.MDC_KEY)) && Long.valueOf(101).equals(UserContext.getUserId()), "CallerRuns restores caller identity and trace");
            check(TenantContext.getTenantSkip(), "CallerRuns restores tenant skip state");
            UserContext.clear(); TenantContext.clear(); MDC.clear();
            worker.submit(decorator.decorate(() -> {
                check(UserContext.getUserId() == null && UserContext.getPermissions().isEmpty(), "anonymous task cannot inherit old user");
                check(TraceContext.isValid(MDC.get(TraceContext.MDC_KEY)), "background task receives trace");
            })).get();
        } finally {
            worker.shutdownNow();
            UserContext.clear(); TenantContext.clear(); MDC.clear();
        }
    }

    private static void requestLifetimeChecks() throws Exception {
        AtomicBoolean recycled = new AtomicBoolean();
        HttpServletRequest request = (HttpServletRequest) Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(), new Class<?>[]{HttpServletRequest.class}, (proxy, method, arguments) -> {
            if (recycled.get()) throw new IllegalStateException("Request already recycled");
            return null;
        });
        ServletRequestAttributes attributes = new ServletRequestAttributes(request);
        ContextTaskDecorator decorator = new ContextTaskDecorator();
        ExecutorService worker = Executors.newSingleThreadExecutor();
        try {
            RequestContextHolder.setRequestAttributes(attributes);
            UserContext.setUserId(102L);
            UserContext.setTenantId(100000L);
            UserContext.setAuthToken("memory-only-auth-token");
            MDC.put(TraceContext.MDC_KEY, TRACE_A);
            Runnable delayed = decorator.decorate(() -> {
                RequestTemplate template = new RequestTemplate();
                new FeignRequestInterceptor("cloudflow-auth").apply(template);
                check(template.headers().get("Authorization").equals(List.of("Bearer memory-only-auth-token")), "delayed Feign calls use the captured token without touching recycled requests");
                check(template.headers().get("X-User-Id").equals(List.of("102")), "delayed Feign calls use the captured user identity");
                check(template.headers().get("X-Tenant-Id").equals(List.of("100000")) && template.headers().get(TraceContext.HEADER).equals(List.of(TRACE_A)), "delayed Feign calls retain tenant and trace isolation");
                check(RequestContextHolder.getRequestAttributes() == null, "worker threads never retain servlet request objects");
            });
            recycled.set(true);
            RequestContextHolder.resetRequestAttributes();
            UserContext.clear();
            MDC.clear();
            worker.submit(delayed).get(5, TimeUnit.SECONDS);
            check(worker.submit(() -> RequestContextHolder.getRequestAttributes() == null && UserContext.getAuthToken() == null).get(), "worker completion clears token and request state");
            RequestContextHolder.setRequestAttributes(attributes);
            decorator.decorate(() -> check(RequestContextHolder.getRequestAttributes() == null, "CallerRuns work also uses detached context")).run();
            check(RequestContextHolder.getRequestAttributes() == attributes, "CallerRuns restores the caller request after detached work");
        } finally {
            worker.shutdownNow();
            RequestContextHolder.resetRequestAttributes();
            UserContext.clear();
            TenantContext.clear();
            MDC.clear();
        }
    }

    private static void servletChecks() throws Exception {
        Map<String, Object> attributes = new HashMap<>();
        Map<String, String> headers = new HashMap<>();
        HttpServletRequest request = request(attributes, TRACE_A);
        HttpServletResponse response = response(headers);
        TraceIdFilter filter = new TraceIdFilter();
        filter.doFilter(request, response, (input, output) -> check(TRACE_A.equals(MDC.get(TraceContext.MDC_KEY)), "servlet trace available during request"));
        check(TRACE_A.equals(headers.get(TraceContext.HEADER)), "servlet echoes trace header");
        check(MDC.get(TraceContext.MDC_KEY) == null, "servlet clears trace after success");
        try { filter.doFilter(request, response, (input, output) -> { throw new ServletException("expected"); }); }
        catch (ServletException expected) { checks++; }
        check(MDC.get(TraceContext.MDC_KEY) == null, "servlet clears trace after exception");
    }

    private static void captureChecks(ObjectMapper mapper) throws Exception {
        try (GenericApplicationContext context = new GenericApplicationContext()) {
            CloudFlowLogProperties properties = new CloudFlowLogProperties();
            properties.setSlowThresholdMs(1);
            context.registerBean(ObjectMapper.class, () -> mapper);
            context.registerBean(CloudFlowLogProperties.class, () -> properties);
            context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("checks", Map.of("spring.application.name", "cloudflow-auth")));
            context.refresh();
            new SpringUtil().setApplicationContext(context);
            Map<String, Object> attributes = new HashMap<>();
            HttpServletRequest request = request(attributes, TRACE_A);
            HttpServletResponse response = response(new HashMap<>());
            RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
            UserContext.setUserId(101L); UserContext.setTenantId(100001L); UserContext.setUserName("operator");
            MDC.put(TraceContext.MDC_KEY, TRACE_A);
            List<Object> events = new ArrayList<>();
            ApiErrorLogResolver resolver = new ApiErrorLogResolver(events::add);
            resolver.resolveException(request, response, null, new IllegalStateException("password=dummy-secret"));
            resolver.resolveException(request, response, null, new IllegalStateException("again"));
            check(events.size() == 1, "handled exception recorded once");
            SysApiErrorLog error = (SysApiErrorLog) ((ApiErrorLogEvent) events.get(0)).getSource();
            check(error.getTenantId().equals(100001L) && error.getUserId().equals(101L), "error captures trusted tenant and identity");
            check(error.getTraceId().equals(TRACE_A), "error linked to request trace");
            check(!error.getExceptionStack().contains("dummy-secret") && !error.getRequestParams().contains("dummy-token"), "error stack and query credentials masked");
            check("TODO".equals(error.getProcessStatus()), "new error defaults pending");
            ApiAccessLogInterceptor access = new ApiAccessLogInterceptor(events::add, properties);
            access.preHandle(request, response, null);
            attributes.put(SysLogUtils.RESULT_CODE, 403);
            Thread.sleep(10);
            access.afterCompletion(request, response, null, null);
            SysLogEntity entry = (SysLogEntity) ((SysLogEvent) events.get(1)).getSource();
            check(entry.getDurationMs() >= 1 && entry.getSlowFlag() == 1, "slow API timing recorded");
            check(entry.getResultCode() == 403 && "9".equals(entry.getLogType()), "business error code recorded");
            check(entry.getTenantId().equals(100001L), "access stays in caller tenant");
        } finally {
            RequestContextHolder.resetRequestAttributes(); UserContext.clear(); TenantContext.clear(); MDC.clear();
        }
    }

    private static void reactorChecks() throws Exception {
        ReactorTraceConfiguration configuration = new ReactorTraceConfiguration();
        configuration.register();
        Scheduler scheduler = Schedulers.newSingle("batch-g-trace");
        try {
            List<Boolean> results = Flux.range(0, 50).flatMap(index -> {
                String expected = index % 2 == 0 ? TRACE_A : TRACE_B;
                return Mono.just(index).publishOn(scheduler).map(value -> expected.equals(MDC.get(TraceContext.MDC_KEY)))
                        .contextWrite(context -> context.put(TraceContext.MDC_KEY, expected));
            }, 8).collectList().block(Duration.ofSeconds(10));
            check(results != null && results.size() == 50 && results.stream().allMatch(Boolean::booleanValue), "50 concurrent Reactor signals preserve their own trace");
            java.util.concurrent.CompletableFuture<String> residue = new java.util.concurrent.CompletableFuture<>();
            scheduler.schedule(() -> residue.complete(MDC.get(TraceContext.MDC_KEY)));
            check(residue.get(5, TimeUnit.SECONDS) == null, "Reactor worker has no trace residue");
        } finally { scheduler.dispose(); configuration.close(); }
    }

    private static HttpServletRequest request(Map<String, Object> attributes, String traceId) {
        return (HttpServletRequest) Proxy.newProxyInstance(ObservabilityChecks.class.getClassLoader(), new Class[]{HttpServletRequest.class}, (proxy, method, arguments) -> switch (method.getName()) {
            case "getAttribute" -> attributes.get(arguments[0]);
            case "setAttribute" -> { attributes.put((String) arguments[0], arguments[1]); yield null; }
            case "removeAttribute" -> attributes.remove(arguments[0]);
            case "getHeader" -> TraceContext.HEADER.equals(arguments[0]) ? traceId : null;
            case "getDispatcherType" -> DispatcherType.REQUEST;
            case "getMethod" -> "GET";
            case "getRequestURI" -> "/checks";
            case "getRemoteAddr" -> "127.0.0.1";
            case "getParameterMap" -> Map.of("token", new String[]{"dummy-token"});
            default -> method.getReturnType() == boolean.class ? false : method.getReturnType() == int.class ? 0 : null;
        });
    }

    private static HttpServletResponse response(Map<String, String> headers) {
        return (HttpServletResponse) Proxy.newProxyInstance(ObservabilityChecks.class.getClassLoader(), new Class[]{HttpServletResponse.class}, (proxy, method, arguments) -> switch (method.getName()) {
            case "setHeader" -> { headers.put((String) arguments[0], (String) arguments[1]); yield null; }
            case "getStatus" -> 200;
            default -> method.getReturnType() == boolean.class ? false : method.getReturnType() == int.class ? 0 : null;
        });
    }

    private static synchronized void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }
}
