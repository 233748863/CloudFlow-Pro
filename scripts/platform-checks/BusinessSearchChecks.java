package com.cloudflow.search.checks;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cloudflow.auth.config.BusinessSearchConfiguration;
import com.cloudflow.auth.controller.BusinessSearchController;
import com.cloudflow.auth.service.search.BusinessSearchFeignConfiguration;
import com.cloudflow.auth.service.search.BusinessSearchService;
import com.cloudflow.common.config.ContextAwareExecutorService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.GlobalExceptionHandler;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.search.BusinessSearchGroup;
import com.cloudflow.common.core.search.BusinessSearchHit;
import com.cloudflow.common.core.search.BusinessSearchQuery;
import com.cloudflow.common.core.search.BusinessSearchResponse;
import com.cloudflow.common.core.search.BusinessSearchRow;
import com.cloudflow.common.core.search.BusinessSearchType;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.aspectj.RateLimiterAspect;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.search.BusinessSearchAccess;
import com.cloudflow.crm.controller.CrmBusinessSearchController;
import com.cloudflow.hr.controller.HrBusinessSearchController;
import com.cloudflow.hr.service.HrEmployeeReadScope;
import com.cloudflow.oa.controller.OaBusinessSearchController;
import com.cloudflow.workflow.controller.WorkflowBusinessSearchController;
import feign.Feign;
import feign.Request;
import feign.Retryer;
import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.http.ResponseEntity;
import org.springframework.web.method.annotation.ExceptionHandlerMethodResolver;

public final class BusinessSearchChecks {
    private static int checks;
    private static final Set<String> DENIED = ConcurrentHashMap.newKeySet();
    private static final AtomicInteger PERMISSION_READS = new AtomicInteger();

    public static void main(String[] arguments) throws Exception {
        StpLogic previous = StpUtil.getStpLogic();
        StpUtil.setStpLogic(new StpLogic("business-search-unit") {
            @Override public boolean hasPermission(String permission) { return !DENIED.contains(permission); }
            @Override public List<String> getPermissionList() {
                PERMISSION_READS.incrementAndGet();
                return Arrays.stream(BusinessSearchType.values()).flatMap(type -> type.permissions().stream())
                        .distinct().filter(permission -> !DENIED.contains(permission)).toList();
            }
            @Override public void checkPermission(String permission) {
                if (!hasPermission(permission)) throw new IllegalArgumentException("permission denied");
            }
        });
        try {
            identity(100000L, 5L);
            keywords(); results(); employeeScopes(); permissionSnapshots(); endpoints(); exceptionResponses(); timeouts(); aggregation(); contexts();
            System.out.println("BUSINESS_SEARCH_RULES: checks=" + checks + "; failed=0; client_doubles=true; mysql=false; http=false");
        } finally { DENIED.clear(); StpUtil.setStpLogic(previous); UserContext.clear(); }
    }

    private static void keywords() {
        for (String keyword : List.of("客户", " AB ", "😀😀", "字".repeat(64), "😀".repeat(64), "x' OR '1'='1")) {
            equal(keyword.strip(), new BusinessSearchQuery(keyword, 5).keyword(), "Unicode keyword accepted");
        }
        for (String keyword : List.of("", " ", "字", "😀", "字".repeat(65), "😀".repeat(65), "\ud800字", "\udfff字", "甲\n乙", "甲\u0085乙", "甲\u0000乙")) {
            rejectsQuery(() -> new BusinessSearchQuery(keyword, 5), "invalid keyword rejected");
        }
        rejectsQuery(() -> new BusinessSearchQuery(null, 5), "null keyword rejected");
        for (int limit : List.of(-1, 0, 11, Integer.MAX_VALUE)) rejectsQuery(() -> new BusinessSearchQuery("客户", limit), "invalid limit rejected");
        equal("%!!!_%", new BusinessSearchQuery("!_", 1).pattern(), "escape ordering stays stable");
        equal("%!!!%!_%", new BusinessSearchQuery("!%_", 10).pattern(), "LIKE wildcard characters are escaped");
        equal("%x' OR '1'='1%", new BusinessSearchQuery("x' OR '1'='1", 5).pattern(), "SQL-looking input remains parameter data");
    }

    private static void results() {
        for (BusinessSearchType type : BusinessSearchType.values()) {
            for (String identifier : List.of("", "//evil.test", "../1", "1?next=evil", "1#payload", "https://evil.test", "1\n")) {
                rejects(() -> type.route(identifier), "unsafe result route rejected");
            }
            BusinessSearchRow row = row("123", "真实标题");
            BusinessSearchGroup group = BusinessSearchGroup.available(type, List.of(row, row("124", "第二条")), 1);
            equal(1, group.items().size(), "result limit is exact");
            check(group.hasMore(), "extra row reports hasMore");
            equal(type.route("123"), group.items().get(0).route(), "fixed route");
            rejects(() -> group.items().clear(), "result snapshot immutable");
        }
        equal("未命名记录", BusinessSearchHit.from(BusinessSearchType.CUSTOMER, row("123", " ")).title(), "blank titles have explicit fallback");
        rejects(() -> new BusinessSearchHit(BusinessSearchType.CUSTOMER, "123", "客户", null, null, "//evil.test"), "remote URL cannot override route");
        rejects(() -> new BusinessSearchGroup(BusinessSearchType.CUSTOMER, BusinessSearchGroup.State.FORBIDDEN,
                List.of(BusinessSearchHit.from(BusinessSearchType.CUSTOMER, row("123", "客户"))), false), "forbidden group cannot carry records");
        rejects(() -> new BusinessSearchGroup(BusinessSearchType.CUSTOMER, BusinessSearchGroup.State.UNAVAILABLE, List.of(), true), "unavailable group cannot report more records");
        equal(BusinessSearchGroup.State.AVAILABLE, BusinessSearchGroup.available(BusinessSearchType.CUSTOMER, List.of(), 5).state(), "legitimate empty is available");
    }

    private static void employeeScopes() {
        for (Integer scopeType : Arrays.asList(null, 0)) check(HrEmployeeReadScope.from(false, scopeType, 5L, "employee", List.of(100L)).all(), "existing unrestricted HR scope retained");
        check(HrEmployeeReadScope.from(true, 4, 5L, "employee", List.of()).all(), "existing privileged scope retained");
        HrEmployeeReadScope own = HrEmployeeReadScope.from(false, 4, 5L, "employee", List.of(100L));
        equal(5L, own.userId(), "own-user scope overrides department");
        QueryWrapper<Object> wrapper = new QueryWrapper<>();
        own.restrict(wrapper);
        check(wrapper.getSqlSegment().contains("user_id") && wrapper.getParamNameValuePairs().containsValue(5L), "normal employee read uses same scope");
        List<Long> departments = new ArrayList<>(List.of(100L, 101L));
        HrEmployeeReadScope departmentScope = HrEmployeeReadScope.from(false, 2, 5L, "employee", departments);
        departments.clear();
        equal(List.of(100L, 101L), departmentScope.departmentIds(), "department scope copied");
        equal("employee", HrEmployeeReadScope.from(false, 2, 5L, "employee", List.of()).creator(), "existing creator fallback retained");
    }

    private static void permissionSnapshots() {
        StpLogic previous = StpUtil.getStpLogic();
        List<String> permissions = new ArrayList<>();
        StpUtil.setStpLogic(new StpLogic("business-search-permission-projection") {
            @Override public List<String> getPermissionList() { return List.copyOf(permissions); }
        });
        try {
            permissions.add("*");
            equal(6, BusinessSearchAccess.allowedTypes().size(), "permission projection preserves the official full wildcard");
            permissions.clear(); permissions.add("oa:*");
            equal(Set.of(BusinessSearchType.CONTRACT, BusinessSearchType.ASSET), BusinessSearchAccess.allowedTypes(), "module wildcard cannot authorize other modules");
            permissions.clear(); permissions.add("hr:employees:list");
            check(BusinessSearchAccess.allowedTypes().isEmpty(), "employee list permission alone does not authorize detail search");
            permissions.add("hr:employees:view");
            Set<BusinessSearchType> snapshot = BusinessSearchAccess.allowedTypes();
            equal(Set.of(BusinessSearchType.EMPLOYEE), snapshot, "employee search requires both original read permissions");
            permissions.clear();
            equal(Set.of(BusinessSearchType.EMPLOYEE), snapshot, "a completed permission snapshot stays immutable");
            check(BusinessSearchAccess.allowedTypes().isEmpty(), "the next phase reads current permissions rather than reusing the previous snapshot");
            rejects(snapshot::clear, "callers cannot widen the permission snapshot");
        } finally { StpUtil.setStpLogic(previous); }
    }

    private static void endpoints() throws Exception {
        for (Class<?> controller : List.of(BusinessSearchController.class, CrmBusinessSearchController.class, OaBusinessSearchController.class,
                HrBusinessSearchController.class, WorkflowBusinessSearchController.class)) {
            Method search = controller.getMethod("search", String.class, int.class);
            equal(List.of("system:search:business"), List.of(search.getAnnotation(SaCheckPermission.class).value()), "search permission required");
            RateLimiter rate = search.getAnnotation(RateLimiter.class);
            equal(60, rate.time(), "one minute rate window"); equal(30, rate.count(), "thirty requests per window");
            equal(LimitType.USER, rate.limitType(), "limits are per internal user");
            if (controller != BusinessSearchController.class) {
                Inner inner = search.getAnnotation(Inner.class);
                if (inner == null) inner = controller.getAnnotation(Inner.class);
                check(inner != null, "internal endpoint has service credential guard");
                equal(List.of("cloudflow-auth"), List.of(inner.allowedServices()), "only auth can aggregate");
            }
        }
    }

    private static void exceptionResponses() throws Exception {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();
        ExceptionHandlerMethodResolver resolver = new ExceptionHandlerMethodResolver(GlobalExceptionHandler.class);
        Method limitHandler = resolver.resolveMethodByExceptionType(RateLimiterAspect.RateLimitException.class);
        equal("handleRuntimeException", limitHandler.getName(), "Spring selects the runtime handler for internal rate limits");
        for (String path : List.of("/inner/crm/search", "/portal/search")) {
            HttpServletRequest request = exceptionRequest(path);
            for (Method entry : List.of(limitHandler,
                    GlobalExceptionHandler.class.getMethod("handleException", Exception.class, HttpServletRequest.class),
                    GlobalExceptionHandler.class.getMethod("handleRateLimitThrowable", Throwable.class, HttpServletRequest.class))) {
                ResponseEntity<?> limited = (ResponseEntity<?>) entry.invoke(handler, new RateLimiterAspect.RateLimitException("查询过于频繁"), request);
                equal(429, limited.getStatusCode().value(), "rate limit keeps HTTP 429 for " + path + " via " + entry.getName());
                check(limited.getBody() instanceof R<?> body && body.getCode() == 429 && body.getData() == null, "rate limit keeps failure code and no data");
                equal("1", limited.getHeaders().getFirst("Retry-After"), "rate limit carries retry guidance");
                String expectedMessage = path.startsWith("/portal/") ? "请求过于频繁，请稍后重试" : "查询过于频繁";
                check(limited.getBody() instanceof R<?> body && expectedMessage.equals(body.getMsg()), "sensitive rate limit message remains sanitized");
            }
        }
        Method queryHandler = resolver.resolveMethodByExceptionType(ServiceException.class);
        equal("handleServiceException", queryHandler.getName(), "Spring selects explicit query validation handling");
        ResponseEntity<?> invalid = (ResponseEntity<?>) queryHandler.invoke(handler, new ServiceException("关键词无效", 400), exceptionRequest("/inner/crm/search"));
        equal(400, invalid.getStatusCode().value(), "query validation keeps HTTP 400");
        check(invalid.getBody() instanceof R<?> body && body.getCode() == 400 && body.getData() == null, "query validation keeps failure code and no data");
    }

    private static HttpServletRequest exceptionRequest(String path) {
        return (HttpServletRequest) Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, (Object proxy, Method method, Object[] arguments) -> switch (method.getName()) {
                    case "getRequestURI", "getServletPath" -> path;
                    case "getContextPath" -> "";
                    case "getMethod" -> "GET";
                    default -> null;
                });
    }

    private static void timeouts() {
        BusinessSearchFeignConfiguration configuration = new BusinessSearchFeignConfiguration();
        ObservedBuilder builder = new ObservedBuilder();
        builder.options(new Request.Options(10000, TimeUnit.MILLISECONDS, 10000, TimeUnit.MILLISECONDS, true));
        configuration.businessSearchDeadline().customize(builder);
        equal(2000, builder.options.connectTimeoutMillis(), "global Feign properties cannot lengthen connect timeout");
        equal(2000, builder.options.readTimeoutMillis(), "global Feign properties cannot lengthen read timeout");
        check(!builder.options.isFollowRedirects(), "internal service redirects are rejected");
        check(builder.retryer == Retryer.NEVER_RETRY, "search never retries remote calls");
    }

    private static void aggregation() throws Exception {
        ExecutorService executor = new BusinessSearchConfiguration().businessSearchExecutor();
        try {
            Fixture fixture = new Fixture(executor);
            int permissionsBefore = PERMISSION_READS.get();
            BusinessSearchResponse response = fixture.service.search(new BusinessSearchQuery("客户", 5));
            equal(2, PERMISSION_READS.get() - permissionsBefore, "aggregation reads one fresh permission list before and after remote work");
            equal(6, response.groups().size(), "all six groups returned");
            check(response.groups().stream().allMatch(group -> group.state() == BusinessSearchGroup.State.AVAILABLE), "six modules return actual empty results");
            equal(4, fixture.calls.size(), "four fixed services only");
            DENIED.add("hr:employees:view"); fixture.calls.clear();
            response = fixture.service.search(new BusinessSearchQuery("客户", 5));
            equal(BusinessSearchGroup.State.FORBIDDEN, group(response, BusinessSearchType.EMPLOYEE).state(), "employee detail permission is mandatory");
            check(!fixture.calls.containsKey("hr"), "unauthorized module is never queried");
            DENIED.clear();
            DENIED.add("system:search:business"); fixture.calls.clear();
            rejects(() -> fixture.service.search(new BusinessSearchQuery("客户", 5)), "overall permission required");
            check(fixture.calls.isEmpty(), "denial occurs before remote work"); DENIED.clear();
            UserContext.setUserId(null);
            rejects(() -> fixture.service.search(new BusinessSearchQuery("客户", 5)), "missing identity rejected"); identity(100000L, 5L);
            fixture.failure = "crm";
            response = fixture.service.search(new BusinessSearchQuery("客户", 5));
            equal(BusinessSearchGroup.State.UNAVAILABLE, group(response, BusinessSearchType.CUSTOMER).state(), "failed module not empty success");
            equal(BusinessSearchGroup.State.AVAILABLE, group(response, BusinessSearchType.ASSET).state(), "other module unaffected");
            fixture.failure = null; fixture.incomplete = true;
            response = fixture.service.search(new BusinessSearchQuery("客户", 5));
            equal(BusinessSearchGroup.State.UNAVAILABLE, group(response, BusinessSearchType.TICKET).state(), "incomplete group response rejected");
            fixture.incomplete = false; fixture.revoke = true;
            response = fixture.service.search(new BusinessSearchQuery("客户", 5));
            equal(BusinessSearchGroup.State.FORBIDDEN, group(response, BusinessSearchType.EMPLOYEE).state(), "permission rechecked after remote completion");
            fixture.revoke = false; DENIED.clear(); fixture.slow = true;
            long start = System.nanoTime();
            response = fixture.service.search(new BusinessSearchQuery("客户", 5));
            long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
            check(elapsed >= 1700 && elapsed < 3500, "shared two-second deadline, actual milliseconds=" + elapsed);
            equal(BusinessSearchGroup.State.UNAVAILABLE, group(response, BusinessSearchType.CUSTOMER).state(), "slow service marked unavailable");
            equal(BusinessSearchGroup.State.AVAILABLE, group(response, BusinessSearchType.ASSET).state(), "completed module retained after deadline");
            check(fixture.interrupted.await(1, TimeUnit.SECONDS), "timed-out work is cancelled");
            System.out.println("BUSINESS_SEARCH_SHARED_DEADLINE_MS=" + elapsed);
        } finally { executor.shutdownNow(); executor.awaitTermination(5, TimeUnit.SECONDS); }
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService saturated = new ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS, new ArrayBlockingQueue<>(1));
        Runnable hold = () -> { try { release.await(); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); } };
        try {
            saturated.submit(hold); saturated.submit(hold);
            BusinessSearchResponse response = new Fixture(saturated).service.search(new BusinessSearchQuery("客户", 5));
            check(response.groups().stream().allMatch(group -> group.state() == BusinessSearchGroup.State.UNAVAILABLE), "full executor fails closed without fallback query");
        } finally { release.countDown(); saturated.shutdownNow(); saturated.awaitTermination(5, TimeUnit.SECONDS); }
    }

    private static void contexts() throws Exception {
        ExecutorService raw = Executors.newSingleThreadExecutor();
        ExecutorService decorated = new ContextAwareExecutorService(raw);
        try {
            for (long tenantId : List.of(100000L, 200000L)) {
                identity(tenantId, tenantId + 5);
                Identity captured = decorated.submit(BusinessSearchChecks::snapshot).get(3, TimeUnit.SECONDS);
                equal(snapshot(), captured, "worker inherits current identity and bearer only");
                Identity after = raw.submit(BusinessSearchChecks::snapshot).get(3, TimeUnit.SECONDS);
                equal(new Identity(null, null, null), after, "reused worker has no previous identity");
            }
        } finally { decorated.shutdownNow(); decorated.awaitTermination(5, TimeUnit.SECONDS); identity(100000L, 5L); }
    }

    private static BusinessSearchGroup group(BusinessSearchResponse response, BusinessSearchType type) { return response.groups().stream().filter(group -> group.type() == type).findFirst().orElseThrow(); }
    private static BusinessSearchRow row(String identifier, String title) { BusinessSearchRow row = new BusinessSearchRow(); row.setId(identifier); row.setTitle(title); return row; }
    private static void identity(Long tenantId, Long userId) { UserContext.setTenantId(tenantId); UserContext.setUserId(userId); UserContext.setAuthToken("internal-unit-session"); }
    private static Identity snapshot() { return new Identity(UserContext.getTenantId(), UserContext.getUserId(), UserContext.getAuthToken()); }
    private record Identity(Long tenantId, Long userId, String token) { }
    private static void check(boolean condition, String label) { if (!condition) throw new AssertionError(label); checks++; }
    private static void equal(Object expected, Object actual, String label) { check(Objects.equals(expected, actual), label + "; expected=" + expected + "; actual=" + actual); }
    private static void rejects(Runnable operation, String label) {
        try { operation.run(); } catch (RuntimeException expected) { checks++; return; }
        throw new AssertionError(label);
    }
    private static void rejectsQuery(Runnable operation, String label) {
        try { operation.run(); } catch (ServiceException invalid) { equal(400, invalid.getCode(), label + "; HTTP validation status"); return; }
        throw new AssertionError(label);
    }

    private static final class ObservedBuilder extends Feign.Builder {
        private Request.Options options;
        private Retryer retryer;
        @Override public Feign.Builder options(Request.Options value) { options = value; return super.options(value); }
        @Override public Feign.Builder retryer(Retryer value) { retryer = value; return super.retryer(value); }
    }

    private static final class Fixture {
        private final Map<String, AtomicInteger> calls = new ConcurrentHashMap<>();
        private final CountDownLatch interrupted = new CountDownLatch(1);
        private final BusinessSearchService service;
        private volatile String failure;
        private volatile boolean incomplete;
        private volatile boolean revoke;
        private volatile boolean slow;

        private Fixture(ExecutorService executor) {
            service = new BusinessSearchService((keyword, limit) -> invoke("crm", keyword, limit), (keyword, limit) -> invoke("oa", keyword, limit),
                    (keyword, limit) -> invoke("hr", keyword, limit), (keyword, limit) -> invoke("workflow", keyword, limit), executor);
        }

        private R<List<BusinessSearchGroup>> invoke(String module, String keyword, int limit) {
            if (!Objects.equals(UserContext.getUserId(), 5L) || !Objects.equals(UserContext.getTenantId(), 100000L)
                    || !"internal-unit-session".equals(UserContext.getAuthToken()) || !"客户".equals(keyword) || limit != 5) throw new AssertionError("remote context mismatch");
            calls.computeIfAbsent(module, unused -> new AtomicInteger()).incrementAndGet();
            if (module.equals(failure)) throw new IllegalStateException("remote failure");
            if ("crm".equals(module) && incomplete) return R.ok(List.of());
            if ("hr".equals(module) && revoke) DENIED.add("hr:employees:view");
            if ("crm".equals(module) && slow) {
                try { Thread.sleep(10000); } catch (InterruptedException cancelled) { interrupted.countDown(); Thread.currentThread().interrupt(); }
            }
            return R.ok(Arrays.stream(BusinessSearchType.values()).filter(type -> module.equals(type.module()))
                    .map(type -> BusinessSearchGroup.available(type, List.of(), limit)).toList());
        }
    }
}
