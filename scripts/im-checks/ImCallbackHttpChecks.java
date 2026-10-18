package com.cloudflow.auth.im;

import cn.dev33.satoken.SaManager;
import cn.dev33.satoken.context.SaTokenContext;
import cn.dev33.satoken.spring.SaTokenContextForSpringInJakartaServlet;
import com.cloudflow.auth.controller.ImCallbackController;
import com.cloudflow.auth.mapper.ImCallbackMapper;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.GlobalExceptionHandler;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.security.config.SecurityWebMvcConfig;
import com.cloudflow.common.security.interceptor.UserContextInterceptor;
import com.cloudflow.common.security.oauth2.OAuthRequestInterceptor;
import com.cloudflow.common.security.portal.PortalRequestInterceptor;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.TenantInterceptor;
import jakarta.servlet.Filter;
import java.lang.reflect.Field;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import me.chanjar.weixin.common.util.crypto.SHA1;
import me.chanjar.weixin.cp.util.crypto.WxCpCryptUtil;
import org.apache.catalina.Context;
import org.apache.catalina.Wrapper;
import org.apache.catalina.startup.Tomcat;
import org.apache.tomcat.util.descriptor.web.FilterDef;
import org.apache.tomcat.util.descriptor.web.FilterMap;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.redisson.spring.data.connection.RedissonConnectionFactory;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.DispatcherServlet;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

final class ImCallbackHttpChecks {
    private static ImCallbackController controller;
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
    private final JdbcTemplate jdbc;
    private final ImProperties properties;
    private final WeComCredentials credentials;
    private final AtomicBoolean failAudit;
    private URI origin;
    private int requests;
    private int assertions;
    private StringRedisTemplate redis;
    private final AtomicBoolean failLimit = new AtomicBoolean();

    ImCallbackHttpChecks(JdbcTemplate jdbc, ImProperties properties, WeComCredentials credentials, AtomicBoolean failAudit) {
        this.jdbc = jdbc; this.properties = properties; this.credentials = credentials; this.failAudit = failAudit;
    }

    @Configuration(proxyBeanMethods = false)
    @EnableWebMvc
    public static class WebConfiguration implements WebMvcConfigurer {
        @Bean public ImCallbackController controller() { return controller; }
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

    void run(ImDatabase database, ImCallbackMapper mapper, ImConfigRules rules, ImCallbackInbox inbox, SysAuditLogMapper audits) throws Exception {
        int port = Integer.parseInt(System.getenv("IM_CHECK_REDIS_PORT"));
        String password = System.getenv("IM_CHECK_REDIS_PASSWORD");
        if (port <= 1024 || port >= 65536 || password == null || password.isBlank()) throw new AssertionError("Owned Redis required");
        Config configuration = new Config();
        configuration.useSingleServer().setAddress("redis://127.0.0.1:" + port).setPassword(password).setConnectionPoolSize(4).setConnectionMinimumIdleSize(1);
        RedissonClient client = Redisson.create(configuration);
        redis = new StringRedisTemplate(new RedissonConnectionFactory(client));
        List<String> ownedKeys = List.of(ImCallbackLimits.key("198.51.100.7"), ImCallbackLimits.key("198.51.100.8"));
        for (String key : ownedKeys) {
            if (Boolean.TRUE.equals(redis.hasKey(key))) { client.shutdown(); throw new AssertionError("Callback test limit keys must be unused"); }
        }
        StringRedisTemplate controlled = new StringRedisTemplate() {
            @Override public <Result> Result execute(RedisScript<Result> script, List<String> keys, Object... arguments) {
                if (failLimit.get()) throw new IllegalStateException("callback-limit-private-failure");
                return redis.execute(script, keys, arguments);
            }
        };
        controller = new ImCallbackController(new ImCallbackEndpoint(database, mapper, rules, inbox, audits, new ImCallbackLimits(controlled)));
        SaTokenContext previous = SaManager.getSaTokenContext();
        SaManager.setSaTokenContext(new SaTokenContextForSpringInJakartaServlet());
        IpUtils.setTrustedProxies(List.of("127.0.0.1/32"));
        Tomcat server = new Tomcat();
        AnnotationConfigWebApplicationContext web = new AnnotationConfigWebApplicationContext();
        try {
            Path temporary = Path.of(System.getProperty("java.io.tmpdir")).toAbsolutePath().normalize();
            check(!temporary.getRoot().toString().equalsIgnoreCase(System.getenv("SystemDrive") + "\\"), "data drive required");
            Path directory = Files.createTempDirectory(temporary, "g4-im-callback-http-");
            server.setBaseDir(directory.resolve("tomcat").toString()); server.setPort(0);
            server.getConnector().setProperty("address", "127.0.0.1");
            Context context = server.addContext("", directory.toString()); context.setParentClassLoader(ImCallbackHttpChecks.class.getClassLoader());
            Filter boundary = (request, response, chain) -> {
                TenantContext.setTenantSkip();
                try { chain.doFilter(request, response); }
                finally { UserContext.clear(); TenantContext.clear(); }
            };
            FilterDef definition = new FilterDef(); definition.setFilterName("owned-callback-boundary"); definition.setFilter(boundary); context.addFilterDef(definition);
            FilterMap mapping = new FilterMap(); mapping.setFilterName(definition.getFilterName()); mapping.addURLPattern("/*"); context.addFilterMap(mapping);
            web.register(WebConfiguration.class);
            Wrapper servlet = Tomcat.addServlet(context, "im-callback", new DispatcherServlet(web)); servlet.setLoadOnStartup(1); context.addServletMappingDecoded("/", "im-callback");
            server.start(); origin = URI.create("http://127.0.0.1:" + server.getConnector().getLocalPort());
            cases();
            System.out.println("G4_IM_CALLBACK_HTTP: assertions=" + assertions + "; requests=" + requests
                    + "; failed=0; real_spring_mvc=true; real_security_web_mvc_config=true; real_mysql=true; real_transactions=true; actual_sdk_crypto=true; durable_receipt=true; real_redis_limit=true; redis_aspects=false; workflow_action=false; vendor_service=false");
        } finally {
            try { server.stop(); server.destroy(); web.close(); }
            finally {
                try { redis.delete(ownedKeys); }
                finally { client.shutdown(); SaManager.setSaTokenContext(previous); IpUtils.setTrustedProxies(List.of()); controller = null; }
            }
        }
    }

    private void cases() throws Exception {
        long configId = credentials.configId();
        String base = "/im/callback/" + configId;
        Payload echo = encrypted("callback-echo-private");
        String echoPath = base + echo.query() + "&echostr=" + URLEncoder.encode(echo.encrypted(), StandardCharsets.UTF_8);
        check("callback-echo-private".equals(send("GET", echoPath, null, "https", "198.51.100.7", 200).body()), "URL verification returns only decrypted echo");
        jdbc.update("UPDATE sys_im_config SET todo_enabled=0 WHERE config_id=?", configId);
        try { send("GET", echoPath, null, "https", "198.51.100.7", 200); }
        finally { jdbc.update("UPDATE sys_im_config SET todo_enabled=1 WHERE config_id=?", configId); }
        Payload event = card(10);
        long before = count();
        HttpResponse<String> received = send("POST", base + event.query(), event.body(), "https", "198.51.100.7", 200);
        check("success".equals(received.body()) && count() == before + 1, "success follows persisted receipt");
        check(jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_callback_event WHERE config_id=? AND tenant_id=? AND source_ip='198.51.100.7' AND status='RECEIVED' AND im_user_id='callback-member-private'", Integer.class, configId, credentials.tenantId()) == 1,
                "forged headers cookies and tenant skip cannot replace verified sender or tenant");
        send("POST", base + event.query(), event.body(), "https", "198.51.100.7", 200);
        check(count() == before + 1, "provider duplicate persists once");
        redis.delete(ImCallbackLimits.key("198.51.100.7"));
        send("POST", base + event.query(), event.body(), "https", "198.51.100.7", 200);
        check(count() == before + 1, "clearing only owned Redis counter preserves database callback deduplication");
        Payload bad = new Payload(event.query().replaceFirst("msg_signature=[a-f0-9]{40}", "msg_signature=" + "0".repeat(40)), event.encrypted());
        send("POST", base + bad.query(), event.body(), "https", "198.51.100.7", 400);
        check(jdbc.queryForObject("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=? AND audit_name='IM_CALLBACK_INVALID' AND audit_field=?", Integer.class,
                credentials.tenantId(), "im_callback_config:" + configId) == 1, "invalid signature audited with no receipt");
        check(count() == before + 1, "bad signature creates no callback record");
        for (String suffix : List.of("&tenantId=100000", "&userId=1", "&nonce=duplicate")) send("POST", base + event.query() + suffix, event.body(), "https", "198.51.100.7", 400);
        send("POST", base + event.query(), event.body(), "http", "198.51.100.7", 403);
        send("POST", base + event.query(), event.body(), "https", "198.51.100.7,192.0.2.1", 403);
        IpUtils.setTrustedProxies(List.of());
        try { send("POST", base + event.query(), event.body(), "https", "198.51.100.7", 403); }
        finally { IpUtils.setTrustedProxies(List.of("127.0.0.1/32")); }
        send("POST", base + event.query(), "<xml><Encrypt>invalid</Encrypt></xml>", "https", "198.51.100.7", 400);
        send("POST", base + event.query(), "x".repeat(ImCallbackXml.MAX_BYTES + 1), "https", "198.51.100.7", 400);
        send("POST", "/im/callback/992899" + event.query(), event.body(), "https", "198.51.100.7", 400);
        jdbc.update("UPDATE sys_im_config SET todo_enabled=0 WHERE config_id=?", configId);
        try { send("POST", base + event.query(), event.body(), "https", "198.51.100.7", 503); }
        finally { jdbc.update("UPDATE sys_im_config SET todo_enabled=1 WHERE config_id=?", configId); }
        properties.setEnabled(false);
        try { send("POST", base + event.query(), event.body(), "https", "198.51.100.7", 503); }
        finally { properties.setEnabled(true); }
        jdbc.update("UPDATE sys_tenant SET status='1' WHERE tenant_id=?", credentials.tenantId());
        try { send("POST", base + event.query(), event.body(), "https", "198.51.100.7", 503); }
        finally { jdbc.update("UPDATE sys_tenant SET status='0' WHERE tenant_id=?", credentials.tenantId()); }
        Payload retry = card(11);
        before = count();
        failAudit.set(true);
        try { send("POST", base + retry.query(), retry.body(), "https", "198.51.100.7", 503); }
        finally { failAudit.set(false); }
        check(count() == before, "storage failure never acknowledges accepted receipt");
        send("POST", base + retry.query(), retry.body(), "https", "198.51.100.7", 200);
        check(count() == before + 1, "provider retry accepts once after storage recovery");
        failLimit.set(true);
        try { send("POST", base + retry.query(), retry.body(), "https", "198.51.100.7", 503); }
        finally { failLimit.set(false); }
        check(count() == before + 1, "Redis unavailability fails closed without another receipt");
        for (int index = 0; index < 120; index++) {
            if (index % 2 == 0) send("GET", echoPath, null, "https", "198.51.100.8", 200);
            else send("POST", base + event.query(), event.body(), "https", "198.51.100.8", 200);
        }
        send("POST", base + event.query(), event.body(), "https", "198.51.100.8", 429);
        Long remaining = redis.getExpire(ImCallbackLimits.key("198.51.100.8"));
        check(remaining != null && remaining > 0 && remaining <= 60, "combined echo and event counter expires within sixty seconds");
        check(jdbc.queryForObject("SELECT COUNT(*) FROM sys_audit_log WHERE create_by='im-callback' AND (after_val LIKE '%callback-member-private%' OR after_val LIKE '%response-private%' OR after_val LIKE '%callbackTokenPrivate%')", Integer.class) == 0,
                "audit excludes callback contents and secrets");
    }

    private Payload card(int delta) {
        String plain = "<xml><ToUserName>" + credentials.corpId() + "</ToUserName><FromUserName>callback-member-private</FromUserName><CreateTime>"
                + (Instant.now().getEpochSecond() + delta) + "</CreateTime><MsgType>event</MsgType><Event>template_card_event</Event><EventKey>APPROVE</EventKey><TaskId>"
                + "k".repeat(43) + "</TaskId><CardType>button_interaction</CardType><AgentID>" + credentials.agentId() + "</AgentID><ResponseCode>response-private</ResponseCode></xml>";
        return encrypted(plain);
    }

    private Payload encrypted(String plain) {
        String encrypted = new WxCpCryptUtil(credentials.sdkConfiguration()).encrypt("0123456789abcdef", plain);
        String timestamp = Long.toString(Instant.now().getEpochSecond());
        return new Payload("?msg_signature=" + SHA1.gen(credentials.callbackToken(), timestamp, "callbackNonce", encrypted)
                + "&timestamp=" + timestamp + "&nonce=callbackNonce", encrypted);
    }

    private HttpResponse<String> send(String method, String path, String body, String proto, String address, int status) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(origin.resolve(path)).timeout(Duration.ofSeconds(15))
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body))
                .header("Content-Type", "application/xml; charset=UTF-8").header("X-Forwarded-Proto", proto).header("X-Forwarded-For", address)
                .header("Authorization", "Bearer forged-account").header("Cookie", "Authorization=forged-account; __Host-CloudFlowIM=forged")
                .header("X-User-Id", "1").header("X-User-Tenant-Id", "100000").header("X-Tenant-Id", "100000")
                .header("X-Inner-Call", "true").header("X-From-Service", "forged").build();
        HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString()); requests++;
        check(response.statusCode() == status, "callback HTTP expected=" + status + " actual=" + response.statusCode() + " request=" + requests);
        check("no-store".equals(response.headers().firstValue("cache-control").orElse(null)), "callback never cached");
        check("no-referrer".equals(response.headers().firstValue("referrer-policy").orElse(null)), "callback no referrer");
        if (status != 200) check("failed".equals(response.body()), "callback failure reveals no cause or parameters");
        return response;
    }

    private long count() { return jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_callback_event WHERE config_id=?", Long.class, credentials.configId()); }
    private void check(boolean value, String message) { assertions++; if (!value) throw new AssertionError(message); }
    private static void inject(Object target, String name, Object value) {
        try { Field field = target.getClass().getDeclaredField(name); field.setAccessible(true); field.set(target, value); }
        catch (ReflectiveOperationException failure) { throw new IllegalStateException("HTTP_CHECK_SETUP_FAILED"); }
    }
    private record Payload(String query, String encrypted) {
        String body() { return "<xml><Encrypt><![CDATA[" + encrypted + "]]></Encrypt></xml>"; }
        @Override public String toString() { return "Payload[redacted]"; }
    }
}
