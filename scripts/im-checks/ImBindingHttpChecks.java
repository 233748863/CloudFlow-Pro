package com.cloudflow.auth.im;

import cn.dev33.satoken.SaManager;
import cn.dev33.satoken.config.SaTokenConfig;
import cn.dev33.satoken.context.SaTokenContext;
import cn.dev33.satoken.spring.SaTokenContextForSpringInJakartaServlet;
import cn.dev33.satoken.stp.StpInterface;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.auth.controller.ImBindingCallbackController;
import com.cloudflow.auth.controller.ImBindingController;
import com.cloudflow.auth.controller.system.ImBindingManagementController;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.GlobalExceptionHandler;
import com.cloudflow.common.core.permission.TenantPermissionPolicy;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.security.config.SecurityWebMvcConfig;
import com.cloudflow.common.security.cookie.AuthCookieSupport;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.security.handler.SaTokenExceptionHandler;
import com.cloudflow.common.security.interceptor.UserContextInterceptor;
import com.cloudflow.common.security.oauth2.OAuthRequestInterceptor;
import com.cloudflow.common.security.portal.PortalRequestInterceptor;
import com.cloudflow.common.security.service.CurrentPermissionService;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.TenantInterceptor;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.Filter;
import jakarta.servlet.http.HttpServletRequest;
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
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

final class ImBindingHttpChecks {
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
    private static final String BASE = "/system/im/binding/mine";
    private static final String CALLBACK = "/im/WECOM/binding-callback";
    private static final String CSRF = ImLoginChallenges.randomToken();
    private static ImBindingController controller;
    private static ImBindingCallbackController callback;
    private static ImBindingManagementController management;
    private static CurrentPermissionService permissions;
    private static TokenService tokens;
    private final ImProperties properties;
    private final JdbcTemplate jdbc;
    private final Consumer<String> owned;
    private final Runnable reset;
    private final long tenantId;
    private final long userId;
    private final String token;
    private final String alternate;
    private final String password;
    private final String address;
    private URI origin;
    private int assertions;
    private int requests;

    @Configuration(proxyBeanMethods = false)
    @EnableWebMvc
    public static class WebConfiguration implements WebMvcConfigurer {
        @Bean public ImBindingController bindingController() { return controller; }
        @Bean public ImBindingCallbackController callbackController() { return callback; }
        @Bean public ImBindingManagementController managementController() { return management; }
        @Bean public GlobalExceptionHandler errors() { return new GlobalExceptionHandler(); }
        @Bean public SaTokenExceptionHandler tokenErrors() { return new SaTokenExceptionHandler(); }
        @Override public void addInterceptors(InterceptorRegistry registry) {
            UserContextInterceptor userContext = new UserContextInterceptor();
            inject(userContext, "tokenService", tokens); inject(userContext, "currentPermissions", permissions);
            SecurityWebMvcConfig security = new SecurityWebMvcConfig();
            inject(security, "userContextInterceptor", userContext); inject(security, "tenantInterceptor", new TenantInterceptor());
            inject(security, "portalRequestInterceptor", new PortalRequestInterceptor(null, null, null, null, null));
            inject(security, "oauthRequestInterceptor", new OAuthRequestInterceptor(null, null, null));
            security.addInterceptors(registry);
        }
    }

    ImBindingHttpChecks(ImProperties properties, JdbcTemplate jdbc, Consumer<String> owned, Runnable reset,
            long tenantId, long userId, String token, String alternate, String password, String address) {
        this.properties = properties; this.jdbc = jdbc; this.owned = owned; this.reset = reset; this.tenantId = tenantId;
        this.userId = userId; this.token = token; this.alternate = alternate; this.password = password; this.address = address;
    }

    void run(ImBindingAccounts accounts, ImBindingIdentity identities, ImBindingFlow flow, ImLoginRequests loginRequests,
            ImDatabase database, TenantPermissionPolicy policy, Consumer<String> currentToken, ImBindingManagement managementService) throws Exception {
        controller = new ImBindingController(accounts, identities, flow, loginRequests, new ImBindingHttp(properties, JSON));
        callback = new ImBindingCallbackController(flow, new ImLoginRedirects(properties));
        management = new ImBindingManagementController(managementService, identities, new ImBindingHttp(properties, JSON), loginRequests);
        permissions = new CurrentPermissionService(policy);
        tokens = new TokenService() {
            @Override public Map<String, Object> verifyToken(String supplied) {
                Map<String, Object> login = getLoginUserByToken(supplied);
                if (login == null) return null;
                Map<String, Object> result = new LinkedHashMap<>(login);
                result.put("permissions", SaManager.getStpInterface().getPermissionList(login.get("userId"), "login"));
                return result;
            }
        };
        SaTokenContext oldContext = SaManager.getSaTokenContext();
        SaTokenConfig oldConfig = SaManager.getConfig();
        StpInterface oldPermissions = SaManager.getStpInterface();
        SaManager.setConfig(new SaTokenConfig().setTokenName("Authorization").setIsPrint(false).setDataRefreshPeriod(-1));
        SaManager.setSaTokenContext(new SaTokenContextForSpringInJakartaServlet());
        SaManager.setStpInterface(new StpInterface() {
            @Override public List<String> getPermissionList(Object loginId, String loginType) {
                Object detail = StpUtil.getSessionByLoginId(loginId).get(TokenService.LOGIN_USER_SESSION_KEY);
                if (!(detail instanceof Map<?, ?> recorded)) return List.of();
                long tenant = Long.parseLong(recorded.get("tenantId").toString());
                long user = Long.parseLong(loginId.toString());
                List<String> granted = database.read(tenant, mapper -> mapper.permissions(tenant, user)).stream()
                        .flatMap(value -> Arrays.stream(value.split(","))).map(String::trim).toList();
                return List.copyOf(policy.intersect(tenant, granted));
            }
            @Override public List<String> getRoleList(Object loginId, String loginType) { return List.of(); }
        });
        IpUtils.setTrustedProxies(List.of("127.0.0.1/32"));
        Tomcat server = new Tomcat();
        AnnotationConfigWebApplicationContext web = new AnnotationConfigWebApplicationContext();
        try {
            Path temporary = Path.of(System.getProperty("java.io.tmpdir")).toRealPath();
            check(!temporary.getRoot().toString().equalsIgnoreCase(System.getenv("SystemDrive") + "\\"), "data drive required");
            Path directory = Files.createTempDirectory(temporary, "g4-im-binding-http-");
            server.setBaseDir(directory.resolve("tomcat").toString()); server.setPort(0);
            server.getConnector().setProperty("address", "127.0.0.1");
            Context context = server.addContext("", directory.toString()); context.setParentClassLoader(getClass().getClassLoader());
            Filter boundary = (request, response, chain) -> {
                currentToken.accept(AuthCookieSupport.resolveRawToken((HttpServletRequest) request));
                try { chain.doFilter(request, response); }
                finally { currentToken.accept(null); UserContext.clear(); TenantContext.clear(); }
            };
            FilterDef definition = new FilterDef(); definition.setFilterName("owned-binding-request"); definition.setFilter(boundary); context.addFilterDef(definition);
            FilterMap mapping = new FilterMap(); mapping.setFilterName(definition.getFilterName()); mapping.addURLPattern("/*"); context.addFilterMap(mapping);
            web.register(WebConfiguration.class);
            Wrapper servlet = Tomcat.addServlet(context, "binding-http", new DispatcherServlet(web)); servlet.setLoadOnStartup(1); context.addServletMappingDecoded("/", "binding-http");
            server.start(); origin = URI.create("http://127.0.0.1:" + server.getConnector().getLocalPort());
            cases();
            managementCases();
            System.out.println("G4_IM_BINDING_HTTP: assertions=" + assertions + "; requests=" + requests + "; failed=0; real_spring_mvc=true; real_security_web_mvc_config=true; real_mysql=true; real_redis=true; real_sa_token=true; csrf_checks=true; provider=fixture; redis_aspects=false; token_accessor=fixture; production_modified=false");
        } finally {
            try { server.stop(); server.destroy(); web.close(); }
            finally {
                SaManager.setSaTokenContext(oldContext); SaManager.setStpInterface(oldPermissions); SaManager.setConfig(oldConfig);
                IpUtils.setTrustedProxies(List.of()); currentToken.accept(token); controller = null; callback = null; management = null; tokens = null; permissions = null;
                jdbc.update("DELETE FROM sys_im_user_mapping WHERE tenant_id=?", tenantId);
            }
        }
    }

    private void cases() throws Exception {
        Map<String, String> own = new LinkedHashMap<>(Map.of("Authorization", token, "XSRF-TOKEN", CSRF));
        send("GET", BASE, null, Map.of(), Map.of(), 401);
        check(data(send("GET", BASE, null, own, Map.of(), 200)).path("canBind").asBoolean(), "real own overview enables only eligible new binding");
        send("GET", BASE + "?userId=1", null, own, Map.of(), 400);
        send("GET", BASE + "/pending", null, Map.of(), Map.of(), 401);
        check(data(send("GET", BASE + "/pending", null, own, Map.of(), 200)).isNull(), "missing external proof has no fabricated member");
        send("POST", BASE + "/authorization", "{}", own, Map.of(), 403);
        send("POST", BASE + "/identity", JSON.writeValueAsString(Map.of("password", password)), Map.of("Authorization", token), Map.of(), 403);
        send("POST", BASE + "/identity", "{}", own, Map.of("Origin", "https://foreign.example.test"), 403);
        send("POST", BASE + "/identity", "{}", own, Map.of("X-CSRF-Token", "wrong"), 403);
        send("POST", BASE + "/identity", "{}", own, Map.of("Sec-Fetch-Site", "cross-site"), 403);
        send("POST", BASE + "/identity", "{}", own, Map.of("Origin", ""), 403);
        send("POST", BASE + "/identity", "{}", own, Map.of("X-CSRF-Token", ""), 403);
        send("POST", BASE + "/identity?userId=1", "{}", own, Map.of(), 400);
        for (String header : List.of("Origin", "X-CSRF-Token", "Sec-Fetch-Site")) {
            String value = header.equals("Origin") ? properties.getPublicUrl() : header.equals("X-CSRF-Token") ? CSRF : "same-origin";
            send("POST", BASE + "/identity", "{}", own, Map.of(header, value), Map.of(header, value), 403);
        }
        send("POST", BASE + "/identity", "{}", own, Map.of(), Map.of("Cookie", "XSRF-TOKEN=" + CSRF), 403);
        for (String body : List.of("[]", "{}", "{\"password\":1}", "{\"password\":\"wrong\",\"userId\":1}", "{\"password\":\"a\",\"password\":\"b\"}", "{}{}", " ".repeat(4097))) {
            send("POST", BASE + "/identity", body, own, Map.of(), 400);
        }
        send("POST", BASE + "/identity", JSON.writeValueAsString(Map.of("password", password, "totpCode", 123456)), own, Map.of(), 400);
        properties.setEnabled(false);
        try { check(!data(send("GET", BASE, null, own, Map.of(), 200)).path("canBind").asBoolean(), "disabled deployment reports unavailable without fabricated success"); }
        finally { properties.setEnabled(true); }
        jdbc.update("UPDATE sys_menu SET status='1' WHERE menu_id=1789");
        try {
            check(!data(send("GET", BASE, null, own, Map.of(), 200)).path("canBind").asBoolean(), "read-only owner cannot start binding");
            send("GET", BASE + "/identity", null, own, Map.of(), 403);
            send("POST", BASE + "/confirm", "{}", own, Map.of(), 403);
        } finally { jdbc.update("UPDATE sys_menu SET status='0' WHERE menu_id=1789"); }
        JsonNode status = data(send("GET", BASE + "/identity", null, own, Map.of(), 200));
        check(!status.path("totpRequired").asBoolean(), "actual enrollment state exposed without secret");
        HttpResponse<String> verified = send("POST", BASE + "/identity", JSON.writeValueAsString(Map.of("password", password)), own, Map.of(), 200);
        check(data(verified).path("verified").asBoolean() && !verified.body().contains(password) && !verified.body().contains(token), "HTTP password verification returns only safe status");
        HttpResponse<String> grant = send("POST", BASE + "/authorization", "{}", own, Map.of(), 200);
        Map<String, String> browser = new LinkedHashMap<>(own); browser.putAll(cookies(grant));
        URI authorization = URI.create(data(grant).path("authorizationUrl").asText());
        String state = query(authorization, "state"); owned.accept(ImLoginChallenges.key(state));
        check(query(authorization, "redirect_uri").equals(properties.getPublicUrl() + "/api/auth/im/WECOM/binding-callback"), "HTTP authorization fixes binding callback");
        check(cookies(grant).containsKey("__Host-CloudFlowIM") && !cookies(grant).containsKey("Authorization"), "authorization never changes local login cookie");
        Map<String, String> anonymous = Map.of("__Host-CloudFlowIM", browser.get("__Host-CloudFlowIM"));
        HttpResponse<String> member = send("GET", CALLBACK + "?state=" + state + "&code=controlled-bind-code", null, anonymous, Map.of(), 303);
        check(member.headers().firstValue("location").orElse("").equals(properties.getPublicUrl() + "/workspace/im-bindings?imBinding=ready"), "anonymous binding callback returns only fixed safe status");
        check(member.body().isEmpty() && count() == 0, "HTTP callback neither writes mapping nor returns credentials");
        String memberCookie = member.headers().allValues("set-cookie").stream().filter(value -> value.startsWith("__Host-CloudFlowIMBinding=")).findFirst().orElseThrow();
        check(memberCookie.contains("Secure") && memberCookie.contains("HttpOnly") && memberCookie.contains("SameSite=Strict") && !memberCookie.contains("Domain="), "external proof cookie is host-only secure HttpOnly Strict");
        browser.putAll(cookies(member)); owned.accept(ImBindingMembers.key(browser.get("__Host-CloudFlowIMBinding")));
        check(cookies(member).size() == 1 && !memberCookie.contains(token), "callback never publishes local session");
        check(data(send("GET", BASE + "/pending", null, browser, Map.of(), 200)).path("externalAccount").asText().equals("Bind.Member"), "same owner previews actual external identity");
        Map<String, String> alternateCookies = new LinkedHashMap<>(browser); alternateCookies.put("Authorization", alternate);
        send("GET", BASE + "/pending", null, alternateCookies, Map.of(), 403);
        send("POST", BASE + "/confirm", "{\"userId\":1}", browser, Map.of(), 400);
        send("POST", BASE + "/confirm", "{}", browser, Map.of("X-CSRF-Token", "mismatch"), 403);
        jdbc.update("UPDATE sys_tenant SET package_id=?,package_version=0,effective_menu_ids='[2,1788]' WHERE tenant_id=?", tenantId, tenantId);
        try {
            send("GET", BASE + "/pending", null, browser, Map.of(), 403);
            send("POST", BASE + "/confirm", "{}", browser, Map.of(), 403);
            check(count() == 0, "package revocation after callback prevents final write");
        } finally { jdbc.update("UPDATE sys_tenant SET package_id=NULL,package_version=NULL,effective_menu_ids=NULL WHERE tenant_id=?", tenantId); }
        check(count() == 0, "invalid final submissions leave mapping unchanged");
        HttpResponse<String> committed = send("POST", BASE + "/confirm", "{}", browser, Map.of(), 200);
        check(count() == 1 && data(committed).path("bindType").asText().equals("SCAN_BIND"), "real authenticated POST commits exactly one own mapping");
        check(cookies(committed).get("__Host-CloudFlowIMBinding").isEmpty(), "successful submit clears external proof cookie");
        send("POST", BASE + "/confirm", "{}", browser, Map.of(), 403);
        check(data(send("GET", BASE, null, own, Map.of(), 200)).path("binding").path("externalAccount").asText().equals("Bind.Member"), "post-submit refresh reads actual binding");
        HttpResponse<String> replay = send("GET", CALLBACK + "?state=" + state + "&code=controlled-bind-code", null, anonymous, Map.of(), 303);
        check(replay.headers().firstValue("location").orElse("").endsWith("?imBinding=error"), "replayed callback cannot regenerate proof");
        for (String path : List.of(CALLBACK + "?state=bad&code=invalid", CALLBACK + "?state=bad&code=invalid&userId=1", CALLBACK + "?state=bad&state=bad&code=invalid")) {
            HttpResponse<String> response = send("GET", path, null, Map.of(), Map.of(), 303);
            check(response.headers().firstValue("location").orElse("").endsWith("?imBinding=error"), "invalid anonymous callback returns fixed error without identity");
        }
        unbind(own);
    }

    private void managementCases() throws Exception {
        String base = "/system/im/binding";
        Map<String, String> own = Map.of("Authorization", token, "XSRF-TOKEN", CSRF);
        long roleId = jdbc.queryForObject("SELECT role_id FROM sys_user_role WHERE tenant_id=? AND user_id=?", Long.class, tenantId, userId);
        long configId = jdbc.queryForObject("SELECT config_id FROM sys_im_config WHERE tenant_id=? AND im_type='WECOM'", Long.class, tenantId);
        send("GET", base + "/list", null, Map.of(), Map.of(), 401);
        send("GET", base + "/list", null, own, Map.of(), 403);
        send("POST", base + "/manage/unbind", "{}", own, Map.of(), 403);
        try {
            for (long menuId : List.of(1786L, 1787L)) jdbc.update("INSERT INTO sys_role_menu(role_id,tenant_id,menu_id) VALUES(?,?,?)", roleId, tenantId, menuId);
            send("GET", base + "/list", null, own, Map.of(), 403);
            jdbc.update("UPDATE sys_role SET role_key='admin' WHERE role_id=?", roleId);
            check(data(send("GET", base + "/list", null, own, Map.of(), 200)).path("total").asLong() == 0, "management list tenant isolation");
            send("GET", base + "/list?tenantId=100000", null, own, Map.of(), 400);
            send("GET", base + "/list?pageNum=0", null, own, Map.of(), 400);
            send("GET", base + "/list?pageSize=101", null, own, Map.of(), 400);
            jdbc.update("INSERT INTO sys_im_user_mapping(tenant_id,config_id,user_id,im_type,im_user_id,bind_type,bind_time,status,version) VALUES(?,?,?,'WECOM','Bind.Member','AUTO_SYNC',NOW(),'ACTIVE',0)", tenantId, configId, userId);
            JsonNode entry = data(send("GET", base + "/list", null, own, Map.of(), 200)).path("rows").get(0);
            long mappingId = entry.path("mappingId").asLong();
            String selection = JSON.writeValueAsString(Map.of("mappingId", mappingId, "version", 0));
            send("GET", base + "/manage/unknown/identity", null, own, Map.of(), 400);
            send("POST", base + "/manage/unbind", selection, own, Map.of(), 403);
            send("POST", base + "/manage/unbind/identity", JSON.writeValueAsString(Map.of("password", password)), own, Map.of("Origin", "https://foreign.example.test"), 403);
            send("POST", base + "/manage/unbind/identity", JSON.writeValueAsString(Map.of("password", password)), own, Map.of(), 200);
            for (String invalid : List.of("{}", "{\"mappingId\":1,\"version\":0,\"tenantId\":1}", "{\"mappingId\":1,\"version\":0,\"version\":1}", "{\"mappingId\":\"1\",\"version\":0}", "{\"mappingId\":1,\"version\":2147483648}")) {
                send("POST", base + "/manage/unbind", invalid, own, Map.of(), 400);
            }
            send("POST", base + "/manage/unbind", selection, own, Map.of("X-CSRF-Token", "wrong"), 403);
            send("POST", base + "/manage/unbind", selection, own, Map.of(), 200);
            entry = data(send("GET", base + "/list", null, own, Map.of(), 200)).path("rows").get(0);
            check(entry.path("status").asText().equals("DISABLED") && entry.path("canResume").asBoolean() && !entry.path("canUnbind").asBoolean(), "HTTP stop retains marker and offers resumption");
            send("POST", base + "/manage/unbind", selection, own, Map.of(), 403);
            String stopped = JSON.writeValueAsString(Map.of("mappingId", mappingId, "version", 1));
            send("POST", BASE + "/unbind/identity", JSON.writeValueAsString(Map.of("password", password)), own, Map.of(), 200);
            send("POST", base + "/manage/resume", stopped, own, Map.of(), 403);
            send("POST", BASE + "/unbind", stopped, own, Map.of(), 403);
            send("POST", base + "/manage/resume/identity", JSON.writeValueAsString(Map.of("password", password)), own, Map.of(), 200);
            send("POST", base + "/manage/resume", selection, own, Map.of(), 409);
            send("POST", base + "/manage/resume", stopped, own, Map.of(), 200);
            entry = data(send("GET", base + "/list", null, own, Map.of(), 200)).path("rows").get(0);
            check(entry.path("status").asText().equals("ACTIVE") && entry.path("mappingId").asLong() == mappingId && entry.path("version").asInt() == 2, "HTTP resumption restores same mapping with next version");
            jdbc.update("UPDATE sys_role SET role_key='employee' WHERE role_id=?", roleId);
            send("GET", base + "/list", null, own, Map.of(), 403);
        } finally {
            jdbc.update("UPDATE sys_role SET role_key='employee' WHERE role_id=?", roleId);
            jdbc.update("DELETE FROM sys_role_menu WHERE tenant_id=? AND role_id=? AND menu_id IN (1786,1787)", tenantId, roleId);
        }
    }

    private void unbind(Map<String, String> own) throws Exception {
        JsonNode overview = data(send("GET", BASE, null, own, Map.of(), 200));
        check(overview.path("canUnbind").asBoolean(), "HTTP advertises only eligible owner unbinding");
        long mappingId = overview.path("binding").path("mappingId").asLong();
        int version = overview.path("binding").path("version").asInt();
        String selection = JSON.writeValueAsString(Map.of("mappingId", mappingId, "version", version));
        send("POST", BASE + "/unbind", selection, Map.of(), Map.of(), 401);
        send("POST", BASE + "/unbind", selection, own, Map.of(), 403);
        send("POST", BASE + "/unbind/identity", JSON.writeValueAsString(Map.of("password", password)), own, Map.of("Origin", "https://foreign.example.test"), 403);
        check(!data(send("GET", BASE + "/unbind/identity", null, own, Map.of(), 200)).path("verified").asBoolean(), "bind proof never authorizes unbinding");
        for (String body : List.of("{}", "{\"mappingId\":1}", "{\"mappingId\":1.0,\"version\":0}", "{\"mappingId\":\"1\",\"version\":0}",
                "{\"mappingId\":1,\"version\":-1}", "{\"mappingId\":1,\"version\":2147483648}", "{\"mappingId\":9223372036854775808,\"version\":0}",
                "{\"mappingId\":1,\"version\":0,\"userId\":1}", "{\"mappingId\":1,\"version\":0,\"version\":1}")) {
            send("POST", BASE + "/unbind", body, own, Map.of(), 400);
        }
        send("POST", BASE + "/unbind/identity", JSON.writeValueAsString(Map.of("password", password)), own, Map.of(), 200);
        send("POST", BASE + "/unbind", selection, own, Map.of("X-CSRF-Token", "wrong"), 403);
        Map<String, String> otherSession = new LinkedHashMap<>(own); otherSession.put("Authorization", alternate);
        send("POST", BASE + "/unbind", selection, otherSession, Map.of(), 403);
        send("POST", BASE + "/unbind", JSON.writeValueAsString(Map.of("mappingId", mappingId, "version", version + 1)), own, Map.of(), 409);
        jdbc.update("UPDATE sys_im_user_mapping SET bind_type='AUTO_SYNC' WHERE mapping_id=?", mappingId);
        check(!data(send("GET", BASE, null, own, Map.of(), 200)).path("canUnbind").asBoolean(), "HTTP hides owner removal for synchronized binding");
        send("POST", BASE + "/unbind", selection, own, Map.of(), 403);
        jdbc.update("UPDATE sys_im_user_mapping SET bind_type='SCAN_BIND' WHERE mapping_id=?", mappingId);
        jdbc.update("UPDATE sys_menu SET status='1' WHERE menu_id=1790");
        try { send("POST", BASE + "/unbind", selection, own, Map.of(), 403); }
        finally { jdbc.update("UPDATE sys_menu SET status='0' WHERE menu_id=1790"); }
        check(count() == 1, "all rejected HTTP unbind requests preserve actual mapping");
        send("POST", BASE + "/unbind", selection, own, Map.of(), 200);
        check(count() == 0 && data(send("GET", BASE, null, own, Map.of(), 200)).path("binding").isNull(), "actual HTTP unbind commits and refresh verifies absence");
        send("POST", BASE + "/unbind", selection, own, Map.of(), 403);
    }

    private HttpResponse<String> send(String method, String path, String body, Map<String, String> cookies, Map<String, String> overrides, int expected) throws Exception {
        return send(method, path, body, cookies, overrides, Map.of(), expected);
    }

    private HttpResponse<String> send(String method, String path, String body, Map<String, String> cookies, Map<String, String> overrides, Map<String, String> duplicates, int expected) throws Exception {
        reset.run(); requests++;
        HttpRequest.Builder builder = HttpRequest.newBuilder(origin.resolve(path)).timeout(Duration.ofSeconds(20));
        Map<String, String> headers = new LinkedHashMap<>(Map.of("X-Forwarded-Proto", "https", "X-Forwarded-For", address,
                "Origin", properties.getPublicUrl(), "X-CSRF-Token", CSRF));
        headers.putAll(overrides); headers.forEach(builder::header);
        if (!cookies.isEmpty()) builder.header("Cookie", String.join("; ", cookies.entrySet().stream().filter(entry -> !entry.getValue().isEmpty()).map(entry -> entry.getKey() + "=" + entry.getValue()).toList()));
        if (body != null) builder.header("Content-Type", "application/json");
        duplicates.forEach(builder::header);
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        HttpResponse<String> response = HTTP.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        check(response.statusCode() == expected, "binding HTTP " + method + " " + path.split("\\?", 2)[0] + " expected=" + expected + " actual=" + response.statusCode());
        if (expected == 200 || expected == 303) {
            check(response.headers().firstValue("cache-control").orElse("").equals("no-store"), "binding success never cached");
            check(response.headers().firstValue("referrer-policy").orElse("").equals("no-referrer"), "binding success suppresses referrer");
        }
        check(!response.body().contains(password) && !response.body().contains(token), "HTTP response never contains local password or login token");
        return response;
    }

    private int count() { return jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_user_mapping WHERE tenant_id=? AND user_id=?", Integer.class, tenantId, userId); }
    private static JsonNode data(HttpResponse<String> response) throws Exception { return JSON.readTree(response.body()).path("data"); }
    private static Map<String, String> cookies(HttpResponse<String> response) {
        Map<String, String> result = new LinkedHashMap<>();
        for (String header : response.headers().allValues("set-cookie")) { String[] parts = header.split(";", 2)[0].split("=", 2); result.put(parts[0], parts[1]); }
        return result;
    }
    private static String query(URI uri, String name) {
        for (String item : uri.getRawQuery().split("&")) { String[] pair = item.split("=", 2); if (pair[0].equals(name)) return URLDecoder.decode(pair[1], StandardCharsets.UTF_8); }
        throw new AssertionError("missing authorization field");
    }
    private static void inject(Object target, String name, Object value) {
        try { Field field = target.getClass().getDeclaredField(name); field.setAccessible(true); field.set(target, value); }
        catch (ReflectiveOperationException failure) { throw new AssertionError(failure); }
    }
    private void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
}
