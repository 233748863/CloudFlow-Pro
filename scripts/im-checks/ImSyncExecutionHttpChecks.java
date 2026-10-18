package com.cloudflow.auth.im;

import cn.dev33.satoken.SaManager;
import cn.dev33.satoken.context.SaTokenContext;
import cn.dev33.satoken.interceptor.SaInterceptor;
import cn.dev33.satoken.spring.SaTokenContextForSpringInJakartaServlet;
import cn.dev33.satoken.stp.StpInterface;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.auth.controller.system.ImSyncController;
import com.cloudflow.auth.controller.system.ImSyncExecutionController;
import com.cloudflow.auth.job.ImSyncRecoveryJob;
import com.cloudflow.auth.oauth2.OAuthProperties;
import com.cloudflow.auth.platform.PlatformAccessProperties;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.GlobalExceptionHandler;
import com.cloudflow.common.idempotent.aspectj.RepeatSubmitAspect;
import com.cloudflow.common.idempotent.config.IdempotentProperties;
import com.cloudflow.common.job.aspect.DistributedJobAspect;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.ratelimiter.aspectj.RateLimiterAspect;
import com.cloudflow.common.ratelimiter.config.RateLimiterAutoConfiguration;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import jakarta.servlet.Filter;
import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.WriteListener;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletResponseWrapper;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.PrintWriter;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BiFunction;
import java.util.function.Consumer;
import org.apache.catalina.Context;
import org.apache.catalina.Wrapper;
import org.apache.catalina.startup.Tomcat;
import org.apache.tomcat.util.descriptor.web.FilterDef;
import org.apache.tomcat.util.descriptor.web.FilterMap;
import org.springframework.aop.support.AopUtils;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.DispatcherServlet;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

public final class ImSyncExecutionHttpChecks {
    private static final long TENANT = 100000;
    private static final long OTHER = 990100;
    private static final long OTHER_ADMIN = 990101;
    private static final long RATE_ADMIN = 990110;
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private static ImSyncExecutionHttpChecks active;
    private final JdbcTemplate jdbc;
    private final ImDatabase database;
    private final ImSyncService sync;
    private final ImSyncRunner runner;
    private final ImOrgSnapshotCodec codec;
    private final ImSyncEffectsDatabaseChecks.Runtime runtime;
    private final BiFunction<Long, Long, String> login;
    private final Consumer<String> bindToken;
    private final long configId;
    private final long admin;
    private final long employee;
    private final AtomicInteger remoteCalls = new AtomicInteger();
    private final AtomicInteger tokenCalls = new AtomicInteger();
    private final AtomicBoolean loseResponse = new AtomicBoolean();
    private final CountDownLatch committed = new CountDownLatch(1);
    private final CountDownLatch releaseResponse = new CountDownLatch(1);
    private int assertions;
    private int requests;
    private URI origin;
    private ImSyncJobPlatformChecks jobs;

    ImSyncExecutionHttpChecks(JdbcTemplate jdbc, ImDatabase database, ImActors actors,
            ImConfigRules rules, ImProperties properties, SysAuditLogMapper audits, ImSyncRunner runner, ImOrgSnapshotCodec codec,
            ImSyncEffectsDatabaseChecks.Runtime runtime, BiFunction<Long, Long, String> login, Consumer<String> bindToken,
            HttpServer vendor, long configId, long admin, long employee) {
        this.jdbc = jdbc; this.database = database; this.runner = runner; this.codec = codec;
        this.runtime = runtime; this.login = login; this.bindToken = bindToken; this.configId = configId; this.admin = admin; this.employee = employee;
        URI local = URI.create("http://127.0.0.1:" + vendor.getAddress().getPort());
        WeComHttp http = new WeComHttp(WeComHttp.directClient(), official -> {
            check(!TransactionSynchronizationManager.isActualTransactionActive(), "vendor read outside write transaction");
            remoteCalls.incrementAndGet();
            return local.resolve(official.getRawPath() + "?" + official.getRawQuery());
        }, Duration.ofSeconds(5));
        ImAccessTokens tokens = new ImAccessTokens(runtime.strings(), runtime.locks(), new ImSecretCipher(properties));
        WeComOrgProvider provider = new WeComOrgProvider(properties, tokens, http);
        sync = new ImSyncService(actors, database, rules, provider,
                new ImLocalOrganizationReader(new PlatformAccessProperties(), new OAuthProperties()), new ImSyncPlanner(), codec, audits, properties);
        vendor.removeContext("/cgi-bin/gettoken");
        vendor.createContext("/cgi-bin/gettoken", exchange -> {
            tokenCalls.incrementAndGet();
            respond(exchange, "{\"access_token\":\"execute-private-access-token\",\"expires_in\":7200}");
        });
        vendor.createContext("/cgi-bin/agent/get", exchange -> respond(exchange,
                "{\"errcode\":0,\"agentid\":77,\"close\":0,\"allow_partys\":{\"partyid\":[2]}}"));
        vendor.createContext("/cgi-bin/department/list", exchange -> respond(exchange,
                "{\"errcode\":0,\"department\":[{\"id\":1,\"parentid\":0,\"name\":\"远端根\",\"order\":0},{\"id\":2,\"parentid\":1,\"name\":\"执行部门\",\"order\":0}]}"));
        String members = members();
        vendor.createContext("/cgi-bin/user/list", exchange -> respond(exchange, members));
        vendor.createContext("/cgi-bin/user/get", exchange -> respond(exchange, "{\"errcode\":60111}"));
    }

    @Configuration(proxyBeanMethods = false)
    @EnableWebMvc
    @EnableAspectJAutoProxy(proxyTargetClass = true)
    public static class WebConfiguration implements WebMvcConfigurer {
        @Bean public ImSyncController syncController() { return new ImSyncController(active.sync); }
        @Bean public ImSyncExecutionController executionController() { return new ImSyncExecutionController(active.runner); }
        @Bean public ImSyncRecoveryJob recoveryJob() { return new ImSyncRecoveryJob(active.runner); }
        @Bean public DistributedJobAspect distributedJobAspect() { return new DistributedJobAspect(active.runtime.locks()); }
        @Bean public GlobalExceptionHandler errors() { return new GlobalExceptionHandler(); }
        @Bean public RedisCache redisCache() { return active.runtime.redis(); }
        @Bean public RedisTemplate<String, Object> redisTemplate() { return active.runtime.redis().redisTemplate; }
        @Bean public SysConfigHelper configHelper() { return new SysConfigHelper(); }
        @Bean public RateLimiterAspect limiter() {
            return new RateLimiterAspect(active.runtime.strings(), new RateLimiterAutoConfiguration().rateLimiterScript());
        }
        @Bean public RepeatSubmitAspect repeated(SysConfigHelper helper) {
            return new RepeatSubmitAspect(active.runtime.strings(), JSON, helper, new IdempotentProperties());
        }
        @Override public void addInterceptors(InterceptorRegistry registry) { registry.addInterceptor(new SaInterceptor()); }
    }

    void run() throws Exception {
        active = this;
        SaTokenContext previousContext = SaManager.getSaTokenContext();
        StpInterface previousPermissions = SaManager.getStpInterface();
        SaManager.setSaTokenContext(new SaTokenContextForSpringInJakartaServlet());
        SaManager.setStpInterface(new StpInterface() {
            @Override public List<String> getPermissionList(Object loginId, String loginType) {
                Object details = StpUtil.getSessionByLoginId(loginId).get(TokenService.LOGIN_USER_SESSION_KEY);
                if (!(details instanceof Map<?, ?> values)) return List.of();
                long tenant = Long.parseLong(String.valueOf(values.get("tenantId")));
                long userId = Long.parseLong(String.valueOf(loginId));
                return database.read(tenant, mapper -> mapper.permissions(tenant, userId)).stream()
                        .flatMap(value -> Arrays.stream(value.split(","))).map(String::trim).filter(value -> !value.isBlank()).toList();
            }
            @Override public List<String> getRoleList(Object loginId, String loginType) { return List.of(); }
        });
        Path temporary = Path.of(System.getProperty("java.io.tmpdir")).toRealPath();
        check(!temporary.getRoot().toString().equalsIgnoreCase(System.getenv("SystemDrive") + "\\"), "data drive required");
        Path directory = Files.createTempDirectory(temporary, "g4-im-execute-http-");
        AnnotationConfigWebApplicationContext web = new AnnotationConfigWebApplicationContext();
        web.register(WebConfiguration.class);
        Tomcat server = new Tomcat();
        server.setBaseDir(directory.resolve("tomcat").toString()); server.setPort(0);
        server.getConnector().setProperty("address", "127.0.0.1");
        Context context = server.addContext("", directory.toString());
        context.setParentClassLoader(getClass().getClassLoader());
        Filter identity = (request, response, chain) -> {
            String token = ((HttpServletRequest) request).getHeader(SaManager.getConfig().getTokenName());
            bindToken.accept(token);
            try {
                Object userId = token == null ? null : StpUtil.getLoginIdByToken(token);
                if (userId != null) {
                    Object details = StpUtil.getSessionByLoginId(userId).get(TokenService.LOGIN_USER_SESSION_KEY);
                    if (details instanceof Map<?, ?> values) {
                        UserContext.setUserId(Long.valueOf(String.valueOf(userId)));
                        UserContext.setTenantId(Long.valueOf(String.valueOf(values.get("tenantId"))));
                        TenantContext.setTenantId(UserContext.getTenantId());
                    }
                }
                if (((HttpServletRequest) request).getRequestURI().endsWith("/apply") && loseResponse.compareAndSet(true, false)) {
                    chain.doFilter(request, new HeldResponse((HttpServletResponse) response));
                    committed.countDown();
                    try { check(releaseResponse.await(30, TimeUnit.SECONDS), "lost response released"); }
                    catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new IOException("Interrupted response fixture", failure); }
                } else chain.doFilter(request, response);
            } finally { bindToken.accept(null); TenantContext.clear(); UserContext.clear(); }
        };
        FilterDef definition = new FilterDef(); definition.setFilterName("owned-execution-identity"); definition.setFilter(identity); context.addFilterDef(definition);
        FilterMap mapping = new FilterMap(); mapping.setFilterName(definition.getFilterName()); mapping.addURLPattern("/*"); context.addFilterMap(mapping);
        Wrapper servlet = Tomcat.addServlet(context, "im-execution", new DispatcherServlet(web));
        servlet.setLoadOnStartup(1); context.addServletMappingDecoded("/", "im-execution");
        try {
            server.start(); origin = URI.create("http://127.0.0.1:" + server.getConnector().getLocalPort());
            check(AopUtils.isAopProxy(web.getBean(ImSyncExecutionController.class)), "production execution controller is advised");
            try (ImSyncJobPlatformChecks platform = new ImSyncJobPlatformChecks(web, runtime)) {
                jobs = platform;
                completeExecution();
                platform.summary();
            }
            System.out.println("G4_IM_SYNC_EXECUTION_HTTP: assertions=" + assertions + "; failed=0; requests=" + requests
                    + "; real_mysql=true; real_redis=true; real_satoken=true; real_spring_controllers=true; real_redis_aspects=true; real_vendor_adapter=true; vendor_service=false; business_results_mocked=false; response_loss=true; production_modified=false");
        } finally {
            releaseResponse.countDown();
            try { server.stop(); }
            finally { server.destroy(); web.close(); SaManager.setSaTokenContext(previousContext); SaManager.setStpInterface(previousPermissions); active = null; }
        }
    }

    private void completeExecution() throws Exception {
        jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (990101,1784,990100),(990101,1785,990100)");
        jdbc.update("INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name,password,status,deleted,pwd_reset_required) SELECT ?,100000,'g4-rate-admin','限流检查管理员',password,'0',0,'0' FROM sys_user WHERE user_id=?", RATE_ADMIN, admin);
        jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES (?,1,100000)", RATE_ADMIN);
        String adminToken = login.apply(admin, TENANT);
        String employeeToken = login.apply(employee, TENANT);
        String otherToken = login.apply(OTHER_ADMIN, OTHER);
        long started = System.nanoTime();
        JsonNode preview = preview(adminToken);
        long runId = preview.path("header").path("syncRunId").asLong();
        check(preview.path("summary").path("usersCreated").asLong() == 1000, "thousand real new users planned");
        String path = "/system/im/sync/" + runId + "/apply";
        int version = preview.path("header").path("configVersion").asInt();
        String hash = preview.path("hash").asText();
        String body = body(version, hash);
        long initialUsers = count("SELECT COUNT(*) FROM sys_user");
        for (String invalid : List.of("{}", "{\"version\":-1,\"hash\":\"" + hash + "\"}", body(version, "F".repeat(64)),
                body(version, "0".repeat(63)), body.substring(0, body.length() - 1) + ",\"unexpected\":true}")) {
            request("POST", path, invalid, adminToken, 400);
        }
        request("POST", path, body, null, 401);
        request("POST", path, body, employeeToken, 403);
        jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (5,1784,100000)");
        try { request("POST", path, body, employeeToken, 403); }
        finally { jdbc.update("DELETE FROM sys_role_menu WHERE role_id=5 AND menu_id=1784 AND tenant_id=100000"); }
        request("POST", path, body, otherToken, 404);
        request("POST", path, body(version + 1, hash), adminToken, 409);
        String wrongHash = body(version, "0".repeat(64));
        request("POST", path, wrongHash, adminToken, 409);
        JsonNode repeated = request("POST", path, wrongHash, adminToken, 409);
        check(repeated.path("msg").asText().contains("重复"), "real duplicate-submit rejection");
        check(count("SELECT COUNT(*) FROM sys_user") == initialUsers, "all denied requests leave users unchanged");
        check(count("SELECT COUNT(*) FROM sys_im_sync_run WHERE mode='APPLY'") == 0, "denied requests never authorize execution");
        JsonNode applied = request("POST", path, body, adminToken, 200).path("data");
        System.out.println("G4_IM_SYNC_EXECUTION_FIRST_BATCH: elapsed_ms=" + Duration.ofNanos(System.nanoTime() - started).toMillis());
        check(applied.path("runId").asLong() == runId && applied.path("status").asText().equals("RUNNING"), "HTTP starts durable multi-batch execution");
        check(state(runId).confirmedBy() == admin, "encrypted checkpoint records actual confirming administrator");
        StpUtil.logoutByTokenValue(adminToken);
        request("GET", "/system/im/sync/" + runId, null, adminToken, 401);
        bindToken.accept(null); TenantContext.clear(); UserContext.clear();
        long beforeLockConflict = state(runId).summary().processed();
        jobs.lockHeld();
        check(state(runId).summary().processed() == beforeLockConflict, "platform lock conflict cannot advance organization batch");
        JobResult sweep;
        do {
            sweep = jobs.recover(true);
            System.out.println("G4_IM_SYNC_EXECUTION_SWEEP: status=" + sweep.getExecuteStatus() + "; affected=" + sweep.getAffectedRows()
                    + "; result=" + sweep.getResultMsg() + "; processed=" + state(runId).summary().processed()
                    + "; elapsed_ms=" + Duration.ofNanos(System.nanoTime() - started).toMillis());
            check("SUCCESS".equals(sweep.getExecuteStatus()) && sweep.getResultMsg().startsWith("已检查=1；"), "background progresses without original session");
        } while (!state(runId).finished() && Duration.ofNanos(System.nanoTime() - started).toMillis() < 300000);
        check(Integer.valueOf(1).equals(sweep.getAffectedRows()) && state(runId).finished(), "background completes within performance budget");
        long elapsed = Duration.ofNanos(System.nanoTime() - started).toMillis();
        ImSyncApplication completed = state(runId);
        check(completed.finished() && !completed.effectsPending() && completed.pendingUsers().isEmpty(), "all real security work acknowledged");
        check(completed.summary().actual().usersCreated() == 1000, "actual thousand new users committed");
        check(count("SELECT COUNT(*) FROM sys_user") == initialUsers + 1000, "exact thousand users inserted");
        check(count("SELECT COUNT(*) FROM sys_im_user_mapping WHERE tenant_id=100000 AND bind_type='AUTO_SYNC'") == 1000, "exact thousand real mappings");
        check(count("SELECT COUNT(*) FROM sys_user_role WHERE role_id<>5 AND user_id IN (SELECT user_id FROM sys_im_user_mapping WHERE tenant_id=100000 AND bind_type='AUTO_SYNC')") == 0, "synchronized users receive no privileged role");
        check(count("SELECT COUNT(*) FROM sys_user_role WHERE tenant_id=100000 AND user_id IN (SELECT user_id FROM sys_im_user_mapping WHERE tenant_id=100000 AND bind_type='AUTO_SYNC')") == 0, "new synchronized users retain approved zero-role policy");
        check(count("SELECT COUNT(*) FROM sys_im_sync_run WHERE sync_run_id=? AND completed_time IS NOT NULL AND status='COMPLETED'", runId) == 1, "completion timestamp matches durable completion");
        check(elapsed < 300000, "full thousand-person sync within five minutes");
        System.out.println("G4_IM_SYNC_COMPLETE_PERFORMANCE: members=1000; actual_created=1000; elapsed_ms=" + elapsed
                + "; limit_ms=300000; real_mysql=true; real_redis_cleanup=true; real_vendor_adapter=true; protocol_loopback=true; complete_sync=true; vendor_service=false");
        adminToken = login.apply(admin, TENANT);
        JsonNode report = request("GET", "/system/im/sync/" + runId + "?pageNum=10&pageSize=100", null, adminToken, 200).path("data");
        check(report.path("header").path("status").asText().equals("COMPLETED"), "relogin sees durable completed report");
        check(report.path("progress").path("actual").path("usersCreated").asLong() == 1000, "HTTP report exposes actual completed total");
        for (JsonNode entry : report.path("entries").path("rows")) check(entry.path("processed").asBoolean(), "report page marks real processed entry");
        check(jobs.recover(false).getResultMsg().equals("已检查=0；已完成=0；待继续=0；失败=0"), "completed runs not rescheduled");
        rateLimit(runId, version);
        uncertainResponse(adminToken);
        check(tokenCalls.get() == 1, "real encrypted access-token cache reused across previews");
        check(remoteCalls.get() > 1, "real organization protocol requests executed");
        check(count("SELECT COUNT(*) FROM sys_role_menu WHERE role_id=5 AND menu_id=1784") == 0, "no residual employee write grant");
    }

    private void rateLimit(long runId, int version) throws Exception {
        String token = login.apply(RATE_ADMIN, TENANT);
        String path = "/system/im/sync/" + runId + "/apply";
        for (int index = 1; index <= 5; index++) request("POST", path, body(version, String.format("%064x", index)), token, 409);
        request("POST", path, body(version, String.format("%064x", 6)), token, 429);
        String key = "cloudflow:rate_limit:auth:im:sync:apply:tenant:" + TENANT + ":user:" + RATE_ADMIN;
        check("5".equals(runtime.strings().opsForValue().get(key)), "real Redis rate limit remains five");
        Long ttl = runtime.strings().getExpire(key, TimeUnit.SECONDS);
        check(ttl != null && ttl > 0 && ttl <= 60, "production sixty-second window enforced");
    }

    private void uncertainResponse(String token) throws Exception {
        JsonNode preview = preview(token);
        long runId = preview.path("header").path("syncRunId").asLong();
        check(preview.path("summary").path("usersCreated").asLong() == 0, "repeat snapshot plans no duplicate account");
        String path = "/system/im/sync/" + runId + "/apply";
        String body = body(preview.path("header").path("configVersion").asInt(), preview.path("hash").asText());
        loseResponse.set(true);
        CompletableFuture<HttpResponse<String>> pending = HTTP.sendAsync(build("POST", path, body, token, Duration.ofSeconds(1)), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        requests++;
        try {
            check(committed.await(25, TimeUnit.SECONDS), "server finished real apply before lost response released");
            try { pending.get(5, TimeUnit.SECONDS); throw new AssertionError("Expected transport timeout"); }
            catch (ExecutionException failure) { check(failure.getCause() instanceof HttpTimeoutException, "client receives real transport timeout"); }
            JsonNode report = request("GET", "/system/im/sync/" + runId, null, token, 200).path("data");
            check(report.path("header").path("mode").asText().equals("APPLY"), "uncertain client discovers actual submitted batch");
            long cursor = state(runId).summary().processed();
            jdbc.update("DELETE FROM sys_role_menu WHERE role_id=1 AND menu_id=1784 AND tenant_id=100000");
            try {
                request("POST", path, body, token, 403);
                JobResult denied = jobs.recover(false);
                check("FAILED".equals(denied.getExecuteStatus()) && state(runId).summary().processed() == cursor, "revocation blocks further background organization writes");
            } finally { jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (1,1784,100000)"); }
            JobResult resumed = jobs.recover(false);
            check("SUCCESS".equals(resumed.getExecuteStatus()) && Integer.valueOf(1).equals(resumed.getAffectedRows()), "restored authority resumes original batch");
            check(state(runId).summary().actual().usersCreated() == 0, "lost response never duplicates users");
        } finally { releaseResponse.countDown(); }
    }

    private JsonNode preview(String token) throws Exception {
        int version = database.read(TENANT, mapper -> mapper.config(TENANT, configId)).getVersion();
        return request("POST", "/system/im/config/" + configId + "/sync-preview", "{\"version\":" + version + "}", token, 200).path("data");
    }

    private JsonNode request(String method, String path, String body, String token, int expected) throws Exception {
        HttpResponse<String> response = HTTP.send(build(method, path, body, token, Duration.ofSeconds(90)), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        requests++;
        check(response.statusCode() == expected, method + " expected=" + expected + " actual=" + response.statusCode());
        JsonNode result = JSON.readTree(response.body());
        check(result.path("code").asInt() == expected, "HTTP business status matches");
        for (String secret : List.of("13977000000", "execute-0@example.test", "execute-private-access-token", ImConfigChecks.APP_SECRET, "im1:")) {
            check(!response.body().contains(secret), "private sample absent from HTTP response");
        }
        if (expected == 200) {
            check(Objects.equals("no-store", response.headers().firstValue("Cache-Control").orElse(null)), "successful response never cached");
            check(Objects.equals("nosniff", response.headers().firstValue("X-Content-Type-Options").orElse(null)), "HTTP content sniffing disabled");
        }
        return result;
    }

    private HttpRequest build(String method, String path, String body, String token, Duration timeout) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(origin.resolve(path)).timeout(timeout);
        if (token != null) builder.header(SaManager.getConfig().getTokenName(), token);
        if (body != null) builder.header("Content-Type", "application/json");
        return builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8)).build();
    }

    private ImSyncApplication state(long runId) { return database.read(TENANT, mapper -> codec.decodeRun(mapper.syncRun(TENANT, runId))); }
    private long count(String sql, Object... arguments) { return jdbc.queryForObject(sql, Long.class, arguments); }
    private static String body(int version, String hash) { return "{\"version\":" + version + ",\"hash\":\"" + hash + "\"}"; }
    private synchronized void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }

    private static String members() {
        ObjectNode result = JSON.createObjectNode().put("errcode", 0);
        ArrayNode people = result.putArray("userlist");
        for (int index = 0; index < 1000; index++) {
            ObjectNode person = people.addObject().put("userid", "execute-person-" + index).put("name", "执行人员" + index)
                    .put("status", 1).put("mobile", String.format(java.util.Locale.ROOT, "1397700%04d", index)).put("email", "execute-" + index + "@example.test");
            person.putArray("department").add(2);
        }
        return result.toString();
    }

    private static void respond(HttpExchange exchange, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json"); exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes); exchange.close();
    }

    private static final class HeldResponse extends HttpServletResponseWrapper {
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private HeldResponse(HttpServletResponse response) { super(response); }
        @Override public ServletOutputStream getOutputStream() {
            return new ServletOutputStream() {
                @Override public boolean isReady() { return true; }
                @Override public void setWriteListener(WriteListener listener) { }
                @Override public void write(int value) { bytes.write(value); }
            };
        }
        @Override public PrintWriter getWriter() { return new PrintWriter(bytes, false, StandardCharsets.UTF_8); }
        @Override public void flushBuffer() { }
    }
}
