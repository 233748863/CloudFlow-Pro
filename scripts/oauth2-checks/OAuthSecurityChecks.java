package com.cloudflow.auth.oauth2;

import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.controller.OAuthProtocolController;
import com.cloudflow.auth.mapper.OAuthMapper;
import com.cloudflow.auth.platform.PlatformAccessProperties;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.spel.MethodBasedSpelEvaluator;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.security.oauth2.OAuthAccessPolicy;
import com.cloudflow.common.security.oauth2.OAuthDigests;
import com.cloudflow.common.security.oauth2.OAuthFailure;
import com.cloudflow.common.security.oauth2.OAuthIdentity;
import com.cloudflow.common.security.oauth2.OAuthResources;
import com.cloudflow.common.security.oauth2.OAuthScope;
import com.cloudflow.common.sensitive.config.SensitiveBeanSerializerModifier;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Proxy;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Supplier;

public final class OAuthSecurityChecks {
    private static int assertions;

    public static void main(String[] arguments) throws Exception {
        digests();
        redirects();
        deployment();
        deploymentBeforeAudit();
        encryption();
        serialization();
        protocol();
        configurations();
        serviceAccounts();
        resourceFailures();
        confirmationKeys();
        approvalAccess();
        System.out.println("OAUTH2_SECURITY_CHECKS: assertions=" + assertions
                + "; failed=0; actual_security_classes=true; http=false; mysql=false; redis=false; production_modified=false");
    }

    private static void digests() {
        String verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        equal("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", OAuthDigests.challenge(verifier), "RFC7636 S256 known answer");
        equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", OAuthDigests.hash("abc"), "SHA256 known answer");
        Set<String> issued = new java.util.HashSet<>();
        for (int index = 0; index < 128; index++) {
            String token = OAuthDigests.random();
            check(token.length() == 43 && Base64.getUrlDecoder().decode(token).length == 32, "32-byte opaque random token");
            check(OAuthDigests.token(token) && issued.add(token), "random tokens are valid and distinct");
            check(OAuthDigests.matches(token, token) && !OAuthDigests.matches(token, token + "a"), "constant-time equality result");
        }
        for (String invalid : Arrays.asList(null, "", "a".repeat(42), "a".repeat(44), "=".repeat(43), " ".repeat(43))) {
            check(!OAuthDigests.token(invalid), "malformed opaque token rejected");
        }
        for (String invalid : Arrays.asList(null, "", "a".repeat(42), "a".repeat(129), "a".repeat(42) + ":")) {
            rejected(() -> OAuthDigests.challenge(invalid), 400, "invalid_grant", "invalid PKCE verifier rejected");
        }
        for (int length : List.of(43, 64, 128)) check(OAuthDigests.token(OAuthDigests.challenge("a".repeat(length))), "PKCE allowed length");
    }

    private static void redirects() {
        for (String valid : List.of("https://client.example/callback", "https://client.example:443/callback?mode=normal&next=abc",
                "https://client.example/callback?a=1&b=2", "https://client.example/%E5%9B%9E%E8%B0%83")) {
            equal(valid, OAuthClientRules.redirect(valid, false), "registered HTTPS callback remains exact");
        }
        for (String invalid : Arrays.asList(null, "", " https://client.example/callback", "https://client.example/callback ",
                "http://client.example/callback", "javascript:alert(1)", "//client.example/callback", "https://*.example/callback",
                "https://name:password@client.example/callback", "https://client.example/callback#part", "https://client.example:0/callback",
                "https://client.example:65536/callback", "https://client.example/\\callback", "https://client.example/%5ccallback",
                "https://client.example/%0d%0aheader", "https://client.example/callback?a=1&a=2", "https://client.example/callback?a=1&%61=2",
                "https://client.example/callback?", "https://client.example/callback?=value", "https://client.example/callback?a=1&",
                "https://client.example/callback?code=x", "https://client.example/callback?state=x", "https://client.example/callback?%65rror=x",
                "https://client.example/callback?error_description=x", "https://client.example/callback?x=%zz", "https://client.example/\tcallback",
                "https://client.example/" + "a".repeat(1000))) {
            rejected(() -> OAuthClientRules.redirect(invalid, false), 400, "invalid_request", "ambiguous callback rejected");
        }
        for (String local : List.of("http://127.0.0.1:4500/callback", "http://localhost:4500/callback", "http://[::1]:4500/callback")) {
            rejected(() -> OAuthClientRules.redirect(local, false), 400, "invalid_request", "loopback disabled in production");
            equal(local, OAuthClientRules.redirect(local, true), "explicit loopback fixture callback");
        }
        for (String nonlocal : List.of("http://127.0.0.2/callback", "http://127.0.0.1.evil.invalid/callback", "http://192.168.1.173/callback")) {
            rejected(() -> OAuthClientRules.redirect(nonlocal, true), 400, "invalid_request", "test flag only permits exact loopback hosts");
        }
    }

    private static void deployment() {
        OAuthAccessPolicy disabled = new OAuthAccessPolicy(false, "https://auth.example", false);
        rejected(disabled::requireAvailable, 503, "temporarily_unavailable", "deployment explicitly disabled");
        check(disabled.reason().contains("停用"), "disabled reason is explicit");
        for (String bad : Arrays.asList(null, "", "http://auth.example", "https://name@auth.example", "https://auth.example/path",
                "https://auth.example?query=1", "https://auth.example#part", "https://auth.example:65536", "https://auth.example/\\")) {
            OAuthAccessPolicy policy = new OAuthAccessPolicy(true, bad, false);
            check(!policy.configured(), "malformed origin is unconfigured");
            rejected(policy::requireAvailable, 503, "temporarily_unavailable", "malformed deployment fails closed");
        }
        OAuthAccessPolicy policy = new OAuthAccessPolicy(true, "https://auth.example:443/", false);
        check(policy.configured(), "valid public origin configured");
        policy.transport(true, "203.0.113.7", null);
        policy.consentOrigin("https://auth.example");
        rejected(() -> policy.transport(false, "203.0.113.7", "https"), 403, "invalid_request", "untrusted proxy header does not grant TLS");
        rejected(() -> policy.consentOrigin("https://evil.example"), 403, "invalid_request", "foreign consent origin rejected");
        rejected(() -> policy.consentOrigin("null"), 403, "invalid_request", "opaque consent origin rejected");
        OAuthAccessPolicy local = new OAuthAccessPolicy(true, "http://127.0.0.1:4500", true);
        local.transport(false, "127.0.0.1", null);
        rejected(() -> local.transport(false, "192.0.2.10", null), 403, "invalid_request", "loopback allowance is peer bound");
    }

    private static void deploymentBeforeAudit() {
        AtomicInteger writes = new AtomicInteger();
        AtomicInteger insertResult = new AtomicInteger(1);
        AtomicReference<SysAuditLogEntity> inserted = new AtomicReference<>();
        OAuthDatabase database = new OAuthDatabase(null, null) {
            @Override
            public <Result> Result write(Function<OAuthMapper, Result> operation) {
                writes.incrementAndGet();
                return operation.apply(null);
            }
        };
        SysAuditLogMapper mapper = (SysAuditLogMapper) Proxy.newProxyInstance(SysAuditLogMapper.class.getClassLoader(),
                new Class<?>[]{SysAuditLogMapper.class}, (proxy, method, arguments) -> {
                    if (!method.getName().equals("insert")) throw new AssertionError("Unexpected audit mapper method");
                    inserted.set((SysAuditLogEntity) arguments[0]);
                    return insertResult.get();
                });
        PlatformAccessProperties platform = new PlatformAccessProperties();
        OAuthAudit audit = new OAuthAudit(mapper, platform, database);
        for (OAuthAccessPolicy policy : List.of(new OAuthAccessPolicy(false, "", false),
                new OAuthAccessPolicy(false, "https://auth.example", false),
                new OAuthAccessPolicy(true, "", false))) {
            OAuthProtocolController controller = new OAuthProtocolController(null, null, null, policy, audit, null);
            HttpServletRequest request = transportRequest(true);
            List<Runnable> operations = List.of(() -> controller.authorize(request),
                    () -> controller.confirm(null, request), () -> controller.token(request), () -> controller.revoke(request), controller::limited);
            for (Runnable operation : operations) {
                try { operation.run(); throw new AssertionError("Unconfigured protocol endpoint must remain disabled"); }
                catch (OAuthFailure failure) {
                    equal(503, failure.getCode(), "unconfigured controller remains unavailable");
                    equal("temporarily_unavailable", failure.getError(), "unconfigured protocol response remains standard");
                    equal(policy.reason(), failure.getMessage(), "missing audit ownership must not replace the explicit disabled reason");
                }
                equal(0, writes.get(), "unconfigured protocol does not attempt a tenantless audit transaction");
            }
        }
        platform.setManagementTenantId(100000L);
        OAuthProtocolController configured = new OAuthProtocolController(null, null, null,
                new OAuthAccessPolicy(true, "https://auth.example", false), audit, null);
        rejected(() -> configured.authorize(transportRequest(false)), 403, "invalid_request", "configured transport rejection remains audited");
        equal(1, writes.get(), "configured rejection performs an audit transaction");
        equal(100000L, inserted.get().getTenantId(), "configured audit retains deployment ownership");
        equal("OAUTH2_AUTHORIZATION_REQUEST_FAILED", inserted.get().getAuditName(), "configured audit retains the failed operation");
        equal("invalid_request", inserted.get().getAfterVal(), "configured audit stores the safe protocol outcome");
        equal(1, inserted.get().getHighRisk(), "configured protocol rejection remains high risk");
        insertResult.set(0);
        rejected(() -> configured.authorize(transportRequest(false)), 503, "server_error", "configured audit persistence failure still fails closed");
        equal(2, writes.get(), "failed configured audit is attempted and never silently skipped");
        insertResult.set(1);
        org.springframework.http.ResponseEntity<Map<String, String>> limited = configured.limited();
        equal(429, limited.getStatusCode().value(), "configured rate limit keeps protocol status");
        equal("slow_down", limited.getBody().get("error"), "configured rate limit keeps protocol outcome");
        equal("60", limited.getHeaders().getFirst("Retry-After"), "configured rate limit keeps retry interval");
        equal(3, writes.get(), "configured rate limit still persists an audit");
    }

    private static HttpServletRequest transportRequest(boolean secure) {
        return (HttpServletRequest) Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(), new Class<?>[]{HttpServletRequest.class},
                (proxy, method, arguments) -> switch (method.getName()) {
                    case "isSecure" -> secure;
                    case "getRemoteAddr" -> "203.0.113.7";
                    case "getHeader" -> null;
                    default -> throw new AssertionError("Disabled or rejected transport must not parse protocol credentials");
                });
    }

    private static void encryption() {
        OAuthProperties properties = new OAuthProperties();
        OAuthSecretCipher cipher = new OAuthSecretCipher(properties);
        String raw = OAuthDigests.random();
        for (String absent : Arrays.asList(null, "", " ".repeat(32), "a".repeat(31))) {
            properties.setSecretKey(absent);
            rejected(() -> cipher.encrypt(raw), 503, "temporarily_unavailable", "missing master key blocks encryption");
            rejected(() -> cipher.matches(raw, "oauth1:bad"), 503, "temporarily_unavailable", "missing master key blocks authentication");
        }
        properties.setSecretKey(OAuthDigests.random());
        String encrypted = cipher.encrypt(raw);
        check(encrypted.startsWith("oauth1:") && !encrypted.contains(raw), "stored client secret is encrypted");
        check(!encrypted.equals(cipher.encrypt(raw)), "encryption uses fresh nonce");
        check(cipher.matches(raw, encrypted), "encrypted client secret validates");
        check(!cipher.matches(OAuthDigests.random(), encrypted), "wrong secret fails authentication");
        check(!cipher.matches(raw, raw), "plaintext column is not accepted as ciphertext");
        rejected(() -> cipher.matches(raw, "oauth1:broken"), 503, "server_error", "damaged ciphertext fails closed");
        properties.setSecretKey(OAuthDigests.random());
        rejected(() -> cipher.matches(raw, encrypted), 503, "server_error", "incorrect master key fails closed");
        rejected(() -> cipher.encrypt("not-random"), 400, "invalid_request", "client secret must use opaque 32-byte format");
        check(!properties.toString().contains(properties.getSecretKey()), "configuration string representation hides key");
    }

    private static void protocol() {
        String clientId = "cf_" + OAuthDigests.random();
        String secret = OAuthDigests.random();
        String basic = basic(clientId + ":" + secret);
        Map<String, String[]> form = values("grant_type", "authorization_code", "client_id", clientId, "code", OAuthDigests.random(),
                "redirect_uri", "https://client.example/callback", "code_verifier", OAuthDigests.random());
        OAuthProtocolRequests.Token parsed = OAuthProtocolRequests.token(request(form, List.of(basic), null, "application/x-www-form-urlencoded;charset=UTF-8", 200));
        equal(clientId, parsed.credentials().clientId(), "Basic client identifier");
        equal(secret, parsed.credentials().clientSecret(), "Basic client secret");
        check(parsed.credentials().basic(), "confidential request records Basic authentication");
        check(!parsed.toString().contains(secret) && !parsed.credentials().toString().contains(secret), "request toString redacts secrets");
        OAuthProtocolRequests.Token publicRequest = OAuthProtocolRequests.token(request(form, List.of(), null, "application/x-www-form-urlencoded", -1));
        check(!publicRequest.credentials().basic() && publicRequest.credentials().clientSecret() == null, "public client does not invent secret");
        for (String header : List.of("Basic !not-base64!", "Bearer token", basic(":secret"), basic("client:secret:extra"),
                basic("client"), "Basic " + "a".repeat(1020), basic("其他:secret"), basic("bad client:secret"), "Basic ")) {
            rejected(() -> OAuthProtocolRequests.token(request(form, List.of(header), null, "application/x-www-form-urlencoded", 200)),
                    401, "invalid_client", "malformed Basic header rejected");
        }
        rejected(() -> OAuthProtocolRequests.token(request(form, List.of(basic, basic), null, "application/x-www-form-urlencoded", 200)),
                401, "invalid_client", "multiple authorization headers rejected");
        Map<String, String[]> mismatch = new LinkedHashMap<>(form);
        mismatch.put("client_id", new String[]{"another_client"});
        rejected(() -> OAuthProtocolRequests.token(request(mismatch, List.of(basic), null, "application/x-www-form-urlencoded", 200)),
                401, "invalid_client", "Basic and body identifiers must match");
        for (String name : List.of("client_id", "grant_type", "code", "redirect_uri", "code_verifier", "scope")) {
            Map<String, String[]> duplicate = new LinkedHashMap<>(form);
            duplicate.put(name, new String[]{"first", "second"});
            rejected(() -> OAuthProtocolRequests.token(request(duplicate, List.of(basic), null, "application/x-www-form-urlencoded", 200)),
                    400, "invalid_request", "duplicate token parameter " + name);
        }
        Map<String, String[]> extra = new LinkedHashMap<>(form);
        extra.put("client_secret", new String[]{secret});
        rejected(() -> OAuthProtocolRequests.token(request(extra, List.of(basic), null, "application/x-www-form-urlencoded", 200)),
                400, "invalid_request", "client secret in request body rejected");
        for (String contentType : Arrays.asList(null, "application/json", "text/plain")) {
            rejected(() -> OAuthProtocolRequests.token(request(form, List.of(basic), null, contentType, 200)),
                    400, "invalid_request", "token form encoding required");
        }
        rejected(() -> OAuthProtocolRequests.token(request(form, List.of(basic), "grant_type=authorization_code", "application/x-www-form-urlencoded", 200)),
                400, "invalid_request", "token query and body cannot be mixed");
        rejected(() -> OAuthProtocolRequests.token(request(form, List.of(basic), null, "application/x-www-form-urlencoded", 16385)),
                400, "invalid_request", "token body size bound");
        Map<String, String[]> authorize = values("response_type", "code", "client_id", clientId, "redirect_uri", "https://client.example/callback",
                "scope", "profile", "state", "opaque-state", "code_challenge", OAuthDigests.random(), "code_challenge_method", "S256");
        equal("opaque-state", OAuthProtocolRequests.authorize(request(authorize, List.of(), "response_type=code", null, -1)).state(), "state remains exact");
        authorize.put("state", new String[]{"first", "second"});
        rejected(() -> OAuthProtocolRequests.authorize(request(authorize, List.of(), "state=first&state=second", null, -1)),
                400, "invalid_request", "duplicate authorization state rejected");
        Map<String, String[]> revoke = values("client_id", clientId, "token", OAuthDigests.random(), "token_type_hint", "refresh_token");
        check(OAuthProtocolRequests.revoke(request(revoke, List.of(basic), null, "application/x-www-form-urlencoded", 200)).credentials().basic(), "revocation requires same client authentication parser");
        revoke.put("token", new String[]{"first", "second"});
        rejected(() -> OAuthProtocolRequests.revoke(request(revoke, List.of(basic), null, "application/x-www-form-urlencoded", 200)),
                400, "invalid_request", "duplicate revoked token rejected");
    }

    private static void serialization() throws Exception {
        SimpleModule masking = new SimpleModule("actual-cloudflow-sensitive-module");
        masking.setSerializerModifier(new SensitiveBeanSerializerModifier());
        ObjectMapper mapper = new ObjectMapper().registerModule(masking);
        String secret = OAuthDigests.random();
        equal("******", mapper.readTree(mapper.writeValueAsString(new OrdinarySecret(secret))).get("clientSecret").asText(),
                "ordinary responses retain automatic secret masking");
        equal(secret, mapper.readTree(mapper.writeValueAsString(new OAuthViews.Created(null, secret))).get("clientSecret").asText(),
                "authorized one-time client creation returns complete generated secret");
        String access = OAuthDigests.random();
        String refresh = OAuthDigests.random();
        com.fasterxml.jackson.databind.JsonNode token = mapper.readTree(mapper.writeValueAsString(new OAuthProtocolService.TokenResponse(access, "Bearer", 900, refresh, "profile")));
        equal(access, token.get("access_token").asText(), "protocol response returns usable access token");
        equal(refresh, token.get("refresh_token").asText(), "protocol response returns usable refresh token");
        equal("Bearer", token.get("token_type").asText(), "protocol token type remains literal");
        check(!mapper.readTree(mapper.writeValueAsString(new OAuthProtocolService.TokenResponse(access, "Bearer", 900, null, "system.tenant.read"))).has("refresh_token"),
                "service account response omits refresh token");
        String requestToken = OAuthDigests.random();
        OAuthAuthorizationService.AuthorizationView authorization = new OAuthAuthorizationService.AuthorizationView("Client", null,
                OAuthScope.views(), requestToken, null, null, false);
        equal(requestToken, mapper.readTree(mapper.writeValueAsString(authorization)).get("requestToken").asText(),
                "session-bound consent transaction reaches its own browser intact");
        String hash = OAuthDigests.hash(access);
        OAuthIdentity identity = new OAuthIdentity(1L, 100000L, 2L, 3L, hash, "authorization_code", List.of("profile"), null, 4, List.of(), Set.of(), System.currentTimeMillis() + 60000);
        String serializedIdentity = mapper.writeValueAsString(identity);
        equal(hash, mapper.readTree(serializedIdentity).get("tokenHash").asText(), "trusted service identity preserves opaque-token hash binding");
        equal(identity, mapper.readValue(serializedIdentity, OAuthIdentity.class), "identity survives actual masked-mapper round trip");
        for (Object outbound : List.of(new OAuthResources.Verification(hash), new OAuthResources.CustomerQuery(hash, 1, 10, null),
                new OAuthResources.CustomerRequest(hash, 1L), new OAuthResources.InstanceRequest(hash, "instance-test"))) {
            equal(hash, mapper.readTree(mapper.writeValueAsString(outbound)).get("tokenHash").asText(), "trusted service request preserves hash proof");
            check(!outbound.toString().contains(hash), "trusted service request string hides hash proof");
        }
    }

    private record OrdinarySecret(String clientSecret) { }

    private static void configurations() {
        OAuthJson json = new OAuthJson(new ObjectMapper());
        OAuthProperties properties = new OAuthProperties();
        OAuthRuntimeChecks rules = new OAuthRuntimeChecks(json, properties);
        equal(List.of("profile"), json.strings("[\"profile\"]"), "persisted scopes decode");
        for (String malformed : List.of("", "null", "{}", "[1]", "[null]", "[\"\"]", "[\"profile\",\"profile\"]", "not-json")) {
            rejected(() -> json.strings(malformed), 503, "server_error", "damaged JSON fails closed");
        }
        equal(4, OAuthScope.views().size(), "exact scope registry size");
        for (String scope : List.of("*", "system:user:add", "profile crm.customer.write", "admin", "profile  system.tenant.read")) {
            rejectedAny400(() -> OAuthClientRules.scopes(scope), "unknown or ambiguous scope denied");
        }
        rejected(() -> OAuthClientRules.subset(List.of("crm.customer.read"), List.of("profile")), 400, "invalid_scope", "no scope escalation");
        OAuthClient baseline = client();
        equal(baseline, rules.active(baseline), "complete valid client accepted");
        List<Consumer<OAuthClient>> mutations = new ArrayList<>();
        mutations.add(row -> row.setClientType("UNKNOWN"));
        mutations.add(row -> row.setTenantId(null));
        mutations.add(row -> row.setAccessTokenValiditySeconds(null));
        mutations.add(row -> row.setAccessTokenValiditySeconds(59));
        mutations.add(row -> row.setAccessTokenValiditySeconds(3601));
        mutations.add(row -> row.setRefreshTokenValiditySeconds(3599));
        mutations.add(row -> row.setRefreshTokenValiditySeconds(25920001));
        mutations.add(row -> row.setGrantTypes("[\"password\"]"));
        mutations.add(row -> row.setGrantTypes("[]"));
        mutations.add(row -> row.setScopes("[\"*\"]"));
        mutations.add(row -> row.setRedirectUris("[]"));
        mutations.add(row -> row.setRedirectUris("[\"https://*.example/callback\"]"));
        mutations.add(row -> row.setAutoApproveScopes("[\"crm.customer.read\"]"));
        mutations.add(row -> row.setAuthorities("[\"system:user:edit\"]"));
        mutations.add(row -> row.setResourceIds("[\"ALL\"]"));
        mutations.add(row -> row.setServiceUserId(2L));
        mutations.add(row -> { row.setClientType("PUBLIC"); row.setGrantTypes("[\"client_credentials\"]"); });
        for (Consumer<OAuthClient> mutation : mutations) {
            OAuthClient damaged = client();
            mutation.accept(damaged);
            rejected(() -> rules.active(damaged), 503, "server_error", "malformed stored client rejected");
        }
        for (int invalidVersion : List.of(-1, -100)) {
            OAuthClient invalid = client(); invalid.setVersion(invalidVersion);
            rejected(() -> rules.active(invalid), 401, "invalid_client", "invalid client version rejected");
        }
    }

    private static void serviceAccounts() {
        OAuthProperties properties = new OAuthProperties();
        properties.setServiceUserIds(Set.of(80L));
        OAuthActors actors = new OAuthActors(null, properties, null, legacyPermissions());
        SysUser user = new SysUser(); user.setUserId(80L); user.setTenantId(100000L);
        SysTenant tenant = new SysTenant(); tenant.setTenantId(100000L);
        SysRole role = new SysRole(); role.setRoleId(70L); role.setRoleKey("integration_reader");
        OAuthActors.Actor reader = new OAuthActors.Actor(user, tenant, List.of(role), Set.of("crm:customer:list"), 4, List.of(), null);
        actors.serviceAccount(reader);
        actors.requireScopes(reader, List.of("crm.customer.read", "system.tenant.read"), true);
        check(true, "allowlisted low-privilege service account accepted");
        rejected(() -> actors.requireScopes(reader, List.of("profile"), true), 403, "insufficient_scope", "service account cannot impersonate user profile");
        rejected(() -> actors.requireScopes(reader, List.of("workflow.instance.read"), true), 403, "insufficient_scope", "business permission intersection is required");
        for (String key : List.of("ADMIN", "administrator", "AdMiN")) {
            role.setRoleKey(key);
            rejected(() -> actors.serviceAccount(reader), 400, "invalid_request", "administrator cannot be service identity");
        }
        role.setRoleKey("integration_reader");
        OAuthActors.Actor writer = new OAuthActors.Actor(user, tenant, List.of(role), Set.of("crm:customer:list", "crm:customer:add"), 4, List.of(), null);
        rejected(() -> actors.serviceAccount(writer), 400, "invalid_request", "service account must not gain write permission");
        properties.setServiceUserIds(Set.of());
        rejected(() -> actors.serviceAccount(reader), 400, "invalid_request", "deployment list cannot be omitted");
    }

    private static void resourceFailures() throws ReflectiveOperationException {
        Method reader = OAuthBusinessResources.class.getDeclaredMethod("read", Supplier.class);
        reader.setAccessible(true);
        Function<Supplier<R<String>>, Object> call = operation -> {
            try { return reader.invoke(null, operation); }
            catch (InvocationTargetException failure) {
                if (failure.getCause() instanceof RuntimeException cause) throw cause;
                throw new AssertionError("Unexpected resource exception", failure.getCause());
            } catch (ReflectiveOperationException failure) { throw new AssertionError("Resource check cannot invoke actual reader", failure); }
        };
        equal("resource", call.apply(() -> R.ok("resource")), "successful resource response is unchanged");
        rejected(() -> call.apply(() -> null), 503, "temporarily_unavailable", "empty upstream response fails closed");
        rejected(() -> call.apply(() -> R.ok((String) null)), 503, "temporarily_unavailable", "empty upstream data fails closed");
        for (int status : List.of(401, 403, 404, 400, 429, 500, 502, 503)) {
            int expected = status == 401 ? 401 : status == 403 || status == 404 ? 403 : 503;
            String error = expected == 401 ? "invalid_token" : expected == 403 ? "insufficient_scope" : "temporarily_unavailable";
            rejected(() -> call.apply(() -> R.fail(status, "upstream-sensitive-marker")), expected, error, "business envelope keeps safe resource status");
            feign.Request request = feign.Request.create(feign.Request.HttpMethod.POST, "http://127.0.0.1/fixture", Map.of(),
                    null, StandardCharsets.UTF_8, new feign.RequestTemplate());
            feign.Response response = feign.Response.builder().request(request).status(status).headers(Map.of())
                    .body("upstream-sensitive-marker", StandardCharsets.UTF_8).build();
            feign.FeignException failure = feign.FeignException.errorStatus("resource", response);
            rejected(() -> call.apply(() -> { throw failure; }), expected, error, "HTTP transport keeps safe resource status");
        }
    }

    private static void confirmationKeys() throws Exception {
        Method confirmation = OAuthProtocolController.class.getMethod("confirm", OAuthProtocolRequests.Consent.class, HttpServletRequest.class);
        RepeatSubmit guard = confirmation.getAnnotation(RepeatSubmit.class);
        check(guard != null && guard.enabled() && guard.interval() == 5000 && !guard.key().isBlank(), "confirmation keeps five-second repeat protection with transaction-specific key");
        Function<OAuthProtocolRequests.Consent, String> key = body -> MethodBasedSpelEvaluator.evaluateToString(guard.key(), confirmation, new Object[]{body, null}, null);
        ObjectMapper mapper = new ObjectMapper();
        OAuthProtocolRequests.Consent first = new OAuthProtocolRequests.Consent();
        first.setRequestToken(OAuthDigests.random()); first.setApprove(true); first.setScopes(List.of("profile"));
        String firstKey = key.apply(first);
        equal(OAuthDigests.hash(first.getRequestToken()), firstKey, "confirmation key is a non-redeemable SHA256 digest");
        equal(firstKey, key.apply(first), "same transaction retains repeat key");
        OAuthProtocolRequests.Consent second = new OAuthProtocolRequests.Consent();
        second.setRequestToken(OAuthDigests.random()); second.setApprove(true); second.setScopes(List.of("profile"));
        equal(mapper.writeValueAsString(first), mapper.writeValueAsString(second), "write-only transaction credentials stay absent from serialized arguments");
        check(!Objects.equals(firstKey, key.apply(second)), "different transactions remain distinct despite identical masked parameters");
        check(!firstKey.contains(first.getRequestToken()) && !mapper.writeValueAsString(first).contains(first.getRequestToken()), "repeat key and serialized arguments do not disclose transaction credential");
        first.setApprove(false); first.setScopes(List.of("system.tenant.read"));
        equal(firstKey, key.apply(first), "changing decision or scopes cannot bypass transaction repeat guard");
        equal("invalid", key.apply(null), "missing body does not cause expression failure");
        for (String invalid : Arrays.asList(null, "", "bad", "a".repeat(44))) {
            first.setRequestToken(invalid);
            equal("invalid", key.apply(first), "invalid transaction format does not disclose input in repeat key");
        }
    }

    private static void approvalAccess() {
        OAuthJson json = new OAuthJson(new ObjectMapper());
        OAuthProperties properties = new OAuthProperties();
        OAuthRuntimeChecks rules = new OAuthRuntimeChecks(json, properties);
        OAuthClient client = client();
        SysUser user = new SysUser();
        user.setUserId(80L); user.setTenantId(100000L); user.setDeleted(0); user.setStatus("0"); user.setPwdResetRequired("0");
        SysTenant tenant = new SysTenant();
        tenant.setTenantId(100000L); tenant.setDeleted(0); tenant.setStatus("0");
        OAuthAccessToken token = new OAuthAccessToken();
        token.setAccessTokenId(9L); token.setTenantId(100000L); token.setClientId(1L); token.setUserId(80L);
        token.setTokenHash(OAuthDigests.hash(OAuthDigests.random())); token.setGrantType("authorization_code");
        token.setScopes("[\"profile\"]"); token.setClientVersion(0); token.setIssuedTime(LocalDateTime.now().minusMinutes(1));
        token.setExpiresTime(LocalDateTime.now().plusMinutes(10));
        AtomicReference<OAuthApproval> current = new AtomicReference<>(approval());
        OAuthMapper mapper = (OAuthMapper) Proxy.newProxyInstance(OAuthMapper.class.getClassLoader(), new Class<?>[]{OAuthMapper.class},
                (proxy, method, arguments) -> switch (method.getName()) {
                    case "access" -> token;
                    case "client" -> client;
                    case "user" -> user;
                    case "tenant" -> tenant;
                    case "roles" -> List.<SysRole>of();
                    case "permissions" -> List.of("system:oauth2:authorize");
                    case "approval" -> current.get();
                    default -> throw new AssertionError("Unexpected approval mapper method: " + method.getName());
                });
        OAuthDatabase database = new OAuthDatabase(mapper, null);
        OAuthActors actors = new OAuthActors(database, properties, null, legacyPermissions());
        OAuthAccessService service = new OAuthAccessService(database, actors, json, rules,
                new OAuthAccessPolicy(true, "https://auth.example", false), null, null);
        equal(current.get(), rules.approved(mapper, client, 80L, List.of("profile")), "effective approval permits token exchange");
        equal(80L, service.verifyHash(token.getTokenHash()).userId(), "effective approval permits original user access");
        List<Consumer<OAuthApproval>> mutations = List.of(
                row -> row.setExpiresTime(LocalDateTime.now().minusSeconds(1)),
                row -> row.setExpiresTime(null),
                row -> row.setRevokedTime(LocalDateTime.now().minusSeconds(1)),
                row -> row.setClientVersion(1),
                row -> row.setScopes("[]"));
        for (Consumer<OAuthApproval> mutation : mutations) {
            OAuthApproval changed = approval();
            mutation.accept(changed); current.set(changed);
            rejected(() -> rules.approved(mapper, client, 80L, List.of("profile")), 400, "invalid_grant", "ineffective approval remains an invalid grant at token exchange");
            rejected(() -> service.verifyHash(token.getTokenHash()), 401, "invalid_token", "ineffective approval invalidates access instead of reporting a service outage");
        }
        current.set(null);
        rejected(() -> rules.approved(mapper, client, 80L, List.of("profile")), 400, "invalid_grant", "missing approval remains an invalid grant at token exchange");
        rejected(() -> service.verifyHash(token.getTokenHash()), 401, "invalid_token", "missing approval invalidates access");
        OAuthApproval damaged = approval(); damaged.setScopes("damaged"); current.set(damaged);
        rejected(() -> service.verifyHash(token.getTokenHash()), 503, "server_error", "damaged approval storage remains a service failure");
        current.set(approval());
        equal(80L, service.verifyHash(token.getTokenHash()).userId(), "valid approval state still permits access after rejected fixtures");
    }

    private static com.cloudflow.common.security.service.CurrentPermissionService legacyPermissions() {
        return new com.cloudflow.common.security.service.CurrentPermissionService(tenantId ->
                new com.cloudflow.common.core.permission.TenantPermissionPolicy.Entitlement(null, null, 0, Set.of(), Set.of()));
    }

    private static OAuthApproval approval() {
        OAuthApproval row = new OAuthApproval();
        row.setTenantId(100000L); row.setClientId(1L); row.setUserId(80L); row.setClientVersion(0);
        row.setApprovedTime(LocalDateTime.now().minusMinutes(1)); row.setExpiresTime(LocalDateTime.now().plusMinutes(10));
        row.setScopes("[\"profile\"]");
        return row;
    }

    private static OAuthClient client() {
        OAuthClient row = new OAuthClient();
        row.setClientId(1L); row.setTenantId(100000L); row.setVersion(0); row.setDeleted(0); row.setStatus("ACTIVE");
        row.setClientType("CONFIDENTIAL"); row.setAccessTokenValiditySeconds(900); row.setRefreshTokenValiditySeconds(3600);
        row.setGrantTypes("[\"authorization_code\"]"); row.setScopes("[\"profile\"]"); row.setAutoApproveScopes("[]");
        row.setRedirectUris("[\"https://client.example/callback\"]"); row.setAuthorities("[\"system:oauth2:profile\"]"); row.setResourceIds("[\"PROFILE\"]");
        return row;
    }

    private static String basic(String pair) { return "Basic " + Base64.getEncoder().encodeToString(pair.getBytes(StandardCharsets.UTF_8)); }

    private static Map<String, String[]> values(String... pairs) {
        Map<String, String[]> result = new LinkedHashMap<>();
        for (int index = 0; index < pairs.length; index += 2) result.put(pairs[index], new String[]{pairs[index + 1]});
        return result;
    }

    private static HttpServletRequest request(Map<String, String[]> parameters, List<String> headers, String query, String contentType, long length) {
        return (HttpServletRequest) Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(), new Class<?>[]{HttpServletRequest.class},
                (proxy, method, arguments) -> switch (method.getName()) {
                    case "getParameterMap" -> parameters;
                    case "getHeaders" -> Collections.enumeration(headers);
                    case "getQueryString" -> query;
                    case "getContentType" -> contentType;
                    case "getContentLengthLong" -> length;
                    case "toString" -> "ServletRequest[REDACTED]";
                    default -> throw new AssertionError("Unexpected servlet method: " + method.getName());
                });
    }

    private static void check(boolean condition, String label) { assertions++; if (!condition) throw new AssertionError(label); }
    private static void equal(Object expected, Object actual, String label) { check(Objects.equals(expected, actual), label); }
    private static void rejected(Runnable action, int status, String error, String label) {
        try { action.run(); }
        catch (OAuthFailure failure) { equal(status, failure.getCode(), label + " status"); equal(error, failure.getError(), label + " error"); return; }
        throw new AssertionError(label);
    }
    private static void rejectedAny400(Runnable action, String label) {
        try { action.run(); }
        catch (OAuthFailure failure) { equal(400, failure.getCode(), label); return; }
        throw new AssertionError(label);
    }
}
