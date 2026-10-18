package com.cloudflow.auth.im;

import cn.dev33.satoken.SaManager;
import cn.dev33.satoken.context.SaTokenContext;
import cn.dev33.satoken.interceptor.SaInterceptor;
import cn.dev33.satoken.spring.SaTokenContextForSpringInJakartaServlet;
import cn.dev33.satoken.stp.StpInterface;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.auth.controller.system.ImConfigController;
import com.cloudflow.auth.controller.system.ImSyncController;
import com.cloudflow.common.core.exception.GlobalExceptionHandler;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.Filter;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Consumer;
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

public final class ImSyncHttpChecks {
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static ImConfigService configs;
    private static ImScopeService scopes;
    private static ImSyncService sync;
    private static int assertions;
    private static int requests;
    private static URI origin;
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();

    @Configuration(proxyBeanMethods = false)
    @EnableWebMvc
    public static class WebConfiguration implements WebMvcConfigurer {
        @Bean public ImConfigController configController() { return new ImConfigController(configs, scopes); }
        @Bean public ImSyncController syncController() { return new ImSyncController(sync); }
        @Bean public GlobalExceptionHandler errors() { return new GlobalExceptionHandler(); }
        @Override public void addInterceptors(InterceptorRegistry registry) { registry.addInterceptor(new SaInterceptor()); }
    }

    static void run(ImConfigService configService, ImScopeService scopeService, ImSyncService syncService,
            ImDatabase database, JdbcTemplate jdbc, Consumer<String> bindToken, long configId, int version,
            String admin, String employee, String otherAdmin) throws Exception {
        configs = configService; scopes = scopeService; sync = syncService;
        SaTokenContext previousContext = SaManager.getSaTokenContext();
        StpInterface previousPermissions = SaManager.getStpInterface();
        SaManager.setSaTokenContext(new SaTokenContextForSpringInJakartaServlet());
        SaManager.setStpInterface(new StpInterface() {
            @Override public List<String> getPermissionList(Object loginId, String loginType) {
                Object details = StpUtil.getSessionByLoginId(loginId).get(TokenService.LOGIN_USER_SESSION_KEY);
                if (!(details instanceof Map<?, ?> values)) return List.of();
                long tenantId = Long.parseLong(String.valueOf(values.get("tenantId")));
                long userId = Long.parseLong(String.valueOf(loginId));
                return database.read(tenantId, mapper -> mapper.permissions(tenantId, userId)).stream()
                        .flatMap(value -> Arrays.stream(value.split(","))).map(String::trim).filter(value -> !value.isBlank()).toList();
            }
            @Override public List<String> getRoleList(Object loginId, String loginType) { return List.of(); }
        });
        Path temporary = Path.of(System.getProperty("java.io.tmpdir")).toRealPath();
        check(!temporary.getRoot().toString().equalsIgnoreCase(System.getenv("SystemDrive") + "\\"), "data drive required");
        Path directory = Files.createTempDirectory(temporary, "g4-im-sync-http-");
        AnnotationConfigWebApplicationContext web = new AnnotationConfigWebApplicationContext();
        web.register(WebConfiguration.class);
        Tomcat server = new Tomcat();
        server.setBaseDir(directory.resolve("tomcat").toString());
        server.setPort(0);
        server.getConnector().setProperty("address", "127.0.0.1");
        Context context = server.addContext("", directory.toString());
        context.setParentClassLoader(ImSyncHttpChecks.class.getClassLoader());
        Filter identity = (request, response, chain) -> {
            bindToken.accept(((HttpServletRequest) request).getHeader(SaManager.getConfig().getTokenName()));
            try { chain.doFilter(request, response); }
            finally { bindToken.accept(null); TenantContext.clear(); }
        };
        FilterDef definition = new FilterDef();
        definition.setFilterName("owned-im-token"); definition.setFilter(identity); context.addFilterDef(definition);
        FilterMap mapping = new FilterMap();
        mapping.setFilterName(definition.getFilterName()); mapping.addURLPattern("/*"); context.addFilterMap(mapping);
        Wrapper servlet = Tomcat.addServlet(context, "im-sync", new DispatcherServlet(web));
        servlet.setLoadOnStartup(1); context.addServletMappingDecoded("/", "im-sync");
        try {
            server.start();
            origin = URI.create("http://127.0.0.1:" + server.getConnector().getLocalPort());
            String previewPath = "/system/im/config/" + configId + "/sync-preview";
            String remotePath = "/system/im/config/" + configId + "/remote-departments";
            String body = "{\"version\":" + version + "}";
            long before = jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_sync_run", Long.class);
            JsonNode overview = request("GET", "/system/im/sync/configurations", null, admin, 200);
            check(overview.path("configurations").get(0).path("configId").asLong() == configId, "HTTP configuration summary");
            JsonNode local = request("GET", "/system/im/config/local-departments?pageNum=1&pageSize=1", null, admin, 200);
            check(local.path("rows").size() == 1 && local.path("rows").get(0).size() == 3, "HTTP minimal local page");
            JsonNode remote = request("POST", remotePath, body, admin, 200);
            check(remote.path("departments").size() == 1 && remote.path("departments").get(0).path("id").asLong() == 2, "HTTP actual protocol departments");
            check(jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_sync_run", Long.class) == before, "HTTP candidates write no preview");
            JsonNode preview = request("POST", previewPath, body, admin, 200);
            long runId = preview.path("header").path("syncRunId").asLong();
            check(runId > 0 && preview.path("header").path("status").asText().equals("PREVIEWED"), "HTTP preview persisted");
            check(jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_sync_run", Long.class) == before + 1, "HTTP exactly one preview row");
            check(jdbc.queryForObject("SELECT snapshot_encrypted IS NOT NULL AND full_snapshot_flag=1 FROM sys_im_sync_run WHERE sync_run_id=?", Boolean.class, runId), "HTTP encrypted complete snapshot");
            JsonNode report = request("GET", "/system/im/sync/" + runId + "?pageNum=1&pageSize=1", null, admin, 200);
            check(report.path("entries").path("rows").size() == 1 && report.path("entries").path("total").asLong() >= 2, "HTTP report pagination");
            JsonNode list = request("GET", "/system/im/sync/list?configId=" + configId + "&pageNum=1&pageSize=1", null, admin, 200);
            check(list.path("rows").size() == 1 && list.path("total").asLong() > 0, "HTTP batch pagination");
            request("POST", previewPath, "{}", admin, 400);
            request("POST", previewPath, "{\"version\":-1}", admin, 400);
            request("GET", "/system/im/sync/configurations", null, null, 401);
            request("GET", "/system/im/sync/configurations", null, employee, 403);
            request("POST", previewPath, body, employee, 403);
            request("POST", remotePath, body, employee, 403);
            request("GET", "/system/im/config/local-departments", null, employee, 403);
            request("GET", "/system/im/sync/" + runId, null, employee, 403);
            request("GET", "/system/im/sync/" + runId, null, otherAdmin, 404);
            request("POST", previewPath, body, otherAdmin, 404);
            request("POST", remotePath, body, otherAdmin, 404);
            check(jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_sync_run", Long.class) == before + 1, "HTTP denied requests write no previews");
            System.out.println("G4_IM_SYNC_HTTP: assertions=" + assertions + "; failed=0; requests=" + requests
                    + "; real_spring_controllers=true; real_satoken_interceptor=true; real_mysql=true; real_loopback_vendor_protocol=true; business_results_mocked=false; redis_aspects=false; vendor_service=false; production_modified=false");
        } finally {
            try { server.stop(); }
            finally {
                server.destroy(); web.close();
                SaManager.setSaTokenContext(previousContext); SaManager.setStpInterface(previousPermissions);
                configs = null; scopes = null; sync = null;
            }
        }
    }

    private static JsonNode request(String method, String path, String body, String token, int expected) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(origin.resolve(path)).timeout(Duration.ofSeconds(20));
        if (token != null) builder.header(SaManager.getConfig().getTokenName(), token);
        if (body != null) builder.header("Content-Type", "application/json");
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
        HttpResponse<String> response = HTTP.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        requests++;
        check(response.statusCode() == expected, method + " " + path + " expected=" + expected + " actual=" + response.statusCode());
        JsonNode result = JSON.readTree(response.body());
        check(result.path("code").asInt() == expected, "HTTP result code");
        for (String secret : List.of("13988000000", "preview-0@example.test", "config-test-access-token-never-log", ImConfigChecks.APP_SECRET, "im1:")) {
            check(!response.body().contains(secret), "HTTP sensitive sample hidden");
        }
        if (expected == 200) {
            check(Objects.equals(response.headers().firstValue("Cache-Control").orElse(null), "no-store"), "HTTP no-store");
            check(Objects.equals(response.headers().firstValue("X-Content-Type-Options").orElse(null), "nosniff"), "HTTP nosniff");
        }
        return result.path("data");
    }

    private static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
}
