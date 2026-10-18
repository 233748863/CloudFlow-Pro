package com.cloudflow.auth.im;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.LoggerFactory;

public final class WeComProtocolChecks {
    private static int assertions;
    private static final String TOKEN = "access-token-do-not-log";

    public static void main(String[] arguments) throws Exception {
        Logger sdkLogger = (Logger) LoggerFactory.getLogger("me.chanjar.weixin");
        Level previousLevel = sdkLogger.getLevel();
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        sdkLogger.addAppender(logs);
        sdkLogger.setLevel(Level.DEBUG);
        try {
            boundaries();
            protocol();
            equal(0, logs.list.size(), "SDK verbose request logging is never reached");
        } finally {
            sdkLogger.setLevel(previousLevel);
            sdkLogger.detachAppender(logs);
            logs.stop();
        }
        System.out.println("G4_WECOM_PROTOCOL_CHECKS: assertions=" + assertions
                + "; failed=0; actual_sdk=4.8.6.B; real_loopback_http=true; vendor_service=false; mysql=false; redis=false; production_modified=false");
    }

    private static void boundaries() {
        for (String uri : List.of("http://qyapi.weixin.qq.com/cgi-bin/gettoken", "https://evil.test/cgi-bin/gettoken",
                "https://qyapi.weixin.qq.com.evil.test/cgi-bin/gettoken", "https://qyapi.weixin.qq.com:444/cgi-bin/gettoken",
                "https://user@qyapi.weixin.qq.com/cgi-bin/gettoken", "https://qyapi.weixin.qq.com/cgi-bin/gettoken#secret",
                "https://qyapi.weixin.qq.com/cgi-bin/../gettoken", "https://qyapi.weixin.qq.com/cgi-bin/%67ettoken",
                "https://qyapi.weixin.qq.com/cgi-bin/user/delete", "https://127.0.0.1/cgi-bin/gettoken")) {
            rejected(() -> WeComHttp.validate("GET", URI.create(uri)), "IM_CONFIGURATION_INVALID");
        }
        rejected(() -> WeComHttp.validate("DELETE", URI.create("https://qyapi.weixin.qq.com/cgi-bin/gettoken")), "IM_CONFIGURATION_INVALID");
        rejected(() -> new WeComHttp(HttpClient.newBuilder().followRedirects(HttpClient.Redirect.ALWAYS).build(),
                uri -> uri, Duration.ofSeconds(1)), "IM_CONFIGURATION_INVALID");
        check(WeComHttp.directClient().followRedirects() == HttpClient.Redirect.NEVER, "production redirects disabled");
        check(WeComHttp.directClient().proxy().orElseThrow().select(URI.create("https://qyapi.weixin.qq.com")).get(0).type()
                == java.net.Proxy.Type.DIRECT, "system proxy bypassed");
    }

    private static void protocol() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        ExecutorService workers = Executors.newFixedThreadPool(2);
        server.setExecutor(workers);
        AtomicReference<String> body = new AtomicReference<>("{\"access_token\":\"" + TOKEN + "\",\"expires_in\":7200}");
        AtomicInteger status = new AtomicInteger(200);
        AtomicInteger slowMillis = new AtomicInteger();
        List<URI> requests = new CopyOnWriteArrayList<>();
        List<String> contents = new CopyOnWriteArrayList<>();
        server.createContext("/", exchange -> serve(exchange, status.get(), body.get(), slowMillis.get(), requests, contents));
        server.start();
        try {
            URI local = URI.create("http://127.0.0.1:" + server.getAddress().getPort());
            WeComHttp http = new WeComHttp(WeComHttp.directClient(), official -> local.resolve(official.getRawPath()
                    + (official.getRawQuery() == null ? "" : "?" + official.getRawQuery())), Duration.ofMillis(500));
            WeComCredentials credentials = ImSecurityChecks.fixture();
            AtomicReference<String> invalidated = new AtomicReference<>();
            WeComSdk sdk = new WeComSdk(credentials, http, () -> TOKEN, invalidated::set);
            ImAccessTokens.Grant grant = WeComSdk.fetchToken(credentials, http);
            equal(TOKEN, grant.token(), "official token payload without errcode");
            equal(7200, grant.expiresIn(), "provider expiry preserved");
            check(requests.get(0).getRawQuery().contains("corpid=corpA"), "token request tenant enterprise");
            check(requests.get(0).getRawQuery().contains("corpsecret=" + credentials.appSecret()), "token request uses correct application secret");
            body.set("{\"errcode\":0,\"UserId\":\"user-123\",\"DeviceId\":\"private-device\"}");
            ImIdentityProvider.Member member = WeComIdentityProvider.identify(sdk, credentials, "authCode123");
            equal("user-123", member.externalUserId(), "actual SDK identity parser");
            equal(100L, member.tenantId(), "identity bound to trusted tenant");
            equal(200L, member.configId(), "identity bound to trusted config");
            equal(3, member.configVersion(), "identity bound to trusted version");
            check(requests.get(1).getRawQuery().contains("agentid=77"), "SDK identity request application");
            check(requests.get(1).getRawQuery().contains("code=authCode123") && requests.get(1).getRawQuery().contains("access_token=" + TOKEN), "SDK identity exchange real wire");
            for (String external : List.of("{\"errcode\":0,\"OpenId\":\"external-visitor\"}",
                    "{\"errcode\":0,\"UserId\":\"user-123\",\"external_userid\":\"customer\"}",
                    "{\"errcode\":0,\"UserId\":\"\"}")) {
                body.set(external);
                rejected(() -> WeComIdentityProvider.identify(sdk, credentials, "code"), "IM_PROVIDER_REJECTED");
            }
            String writeUrl = "https://qyapi.weixin.qq.com/cgi-bin/message/send";
            body.set("{\"errcode\":0,\"msgid\":\"message-1\"}");
            sdk.post(writeUrl, "{\"touser\":\"user-123\",\"agentid\":77}");
            equal("{\"touser\":\"user-123\",\"agentid\":77}", contents.get(contents.size() - 1), "JSON body crosses real wire unchanged");
            for (String failureBody : List.of("{\"errcode\":-1,\"errmsg\":\"" + TOKEN + "\"}",
                    "{\"errcode\":40003,\"errmsg\":\"" + credentials.appSecret() + "\"}")) {
                body.set(failureBody);
                int before = requests.size();
                rejected(() -> sdk.post(writeUrl, "{}"), "IM_PROVIDER_REJECTED");
                equal(before + 1, requests.size(), "explicit provider failure not retried");
            }
            body.set("{\"errcode\":42001,\"errmsg\":\"expired\"}");
            int beforeInvalid = requests.size();
            rejected(() -> sdk.post(writeUrl, "{}"), "IM_TOKEN_REJECTED");
            equal(TOKEN, invalidated.get(), "exact rejected token invalidated");
            equal(beforeInvalid + 1, requests.size(), "no resend on token rejection");
            for (String malformed : List.of("not-json-" + TOKEN, "{}", "{\"errcode\":0,\"errcode\":1}",
                    "{\"errcode\":0}{}", "{\"errcode\":\"0\"}", "{\"errcode\":18446744073709551616}")) {
                body.set(malformed);
                rejected(() -> sdk.post(writeUrl, "{}"), "IM_PROVIDER_UNCERTAIN");
            }
            for (int httpStatus : List.of(302, 401, 500, 503)) {
                status.set(httpStatus);
                int before = requests.size();
                rejected(() -> sdk.post(writeUrl, "{}"), "IM_PROVIDER_UNCERTAIN");
                equal(before + 1, requests.size(), "HTTP error no redirect or retry");
            }
            status.set(200);
            body.set("{\"errcode\":0,\"data\":\"" + "a".repeat(WeComHttp.MAX_RESPONSE_BYTES) + "\"}");
            rejected(() -> sdk.post(writeUrl, "{}"), "IM_PROVIDER_UNCERTAIN");
            body.set("{\"errcode\":0}");
            slowMillis.set(900);
            long start = System.nanoTime();
            rejected(() -> sdk.post(writeUrl, "{}"), "IM_PROVIDER_UNCERTAIN");
            check(Duration.ofNanos(System.nanoTime() - start).toMillis() < 850, "whole response deadline enforced");
            slowMillis.set(0);
            int beforeUnsafe = requests.size();
            rejected(() -> sdk.get("http://127.0.0.1:1/steal", null), "IM_CONFIGURATION_INVALID");
            rejected(() -> sdk.get("https://qyapi.weixin.qq.com/cgi-bin/user/getuserinfo?access_token=evil", null), "IM_CONFIGURATION_INVALID");
            rejected(() -> sdk.get("https://qyapi.weixin.qq.com/cgi-bin/gettoken", null), "IM_CONFIGURATION_INVALID");
            rejected(() -> sdk.getAccessToken(true), "IM_PROVIDER_UNSUPPORTED");
            rejected(() -> sdk.execute(null, "https://qyapi.weixin.qq.com/any", null), "IM_PROVIDER_UNSUPPORTED");
            equal(beforeUnsafe, requests.size(), "unsafe calls never reach wire");
        } finally {
            server.stop(0);
            workers.shutdownNow();
        }
    }

    private static void serve(HttpExchange exchange, int status, String body, int slowMillis, List<URI> requests, List<String> contents) throws IOException {
        requests.add(exchange.getRequestURI());
        contents.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        if (status == 302) exchange.getResponseHeaders().set("Location", "http://127.0.0.1:1/should-not-follow");
        try {
            exchange.sendResponseHeaders(status, bytes.length);
            if (slowMillis > 0) {
                try { Thread.sleep(slowMillis); }
                catch (InterruptedException failure) { Thread.currentThread().interrupt(); }
            }
            exchange.getResponseBody().write(bytes);
        } finally { exchange.close(); }
    }

    private static void check(boolean result, String name) { assertions++; if (!result) throw new AssertionError(name); }
    private static void equal(Object expected, Object actual, String name) { check(Objects.equals(expected, actual), name); }
    private static void rejected(Runnable action, String reason) {
        try { action.run(); throw new AssertionError("expected " + reason); }
        catch (ImFailure failure) {
            equal(reason, failure.getReasonCode(), "safe reason");
            check(failure.getCause() == null && !failure.getMessage().contains(TOKEN), "no unsafe response or cause");
        }
    }
}
