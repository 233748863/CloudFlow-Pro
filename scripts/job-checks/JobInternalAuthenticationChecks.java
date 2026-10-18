package com.cloudflow.job.checks;

import com.cloudflow.auth.service.jobclient.JobFeignSigningCapability;
import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.job.client.JobReportClient;
import com.cloudflow.common.job.model.JobResultReportDTO;
import com.cloudflow.common.job.security.JobInternalAuthenticationFilter;
import com.cloudflow.common.job.security.JobRequestSignature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import feign.Client;
import feign.Feign;
import feign.Request;
import feign.RequestLine;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.WriteListener;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.lang.reflect.Proxy;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.web.client.RestClient;

public final class JobInternalAuthenticationChecks {
    private static final String AUTH = "cloudflow-auth";
    private static final String OA = "cloudflow-service-oa";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final byte[] BODY = "{\"message\":\"中文摘要\"}".getBytes(StandardCharsets.UTF_8);
    private static final Clock NOW = Clock.fixed(Instant.ofEpochSecond(1800000000), ZoneOffset.UTC);
    private static int checks;

    public interface Probe { @RequestLine("POST /inner/job/probe?name=%E4%B8%AD") String send(String body); }

    public static void main(String[] args) throws Exception {
        Map<String, String> keys = keys();
        JobRequestSignature sender = new JobRequestSignature(AUTH, keys, NOW);
        JobRequestSignature receiver = new JobRequestSignature(OA, Map.of(AUTH, keys.get(AUTH), OA, keys.get(OA)), NOW);
        for (String service : JobRequestSignature.SERVICES) {
            JobRequestSignature source = new JobRequestSignature(service, keys, NOW);
            HttpHeaders report = new HttpHeaders();
            source.sign(report, "POST", "/inner/job/report", AUTH, BODY);
            check(sender.verify(report, "POST", "/inner/job/report") && sender.matchesBody(report, BODY), "five service reports authenticate");
            HttpHeaders dispatch = new HttpHeaders();
            sender.sign(dispatch, "POST", "/inner/job/execute", service, BODY);
            check(source.verify(dispatch, "POST", "/inner/job/execute"), "five recipients authenticate dispatch");
        }
        HttpHeaders signed = signed(sender);
        check(receiver.verify(signed, "POST", "/inner/job/execute?x=1"), "valid signature");
        check(!receiver.verify(signed, "GET", "/inner/job/execute?x=1"), "method tampering");
        check(!receiver.verify(signed, "POST", "/inner/job/execute?x=2"), "query tampering");
        check(!receiver.verify(signed, "POST", "/inner/job/status?x=1"), "path tampering");
        check(!receiver.matchesBody(signed, new byte[0]), "body tampering");
        for (String header : List.of(SecurityConstants.FROM_SERVICE_HEADER, SecurityConstants.TENANT_ID_HEADER,
                "X-User-Id", "Authorization", "Cookie", JobRequestSignature.TARGET, JobRequestSignature.DIGEST,
                JobRequestSignature.NONCE, JobRequestSignature.TIME, JobRequestSignature.SIGNATURE)) {
            HttpHeaders changed = copy(signed); changed.set(header, "changed");
            check(!receiver.verify(changed, "POST", "/inner/job/execute?x=1"), "bound context tampering");
        }
        for (String header : JobRequestSignature.BOUND_HEADERS) {
            HttpHeaders duplicate = copy(signed); duplicate.add(header, "extra");
            check(!receiver.verify(duplicate, "POST", "/inner/job/execute?x=1"), "duplicate header rejected");
            HttpHeaders newline = copy(signed); newline.set(header, "a\nb");
            check(!receiver.verify(newline, "POST", "/inner/job/execute?x=1"), "header newline rejected");
        }
        check(!sender.verify(signed, "POST", "/inner/job/execute?x=1"), "cannot redirect signed request to another recipient");
        for (long offset : new long[]{-301, -300, 300, 301}) {
            JobRequestSignature timed = new JobRequestSignature(AUTH, keys, Clock.offset(NOW, Duration.ofSeconds(offset)));
            check(receiver.verify(signed(timed), "POST", "/inner/job/execute?x=1") == (Math.abs(offset) <= 300), "time boundaries");
        }
        check(!receiver.verify(signed(new JobRequestSignature(AUTH, keys(), NOW)), "POST", "/inner/job/execute?x=1"), "wrong credential");
        expectInvalid(() -> new JobRequestSignature(AUTH, Map.of(), NOW));
        expectInvalid(() -> new JobRequestSignature("unknown", keys, NOW));
        Map<String, String> shortKey = new HashMap<>(keys); shortKey.put(OA, Base64.getEncoder().encodeToString(new byte[31]));
        expectInvalid(() -> new JobRequestSignature(AUTH, shortKey, NOW));
        Map<String, String> malformed = new HashMap<>(keys); malformed.put(OA, "invalid!");
        expectInvalid(() -> new JobRequestSignature(AUTH, malformed, NOW));
        HttpHeaders retry = signed(sender);
        check(!signed.getFirst(JobRequestSignature.NONCE).equals(retry.getFirst(JobRequestSignature.NONCE)), "retry gets fresh random nonce");
        JsonNode state = JSON.readTree(Files.readString(Path.of(args[0])).replace("\uFEFF", ""));
        Path run = Path.of(state.path("run").asText()).toRealPath();
        check(run.getFileName().toString().matches("[a-f0-9]{32}") && state.path("status").asText().equals("RUNNING"), "owned fixture state");
        String configName = "";
        for (JsonNode process : state.path("processes")) if (process.path("name").asText().equals("redis")) configName = process.path("marker").asText();
        Path redisFile = run.resolve(configName).toRealPath();
        check(redisFile.getParent().equals(run), "owned Redis configuration");
        List<String> config = Files.readAllLines(redisFile);
        check(config.contains("bind 127.0.0.1") && config.contains("port " + state.path("redisPort").asInt()), "loopback Redis");
        String password = config.stream().filter(line -> line.startsWith("requirepass ")).findFirst().orElseThrow().substring(12).trim();
        LettuceConnectionFactory factory = connection(state.path("redisPort").asInt(), password);
        try {
            StringRedisTemplate redis = new StringRedisTemplate(factory);
            JobInternalAuthenticationFilter filter = new JobInternalAuthenticationFilter(receiver, redis, JSON);
            check(invoke(filter, signed, BODY, "/inner/job/execute", "x=1") == 200, "verified body reaches controller unchanged");
            check(invoke(filter, signed, BODY, "/inner/job/execute", "x=1") == 403, "real Redis rejects replay");
            String nonceKey = "cloudflow:job:internal-nonce:" + AUTH + ":" + signed.getFirst(JobRequestSignature.NONCE);
            Long ttl = redis.getExpire(nonceKey);
            check(ttl != null && ttl >= 599 && ttl <= 601, "nonce covers complete acceptance window");
            check(invoke(filter, retry, new byte[0], "/inner/job/execute", "x=1") == 403, "tampered body never reaches controller");
            check(invoke(filter, retry, BODY, "/inner/job/execute", "x=1") == 200, "tampered request did not consume valid nonce");
            check(invoke(filter, new HttpHeaders(), BODY, "/inner/job/report", null) == 403, "missing credentials rejected");
            check(invoke(filter, new HttpHeaders(), BODY, "/business/unchanged", null) == 200, "other business paths unchanged");
            try (ServerSocket unavailable = new ServerSocket(0, 1, java.net.InetAddress.getLoopbackAddress())) {
                LettuceConnectionFactory failed = connection(unavailable.getLocalPort(), password);
                try {
                    JobInternalAuthenticationFilter closed = new JobInternalAuthenticationFilter(receiver, new StringRedisTemplate(failed), JSON);
                    check(invoke(closed, signed(sender), BODY, "/inner/job/execute", "x=1") == 503, "real Redis connection timeout fails closed");
                } finally { failed.destroy(); }
            }
        } finally { factory.destroy(); }
        clients(keys);
        System.out.println("JOB_INTERNAL_AUTH_CHECKS: passed=" + checks + "; failed=0; real_redis_replay=true; connection_failure_closed=true; credentials_printed=false");
    }

    private static void clients(Map<String, String> keys) throws Exception {
        JobRequestSignature auth = new JobRequestSignature(AUTH, keys, Clock.systemUTC());
        JobRequestSignature oa = new JobRequestSignature(OA, keys, Clock.systemUTC());
        AtomicReference<Throwable> failure = new AtomicReference<>();
        AtomicInteger received = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/inner/job/", exchange -> {
            try {
                HttpHeaders headers = new HttpHeaders(); exchange.getRequestHeaders().forEach((name, values) -> headers.put(name, new ArrayList<>(values)));
                byte[] body = exchange.getRequestBody().readAllBytes();
                JobRequestSignature verifier = exchange.getRequestURI().getPath().endsWith("probe") ? oa : auth;
                check(verifier.verify(headers, exchange.getRequestMethod(), JobRequestSignature.requestTarget(exchange.getRequestURI()))
                        && verifier.matchesBody(headers, body), "actual client serialized bytes and logical recipient signed");
                if (verifier == oa) check("2468".equals(headers.getFirst(SecurityConstants.TENANT_ID_HEADER)), "Feign signs after context interceptor");
                received.incrementAndGet();
                byte[] response = "{\"code\":200,\"msg\":\"ok\"}".getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json"); exchange.sendResponseHeaders(200, response.length); exchange.getResponseBody().write(response);
            } catch (Throwable error) { failure.set(error); exchange.sendResponseHeaders(500, -1); }
            finally { exchange.close(); }
        });
        server.start();
        try {
            String url = "http://127.0.0.1:" + server.getAddress().getPort();
            JobReportClient reports = new JobReportClient(RestClient.builder(), OA, url, true, oa, null);
            reports.reportHandlers(List.of()); reports.reportResult(new JobResultReportDTO());
            Client delegate = new Client.Default(null, null);
            Client routing = (request, options) -> delegate.execute(Request.create(request.httpMethod(),
                    request.url().replace("http://" + OA, url), request.headers(), request.body(), request.charset(), request.requestTemplate()), options);
            Probe probe = Feign.builder().client(routing).addCapability(new JobFeignSigningCapability(auth))
                    .requestInterceptor(template -> template.header(SecurityConstants.TENANT_ID_HEADER, "2468"))
                    .target(Probe.class, "http://" + OA);
            probe.send(new String(BODY, StandardCharsets.UTF_8));
            check(failure.get() == null && received.get() == 3, "Feign dispatch and both RestClient report protocols reach real HTTP listener");
        } finally { server.stop(0); }
    }

    private static LettuceConnectionFactory connection(int port, String password) {
        RedisStandaloneConfiguration configuration = new RedisStandaloneConfiguration("127.0.0.1", port); configuration.setPassword(password);
        LettuceConnectionFactory factory = new LettuceConnectionFactory(configuration,
                LettuceClientConfiguration.builder().commandTimeout(Duration.ofMillis(400)).shutdownTimeout(Duration.ZERO).build());
        factory.afterPropertiesSet(); factory.start(); return factory;
    }

    private static int invoke(JobInternalAuthenticationFilter filter, HttpHeaders headers, byte[] body, String path, String query) throws Exception {
        Map<String, Object> attributes = new HashMap<>(); AtomicInteger status = new AtomicInteger(200);
        ByteArrayInputStream input = new ByteArrayInputStream(body); ByteArrayOutputStream output = new ByteArrayOutputStream();
        ServletInputStream stream = new ServletInputStream() {
            @Override public int read() { return input.read(); }
            @Override public boolean isFinished() { return input.available() == 0; }
            @Override public boolean isReady() { return true; }
            @Override public void setReadListener(ReadListener listener) { throw new UnsupportedOperationException(); }
        };
        ServletOutputStream result = new ServletOutputStream() {
            @Override public void write(int value) { output.write(value); }
            @Override public boolean isReady() { return true; }
            @Override public void setWriteListener(WriteListener listener) { throw new UnsupportedOperationException(); }
        };
        HttpServletRequest request = (HttpServletRequest) Proxy.newProxyInstance(JobInternalAuthenticationChecks.class.getClassLoader(), new Class<?>[]{HttpServletRequest.class}, (proxy, method, args) -> switch (method.getName()) {
            case "getServletPath", "getRequestURI" -> path;
            case "getQueryString" -> query;
            case "getMethod" -> "POST";
            case "getHeaders" -> Collections.enumeration(headers.getOrDefault((String) args[0], List.of()));
            case "getAttribute" -> attributes.get((String) args[0]);
            case "setAttribute" -> attributes.put((String) args[0], args[1]);
            case "removeAttribute" -> attributes.remove((String) args[0]);
            case "getDispatcherType" -> jakarta.servlet.DispatcherType.REQUEST;
            case "isAsyncStarted" -> false;
            case "getInputStream" -> stream;
            default -> throw new UnsupportedOperationException(method.getName());
        });
        HttpServletResponse response = (HttpServletResponse) Proxy.newProxyInstance(JobInternalAuthenticationChecks.class.getClassLoader(), new Class<?>[]{HttpServletResponse.class}, (proxy, method, args) -> switch (method.getName()) {
            case "setStatus" -> { status.set((Integer) args[0]); yield null; }
            case "getOutputStream" -> result;
            case "setContentType", "setCharacterEncoding" -> null;
            default -> throw new UnsupportedOperationException(method.getName());
        });
        AtomicInteger calls = new AtomicInteger();
        filter.doFilter(request, response, (accepted, ignored) -> {
            if (!java.util.Arrays.equals(body, accepted.getInputStream().readAllBytes())) throw new AssertionError("body changed");
            calls.incrementAndGet();
        });
        check(calls.get() == (status.get() == 200 ? 1 : 0), "rejected request cannot invoke business controller");
        return status.get();
    }

    private static Map<String, String> keys() {
        Map<String, String> keys = new LinkedHashMap<>(); SecureRandom random = new SecureRandom();
        for (String service : JobRequestSignature.SERVICES) { byte[] key = new byte[32]; random.nextBytes(key); keys.put(service, Base64.getEncoder().encodeToString(key)); }
        return keys;
    }
    private static HttpHeaders signed(JobRequestSignature signer) {
        HttpHeaders headers = new HttpHeaders(); headers.set(SecurityConstants.TENANT_ID_HEADER, "123"); headers.set("X-User-Id", "456");
        headers.set("Authorization", "Bearer test-context"); headers.set("Cookie", "test-context");
        signer.sign(headers, "POST", "/inner/job/execute?x=1", OA, BODY); return headers;
    }
    private static HttpHeaders copy(HttpHeaders source) { HttpHeaders result = new HttpHeaders(); source.forEach((key, values) -> result.put(key, new ArrayList<>(values))); return result; }
    private static void expectInvalid(Runnable action) { boolean rejected = false; try { action.run(); } catch (IllegalArgumentException expected) { rejected = true; } check(rejected, "invalid deployment credentials fail closed"); }
    private static synchronized void check(boolean condition, String label) { if (!condition) throw new AssertionError(label); checks++; }
}
