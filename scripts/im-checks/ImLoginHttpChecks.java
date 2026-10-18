package com.cloudflow.auth.im;

import cn.dev33.satoken.SaManager;
import cn.dev33.satoken.context.SaTokenContext;
import cn.dev33.satoken.spring.SaTokenContextForSpringInJakartaServlet;
import com.cloudflow.auth.controller.ImLoginController;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.GlobalExceptionHandler;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.security.config.SecurityWebMvcConfig;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.security.interceptor.UserContextInterceptor;
import com.cloudflow.common.security.oauth2.OAuthRequestInterceptor;
import com.cloudflow.common.security.portal.PortalRequestInterceptor;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.TenantInterceptor;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.Filter;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletResponseWrapper;
import java.lang.reflect.Field;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;
import org.apache.catalina.Context;
import org.apache.catalina.Wrapper;
import org.apache.catalina.startup.Tomcat;
import org.apache.tomcat.util.descriptor.web.FilterDef;
import org.apache.tomcat.util.descriptor.web.FilterMap;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.DispatcherServlet;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

public final class ImLoginHttpChecks {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static ImLoginFlow flow;
    private static ImProperties properties;
    private static int assertions;
    private static int requests;
    private static URI origin;
    private static final AtomicBoolean FAIL_LOCATION = new AtomicBoolean();
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();

    @Configuration(proxyBeanMethods = false)
    @EnableWebMvc
    public static class WebConfiguration implements WebMvcConfigurer {
        @Bean public ImLoginController controller() { return new ImLoginController(flow, new ImLoginRedirects(properties), JSON); }
        @Bean public GlobalExceptionHandler errors() { return new GlobalExceptionHandler(); }
        @Override public void addInterceptors(InterceptorRegistry registry) {
            SecurityWebMvcConfig security = new SecurityWebMvcConfig();
            inject(security, "userContextInterceptor", new UserContextInterceptor());
            inject(security, "tenantInterceptor", new TenantInterceptor());
            inject(security, "portalRequestInterceptor", new PortalRequestInterceptor(null, null, null, null, null));
            inject(security, "oauthRequestInterceptor", new OAuthRequestInterceptor(null, null, null));
            security.addInterceptors(registry);
        }
    }

    static void run(ImLoginFlow login, ImProperties configuration, ImLoginAccounts.Account account, JdbcTemplate jdbc,
            TokenService tokens, Runnable resetLimit, String encryptedTotp, Supplier<String> code) {
        flow = login; properties = configuration;
        SaTokenContext previous = SaManager.getSaTokenContext();
        SaManager.setSaTokenContext(new SaTokenContextForSpringInJakartaServlet());
        IpUtils.setTrustedProxies(List.of("127.0.0.1/32"));
        Tomcat server = new Tomcat();
        AnnotationConfigWebApplicationContext web = new AnnotationConfigWebApplicationContext();
        try {
            Path temporary = Path.of(System.getProperty("java.io.tmpdir")).toAbsolutePath().normalize();
            check(!temporary.getRoot().toString().equalsIgnoreCase(System.getenv("SystemDrive") + "\\"), "data drive required");
            Path directory = Files.createTempDirectory(temporary, "g4-im-login-http-");
            server.setBaseDir(directory.resolve("tomcat").toString()); server.setPort(0);
            server.getConnector().setProperty("address", "127.0.0.1");
            Context context = server.addContext("", directory.toString());
            context.setParentClassLoader(ImLoginHttpChecks.class.getClassLoader());
            Filter boundary = (request, response, chain) -> {
                try {
                    chain.doFilter(request, new HttpServletResponseWrapper((HttpServletResponse) response) {
                        @Override public void setHeader(String name, String value) {
                            if ("Location".equals(name) && FAIL_LOCATION.getAndSet(false)) throw new IllegalStateException("controlled-location-failure");
                            super.setHeader(name, value);
                        }
                    });
                } finally { UserContext.clear(); TenantContext.clear(); }
            };
            FilterDef definition = new FilterDef(); definition.setFilterName("owned-response-boundary"); definition.setFilter(boundary); context.addFilterDef(definition);
            FilterMap mapping = new FilterMap(); mapping.setFilterName(definition.getFilterName()); mapping.addURLPattern("/*"); context.addFilterMap(mapping);
            web.register(WebConfiguration.class);
            Wrapper servlet = Tomcat.addServlet(context, "im-login", new DispatcherServlet(web)); servlet.setLoadOnStartup(1); context.addServletMappingDecoded("/", "im-login");
            server.start(); origin = URI.create("http://127.0.0.1:" + server.getConnector().getLocalPort());
            jdbc.update("DELETE FROM sys_user_totp WHERE tenant_id=? AND user_id=?", account.tenantId(), account.userId());
            runCases(account, jdbc, tokens, resetLimit, encryptedTotp, code);
            System.out.println("G4_IM_LOGIN_HTTP: assertions=" + assertions + "; failed=0; requests=" + requests
                    + "; real_spring_mvc=true; real_security_web_mvc_config=true; real_mysql=true; real_redis=true; real_sa_token=true; real_totp=true; provider=fixture; redis_aspects=false; response_fault=injected; production_modified=false");
        } catch (Exception failure) { throw new AssertionError("IM HTTP checks failed", failure); }
        finally {
            try { server.stop(); server.destroy(); web.close(); }
            catch (Exception failure) { throw new AssertionError("IM HTTP shutdown failed", failure); }
            finally { SaManager.setSaTokenContext(previous); IpUtils.setTrustedProxies(List.of()); flow = null; properties = null; }
        }
    }

    private static void runCases(ImLoginAccounts.Account account, JdbcTemplate jdbc, TokenService tokens, Runnable resetLimit, String encryptedTotp, Supplier<String> code) throws Exception {
        String availability = "/availability?tenantCode=im-login-tenant";
        check(data(send("GET", availability, null, Map.of(), 200)).path("enabled").asBoolean(), "approved binding menu enables anonymous availability");
        jdbc.update("UPDATE sys_tenant SET effective_menu_ids='[6,1780,1783,1785]' WHERE tenant_id=?", account.tenantId());
        try {
            JsonNode unavailable = data(send("GET", availability, null, Map.of(), 200));
            check(!unavailable.path("enabled").asBoolean() && unavailable.path("reasonCode").asText().equals("IM_LOGIN_PACKAGE_UNAVAILABLE"), "configuration and sync menus alone do not enable login");
            send("GET", "/auth-url?tenantCode=im-login-tenant&purpose=SCAN_LOGIN", null, Map.of(), 403);
        } finally { restorePackage(jdbc, account); }
        for (String invalid : List.of("&tenantId=100000", "&tenantCode=other", "&userId=1", "&returnUrl=https://foreign.example.test")) {
            send("GET", availability + invalid, null, Map.of(), 400);
        }
        send("GET", "/auth-url?tenantCode=im-login-tenant&purpose=BIND", null, Map.of(), 400);
        send("POST", "/availability", "{}", Map.of(), 405);
        send("GET", "/totp", null, Map.of(), 405);
        HttpResponse<String> failedCallback = send("GET", "/callback?code=private-test-code&state=bad", null, Map.of(), 303);
        location(failedCallback, properties.getPublicUrl() + "/login?im=error");
        check(!failedCallback.body().contains("private-test-code"), "invalid callback never echoes provider code");
        resetLimit.run();
        Attempt success = begin("SCAN_LOGIN");
        HttpResponse<String> completed = callback(success, 303);
        location(completed, properties.getPublicUrl() + "/dashboard");
        String token = cookies(completed).get("Authorization");
        check(token != null && tokens.getLoginUserByToken(token) != null, "real MVC callback issues valid local session");
        check(completed.body().isEmpty(), "callback body contains no token or external identity");
        location(callback(success, 303), properties.getPublicUrl() + "/login?im=error");
        tokens.deleteToken(token);

        resetLimit.run();
        Attempt revoked = begin("EMBEDDED_LOGIN");
        jdbc.update("UPDATE sys_tenant SET effective_menu_ids='[2]' WHERE tenant_id=?", account.tenantId());
        try { check(!cookies(callback(revoked, 303)).containsKey("Authorization"), "package removal after authorization prevents callback login"); }
        finally { restorePackage(jdbc, account); }

        resetLimit.run();
        Attempt responseFailure = begin("SCAN_LOGIN");
        FAIL_LOCATION.set(true);
        HttpResponse<String> rolledBack = callback(responseFailure, 303);
        location(rolledBack, properties.getPublicUrl() + "/login?im=error");
        List<String> issued = rolledBack.headers().allValues("set-cookie").stream().filter(value -> value.startsWith("Authorization=")).toList();
        check(issued.size() == 2, "post-signing redirect fault publishes explicit cookie cancellation");
        String revokedToken = issued.get(0).split(";", 2)[0].substring("Authorization=".length());
        check(tokens.getLoginUserByToken(revokedToken) == null, "post-signing redirect failure revokes candidate token");

        jdbc.update("INSERT INTO sys_user_totp(tenant_id,user_id,secret_ciphertext,enabled,enabled_at) VALUES(?,?,?,1,NOW())", account.tenantId(), account.userId(), encryptedTotp);
        resetLimit.run();
        Attempt enrolled = begin("SCAN_LOGIN");
        HttpResponse<String> pending = callback(enrolled, 303);
        location(pending, properties.getPublicUrl() + "/login?im=totp");
        Map<String, String> proofs = new LinkedHashMap<>(enrolled.cookies()); proofs.putAll(cookies(pending));
        check(!proofs.containsKey("Authorization") && proofs.containsKey("__Host-CloudFlowIMMfa"), "pending MFA carries only HttpOnly proof");
        String mfaHeader = pending.headers().allValues("set-cookie").stream().filter(value -> value.startsWith("__Host-CloudFlowIMMfa=")).findFirst().orElseThrow();
        check(mfaHeader.contains("Secure") && mfaHeader.contains("HttpOnly") && mfaHeader.contains("SameSite=Strict") && !mfaHeader.contains("Domain="), "MFA cookie secure host-only and Strict");
        HttpResponse<String> verified = send("POST", "/totp", JSON.writeValueAsString(Map.of("code", code.get())), proofs, 200);
        check(data(verified).size() == 1 && data(verified).path("redirectUrl").asText().equals(properties.getPublicUrl() + "/dashboard"), "MFA JSON exposes only local redirect");
        String mfaToken = cookies(verified).get("Authorization");
        check(mfaToken != null && tokens.getLoginUserByToken(mfaToken) != null, "real HTTP TOTP returns authenticated cookie");
        check(cookies(verified).get("__Host-CloudFlowIMMfa").isEmpty(), "MFA proof cookie cleared");
        send("POST", "/totp", JSON.writeValueAsString(Map.of("code", code.get())), proofs, 400);
        tokens.deleteToken(mfaToken);
        for (String invalid : List.of("{}", "[]", "{\"code\":123456}", "{\"code\":\"123456\",\"code\":\"654321\"}", "{\"code\":\"123456\"}{}", "{\"code\":\"123456\",\"userId\":1}", " ".repeat(1025))) {
            send("POST", "/totp", invalid, proofs, 400);
        }
        resetLimit.run();
        Attempt waiting = begin("SCAN_LOGIN");
        Map<String, String> removedProofs = new LinkedHashMap<>(waiting.cookies()); removedProofs.putAll(cookies(callback(waiting, 303)));
        jdbc.update("UPDATE sys_tenant SET effective_menu_ids='[2]' WHERE tenant_id=?", account.tenantId());
        try { send("POST", "/totp", JSON.writeValueAsString(Map.of("code", code.get())), removedProofs, 403); }
        finally { restorePackage(jdbc, account); }
    }

    private static Attempt begin(String purpose) throws Exception {
        HttpResponse<String> response = send("GET", "/auth-url?tenantCode=im-login-tenant&purpose=" + purpose, null, Map.of(), 200);
        URI authorization = URI.create(data(response).path("authorizationUrl").asText());
        check(authorization.getHost().equals(purpose.equals("SCAN_LOGIN") ? "open.work.weixin.qq.com" : "open.weixin.qq.com"), "real SDK uses expected provider host");
        String state = null;
        for (String part : authorization.getRawQuery().split("&")) if (part.startsWith("state=")) state = URLDecoder.decode(part.substring(6), StandardCharsets.UTF_8);
        check(state != null && state.length() == 43, "one-time state created");
        return new Attempt(state, cookies(response));
    }

    private static HttpResponse<String> callback(Attempt attempt, int expected) throws Exception {
        return send("GET", "/callback?state=" + attempt.state() + "&code=private-test-code", null, attempt.cookies(), expected);
    }

    private static HttpResponse<String> send(String method, String path, String body, Map<String, String> cookies, int expected) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(origin.resolve("/im/WECOM" + path)).timeout(Duration.ofSeconds(15))
                .header("X-Forwarded-Proto", "https").header("X-Forwarded-For", "198.18.0." + (++requests)).header("Origin", properties.getPublicUrl());
        if (!cookies.isEmpty()) builder.header("Cookie", String.join("; ", cookies.entrySet().stream().filter(entry -> !entry.getValue().isEmpty()).map(entry -> entry.getKey() + "=" + entry.getValue()).toList()));
        if (body != null) builder.header("Content-Type", "application/json");
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        HttpResponse<String> response = HTTP.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        check(response.statusCode() == expected, "HTTP " + method + " route=" + path.split("\\?", 2)[0] + " expected=" + expected + " actual=" + response.statusCode());
        if (expected != 405) {
            check(response.headers().firstValue("cache-control").orElse("").equals("no-store"), "controller response never cached");
            check(response.headers().firstValue("referrer-policy").orElse("").equals("no-referrer"), "controller never forwards callback URL as referrer");
        }
        return response;
    }

    private static Map<String, String> cookies(HttpResponse<String> response) {
        Map<String, String> result = new LinkedHashMap<>();
        for (String header : response.headers().allValues("set-cookie")) {
            String[] cookie = header.split(";", 2)[0].split("=", 2); result.put(cookie[0], cookie[1]);
        }
        return result;
    }
    private static JsonNode data(HttpResponse<String> response) throws Exception { return JSON.readTree(response.body()).path("data"); }
    private static void location(HttpResponse<String> response, String expected) { check(response.headers().firstValue("location").orElse("").equals(expected), "only fixed approved redirect destination"); }
    private static void restorePackage(JdbcTemplate jdbc, ImLoginAccounts.Account account) { jdbc.update("UPDATE sys_tenant SET effective_menu_ids='[2,1788]' WHERE tenant_id=?", account.tenantId()); }
    private static void inject(Object target, String name, Object value) {
        try { Field field = target.getClass().getDeclaredField(name); field.setAccessible(true); field.set(target, value); }
        catch (ReflectiveOperationException failure) { throw new AssertionError(failure); }
    }
    private static void check(boolean success, String message) { assertions++; if (!success) throw new AssertionError(message); }
    private record Attempt(String state, Map<String, String> cookies) { }
}
