package com.cloudflow.auth.portal;

import cn.dev33.satoken.SaManager;
import cn.dev33.satoken.config.SaTokenConfig;
import cn.dev33.satoken.dao.SaTokenDao;
import cn.dev33.satoken.dao.SaTokenDaoDefaultImpl;
import cn.dev33.satoken.stp.StpInterface;
import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import cn.dev33.satoken.stp.parameter.SaLoginParameter;
import com.cloudflow.auth.controller.PortalAuthController;
import com.cloudflow.auth.domain.SysPortalUser;
import com.cloudflow.auth.mapper.SysPortalUserMapper;
import com.cloudflow.auth.service.remote.RemoteCrmPortalService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.security.portal.PortalAccessPolicy;
import com.cloudflow.common.security.portal.PortalClientAddress;
import com.cloudflow.common.security.portal.PortalContext;
import com.cloudflow.common.security.portal.PortalIdentity;
import com.cloudflow.common.security.portal.PortalPaths;
import com.cloudflow.common.security.portal.PortalRateLimits;
import com.cloudflow.common.security.portal.PortalTokens;
import com.cloudflow.common.security.service.CloudFlowStpInterface;
import com.cloudflow.common.sensitive.config.SensitiveBeanSerializerModifier;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import feign.FeignException;
import feign.Request;
import feign.Response;
import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

public class PortalIdentityChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        loginSerialization();
        invitationPresentation();
        credentials();
        rules();
        boundaries();
        contactFailures();
        sessions();
        System.out.println("PORTAL_IDENTITY_CHECKS: assertions=" + checks
                + "; failed=0; real_bcrypt=true; bcrypt_cost=12; real_sa_token=true; cache=in_process; rate_store=in_process_double; mysql=false; redis=false; http=false; production_modified=false");
    }

    private static void loginSerialization() throws Exception {
        SimpleModule module = new SimpleModule("production-sensitive-module");
        module.setSerializerModifier(new SensitiveBeanSerializerModifier());
        ObjectMapper json = new ObjectMapper().registerModule(module);
        String token = "p_" + PortalCredentials.randomToken();
        PortalAuthenticationService.SessionView session = new PortalAuthenticationService.SessionView("alice", "Customer", "Contact");
        PortalAuthenticationService.LoginResponse result = new PortalAuthenticationService.LoginResponse(token, PortalTokens.HEADER,
                PortalTokens.ABSOLUTE_SECONDS, PortalTokens.IDLE_SECONDS, session);
        check(!json.writeValueAsString(R.ok(result)).contains(token), "ordinary login DTO serialization retains global credential masking");
        PortalAuthenticationService authentication = new PortalAuthenticationService(null, null, null, null, null, null, null, null) {
            @Override
            public LoginResponse login(String tenantCode, PortalRequests.Login request, jakarta.servlet.http.HttpServletRequest http) {
                if (!"tenant".equals(tenantCode)) throw new ServiceException("denied", 401);
                return result;
            }
        };
        PortalAuthController controller = new PortalAuthController(authentication, null);
        JsonNode response = json.readTree(json.writeValueAsString(controller.login("tenant", null, null)));
        equal(200, response.path("code").asInt(), "successful portal controller response retains standard envelope");
        JsonNode data = response.path("data");
        equal(token, data.path("portalToken").asText(), "successful portal login returns the usable credential under production masking");
        equal(PortalTokens.HEADER, data.path("tokenHeader").asText(), "successful portal login returns the exact dedicated header");
        equal(28800L, data.path("expiresIn").asLong(), "successful portal login returns eight-hour absolute lifetime");
        equal(1800L, data.path("idleSeconds").asLong(), "successful portal login returns thirty-minute idle lifetime");
        HashSet<String> fields = new HashSet<String>();
        data.fieldNames().forEachRemaining(fields::add);
        equal(Set.of("portalToken", "tokenHeader", "expiresIn", "idleSeconds", "session"), fields, "login transport exposes only its explicit allowlist");
        equal(session, json.treeToValue(data.path("session"), PortalAuthenticationService.SessionView.class), "public session summary survives login serialization");
        check(!json.writeValueAsString(R.ok(result)).contains(token), "successful login transport never disables global masking for other responses");
        check(!result.toString().contains(token), "login service DTO default string does not expose its credential");
        rejectsCode(() -> controller.login("denied", null, null), 401, "failed authentication never constructs a credential response");
    }

    private static void invitationPresentation() {
        SysPortalUser user = account();
        user.setStatus("PENDING");
        user.setEmail("alice@example.test");
        user.setLoginAccount("alice");
        user.setVersion(0);
        user.setActivateExpireTime(LocalDateTime.now().plusMinutes(10));
        AtomicReference<PortalDeliveryView> latest = new AtomicReference<>(new PortalDeliveryView());
        latest.get().setSendStatus("SUCCESS");
        AtomicReference<String> unavailable = new AtomicReference<String>();
        SysPortalUserMapper mapper = (SysPortalUserMapper) Proxy.newProxyInstance(PortalIdentityChecks.class.getClassLoader(),
                new Class<?>[] { SysPortalUserMapper.class }, (proxy, method, arguments) -> switch (method.getName()) {
                    case "selectPage" -> new com.baomidou.mybatisplus.extension.plugins.pagination.Page<SysPortalUser>(1, 10, 1).setRecords(List.of(user));
                    case "latestDelivery" -> latest.get();
                    default -> throw new AssertionError("Unexpected portal list mapper call");
                });
        PortalContacts contacts = new PortalContacts(null) {
            @Override public List<Long> visibleIds() { return List.of(user.getRefBizId()); }
        };
        PortalInvitationMail mail = new PortalInvitationMail(null, null, null, null, null, null, "presentation-test-key-at-least-32-characters") {
            @Override public String unavailableReason(Long tenantId) { return unavailable.get(); }
        };
        PortalUserService service = new PortalUserService(mapper, contacts, null, mail, null, null,
                new MessageSecretCipher("presentation-test-key-at-least-32-characters"), null);
        Supplier<PortalUserView> view = () -> service.list("alice", "PENDING", 1, 10).getRows().get(0);
        UserContext.setUserId(1L);
        UserContext.setTenantId(user.getTenantId());
        UserContext.setAuthToken("owned-presentation-fixture");
        UserContext.setPermissions(Set.of("system:portal:user:list"));
        try {
            equal("SUCCESS", view.get().deliveryStatus(), "portal list preserves the actual message-record success vocabulary");
            equal("邮件服务已接纳，等待收件人设置密码激活", view.get().pendingReason(), "accepted invitation is not described as queued");
            unavailable.set("尚未配置可用邮件渠道，邀请未发送");
            equal("邮件服务已接纳，等待收件人设置密码激活", view.get().pendingReason(), "later channel disablement does not rewrite accepted delivery history");
            unavailable.set(null);
            for (Map.Entry<String, String> expected : Map.of("PENDING", "邀请邮件排队中，账号尚未激活", "CLAIMED", "邀请邮件排队中，账号尚未激活",
                    "SENDING", "邀请邮件发送中，账号尚未激活", "RETRYABLE", "邀请邮件暂未发送成功，等待安全重试",
                    "FAILED", "邀请邮件未发送成功，请核对邮件渠道", "SKIPPED", "邀请邮件未发送成功，请核对邮件渠道",
                    "UNKNOWN", "邀请邮件结果未明，请先核对投递记录", "UNEXPECTED", "邀请邮件状态待核对，账号尚未激活").entrySet()) {
                latest.get().setSendStatus(expected.getKey());
                equal(expected.getValue(), view.get().pendingReason(), "portal list describes actual delivery state " + expected.getKey());
            }
            latest.get().setSendStatus("SUCCESS");
            user.setActivateExpireTime(LocalDateTime.now().minusSeconds(1));
            equal("邀请已过期，请明确重发邀请", view.get().pendingReason(), "accepted mail cannot hide activation expiry");
            user.setActivateExpireTime(null);
            equal("NOT_SENT", view.get().deliveryStatus(), "a new invitation without activation credentials cannot reuse old successful delivery state");
            equal("邀请尚未发送，请明确重发邀请", view.get().pendingReason(), "missing activation credentials require an explicit new invitation");
            unavailable.set("尚未配置可用邮件渠道，邀请未发送");
            equal(unavailable.get(), view.get().pendingReason(), "unsent invitation explains missing configuration");
            user.setActivateExpireTime(LocalDateTime.now().plusMinutes(10));
            unavailable.set(null);
            latest.set(null);
            equal("邀请邮件状态待核对，账号尚未激活", view.get().pendingReason(), "missing delivery record is never claimed as queued or successful");
            for (String status : List.of("ACTIVE", "DISABLED", "LOCKED")) {
                user.setStatus(status);
                check(view.get().pendingReason() == null, "non-pending account does not show activation instructions");
            }
        } finally { UserContext.clear(); }
    }

    private static void credentials() throws Exception {
        PortalCredentials credentials = new PortalCredentials();
        equal("alice@example.com", credentials.account(" Alice@Example.COM "), "account normalized independently of password");
        for (String invalid : List.of("ab", "x".repeat(101), "first last", "用户abc", "name/other", "@example.com")) {
            rejects(() -> credentials.account(invalid), "invalid account rejected");
        }
        String password = "R7!mF2$qN9#vL4";
        String hash = credentials.encode(password, "alice", "alice@example.com");
        check(hash.startsWith("$2a$12$"), "BCrypt cost 12");
        check(credentials.matches(password, hash), "raw password matches");
        check(!credentials.matches(password + " ", hash), "trailing whitespace not silently trimmed");
        check(!credentials.matches(" " + password, hash), "leading whitespace not silently trimmed");
        check(!credentials.matches(password.toLowerCase(), hash), "case remains significant");
        check(!credentials.matches(password, null), "missing account uses dummy BCrypt without success");
        check(!credentials.matches(password, "$2a$10$" + hash.substring(7)), "foreign cost rejected");
        check(!credentials.matches(password, "invalid"), "invalid hash cannot authenticate");
        for (String invalid : List.of("Short1!", "A1!" + "a".repeat(62), "abcdefghijkl", "ABCDEFGHIJKL",
                "123456789012", "abcdefghijk1", "Abcdefghijk1", "Abcdefghij!K", "Password123!",
                "Passw0rd123!", "Welcome2026!", "P@ssw0rd1234!", "Alice5678!Long", "Long5678!Alice",
                "Aa1!\u0000abcdefg", "Aa1! abcdefgh", "Aa1!\u200babcdefg", "Aa1!\ud800abcdefg")) {
            rejects(() -> credentials.validate(invalid, "alice", "alice@example.com"), "weak or malformed password rejected");
        }
        String maximum = "R7!" + "m".repeat(61);
        credentials.validate(maximum, "alice", "alice@example.com");
        checks++;
        String seventyTwoBytes = "Aa1!" + "中".repeat(22) + "xy";
        credentials.validate(seventyTwoBytes, "alice", "alice@example.com");
        checks++;
        rejects(() -> credentials.validate(seventyTwoBytes + "z", "alice", "alice@example.com"), "73 bytes rejected");
        String unicode = "Aa1!" + "😀".repeat(16);
        credentials.validate(unicode, "alice", "alice@example.com");
        checks++;
        rejects(() -> credentials.validate(unicode + "😀😀", "alice", "alice@example.com"), "Unicode bytes not truncated");
        HashSet<String> unique = new HashSet<String>();
        for (int attempt = 0; attempt < 128; attempt++) {
            String token = PortalCredentials.randomToken();
            check(token.matches("[A-Za-z0-9_-]{43}"), "activation token encodes 32 random bytes");
            check(unique.add(token), "activation entropy does not repeat");
            check(PortalCredentials.activationHash(token).matches("[a-f0-9]{64}"), "only SHA256 persisted");
        }
        check(PortalCredentials.activationHash(null) == null, "absent activation token rejected");
        check(PortalCredentials.activationHash("bad") == null, "short activation token rejected");
        SysPortalUser row = account();
        row.setPasswordHash(hash);
        row.setActivateTokenHash(PortalCredentials.digest("hidden"));
        String serialized = new ObjectMapper().findAndRegisterModules().writeValueAsString(row);
        check(!serialized.contains(hash) && !serialized.contains("passwordHash"), "entity cannot serialize password hash");
        check(!serialized.contains("activateTokenHash"), "entity cannot serialize activation hash");
    }

    private static void rules() {
        LocalDateTime now = LocalDateTime.of(2026, 9, 18, 9, 0);
        SysPortalUser user = account();
        check(PortalAccountRules.canAttempt(user, now), "active customer can attempt");
        for (int failures = 0; failures < 5; failures++) {
            user.setFailCount(failures);
            equal(failures + 1, PortalAccountRules.nextFailures(user, now), "fifth consecutive failure reaches lock");
        }
        user.setFailCount(5);
        equal(5, PortalAccountRules.nextFailures(user, now), "counter capped");
        user.setStatus("LOCKED");
        user.setLockedUntil(now.plusMinutes(15));
        check(!PortalAccountRules.canAttempt(user, now.plusMinutes(14).plusSeconds(59)), "lock lasts full 15 minutes");
        check(PortalAccountRules.canAttempt(user, now.plusMinutes(15)), "lock expires at exact boundary");
        equal(1, PortalAccountRules.nextFailures(user, now.plusMinutes(15)), "expired lock resets failure streak");
        user.setStatus("PENDING");
        user.setActivateTokenHash(PortalCredentials.digest("activation"));
        user.setActivateExpireTime(now.plusMinutes(15));
        check(!PortalAccountRules.canAttempt(user, now), "pending account cannot login");
        check(PortalAccountRules.canActivate(user, user.getActivateTokenHash(), now), "live pending invitation can activate");
        check(!PortalAccountRules.canActivate(user, "different", now), "old or foreign token rejected");
        check(!PortalAccountRules.canActivate(user, user.getActivateTokenHash(), now.plusMinutes(15)), "exact expiry is invalid");
        user.setActivateConsumedTime(now);
        check(!PortalAccountRules.canActivate(user, user.getActivateTokenHash(), now), "consumed token rejected");
        user = account();
        PortalIdentity identity = new PortalIdentity(100L, 100000L, 200L, 300L, 0, 1);
        check(PortalAccountRules.accepts(user, identity), "matching current account accepts session");
        user.setSessionVersion(1);
        check(!PortalAccountRules.accepts(user, identity), "changed session version revokes old token");
        user.setSessionVersion(0);
        user.setCustomerId(201L);
        check(!PortalAccountRules.accepts(user, identity), "moved contact cannot retain customer access");
        user.setCustomerId(200L);
        for (String status : List.of("PENDING", "DISABLED", "LOCKED", "ACTIVE_OTHER")) {
            user.setStatus(status);
            check(!PortalAccountRules.accepts(user, identity), "non-active state revokes session");
        }
        user.setStatus("ACTIVE");
        user.setDeleted(1);
        check(!PortalAccountRules.accepts(user, identity), "deleted account denied");
        user.setDeleted(0);
        user.setUserType("SUPPLIER_CONTACT");
        check(!PortalAccountRules.accepts(user, identity), "reserved supplier type remains disabled");
    }

    private static void boundaries() throws Exception {
        rejectsCode(() -> new PortalAccessPolicy(false, "https://portal.example.test").requireAvailable(), 503, "portal disabled by default");
        for (String invalid : List.of("", "http://portal.example.test", "https://user@portal.example.test", "https://portal.example.test/login",
                "https://portal.example.test?tenant=1", "https://portal.example.test#fragment", "https://portal.example.test:0", "https://portal.example.test:65536")) {
            rejectsCode(() -> new PortalAccessPolicy(true, invalid).requireAvailable(), 503, "invalid configured origin fails closed");
        }
        PortalAccessPolicy access = new PortalAccessPolicy(true, "https://PORTAL.example.test:443/");
        equal("https://portal.example.test", access.publicUrl(), "HTTPS origin canonicalized");
        IpUtils.setTrustedProxies(List.of("127.0.0.1/32", "10.0.0.0/8"));
        try {
            access.checkTransport(true, "203.0.113.1", null, "https://portal.example.test");
            checks++;
            access.checkTransport(false, "127.0.0.1", "https", "https://portal.example.test");
            checks++;
            rejectsCode(() -> access.checkTransport(false, "203.0.113.1", "https", null), 403, "untrusted protocol header ignored");
            rejectsCode(() -> access.checkTransport(false, "127.0.0.1", "https,http", null), 403, "ambiguous protocol header rejected");
            for (String invalid : List.of("null", "https://other.example.test", "http://portal.example.test", "https://portal.example.test:444", "https://portal.example.test.attacker.test")) {
                rejectsCode(() -> access.checkTransport(true, "203.0.113.1", null, invalid), 403, "foreign origin rejected");
            }
            equal("203.0.113.1", PortalClientAddress.resolve("203.0.113.1", "198.51.100.1"), "untrusted client forwarding ignored");
            equal("203.0.113.1", PortalClientAddress.resolve("127.0.0.1", "198.51.100.1,203.0.113.1,10.0.0.1"), "first untrusted hop wins over spoofed prefix");
            equal("127.0.0.1", PortalClientAddress.resolve("127.0.0.1", "example.test"), "DNS names never resolved");
            equal("127.0.0.1", PortalClientAddress.resolve("127.0.0.1", "203.0.113.1,"), "malformed hop rejected");
            equal("127.0.0.1", PortalClientAddress.resolve("127.0.0.1", "1.1.1.1,".repeat(21)), "overlong chain ignored");
            equal("unknown", PortalClientAddress.resolve(null, "203.0.113.1"), "missing transport address cannot trust header");
        } finally { IpUtils.setTrustedProxies(List.of()); }
        for (String action : List.of("login", "register", "activate")) {
            check(PortalPaths.publicEndpoint("POST", "/portal/tenant_1/" + action), "explicit anonymous POST exists");
            check(!PortalPaths.publicEndpoint("GET", "/portal/tenant_1/" + action), "GET cannot consume invitation or login");
        }
        check(PortalPaths.supported("GET", "/portal/session") && !PortalPaths.publicEndpoint("GET", "/portal/session"), "session route stays protected");
        check(PortalPaths.supported("POST", "/portal/logout") && !PortalPaths.publicEndpoint("POST", "/portal/logout"), "logout route stays protected");
        for (String route : List.of("/portal/oa/knowledge/list", "/portal/oa/knowledge/1", "/portal/oa/knowledge/9223372036854775807")) {
            check(PortalPaths.supported("GET", route) && !PortalPaths.publicEndpoint("GET", route), "knowledge reads require portal identity");
            check(!PortalPaths.supported("POST", route), "knowledge portal has no write alias");
        }
        for (String route : List.of("/portal/file/access", "/portal/file/download")) {
            check(PortalPaths.supported("POST", route) && PortalPaths.fileEndpoint("POST", route) && !PortalPaths.publicEndpoint("POST", route), "file POST requires independent portal identity");
            check(!PortalPaths.supported("GET", route) && !PortalPaths.fileEndpoint("GET", route), "file credentials cannot be exposed through GET");
        }
        check(PortalPaths.supported("POST", "/portal/file/upload") && !PortalPaths.publicEndpoint("POST", "/portal/file/upload"), "approved upload requires portal identity");
        check(!PortalPaths.supported("GET", "/portal/file/upload"), "upload is never an anonymous GET route");
        for (String route : List.of("/portal/file/upload/", "/portal/file/upload;extra", "/portal/file/download/", "/portal/file/download;extra", "/portal/oa/knowledge/0",
                "/portal/oa/knowledge/-1", "/portal/oa/knowledge/01", "/portal/oa/knowledge/1/versions", "/portal/oa/knowledge/1/files/1")) {
            check(!PortalPaths.supported("GET", route) && !PortalPaths.supported("POST", route), "unknown knowledge and file routes stay closed");
        }
        for (String invalid : List.of("/auth/portal/tenant/login", "/portal/tenant/login/", "/portal/tenant/login;other", "/portal/tenant/../login", "/portal//login", "/portal/" + "a".repeat(51) + "/login")) {
            check(!PortalPaths.supported("POST", invalid), "noncanonical route rejected");
        }
        ObjectMapper json = new ObjectMapper();
        for (String input : List.of("{\"loginAccount\":\"alice\",\"password\":\"secret\",\"customerId\":1}",
                "{\"loginAccount\":\"alice\",\"password\":\"secret\",\"tenantId\":100000}",
                "{\"loginAccount\":\"alice\",\"password\":\"secret\",\"roles\":[\"admin\"]}")) {
            try { json.readValue(input, PortalRequests.Login.class); throw new AssertionError("unknown login fields accepted"); }
            catch (com.fasterxml.jackson.databind.JsonMappingException expected) { checks++; }
        }
        PortalIdentityChecks.LimitStore store = new LimitStore();
        PortalRateLimits limits = new PortalRateLimits(store);
        for (int attempt = 0; attempt < 5; attempt++) limits.account("tenant", "private@example.test");
        rejectsCode(() -> limits.account("tenant", "private@example.test"), 429, "sixth account attempt throttled");
        for (int attempt = 0; attempt < 10; attempt++) limits.publicIp("login", "203.0.113.1");
        rejectsCode(() -> limits.publicIp("login", "203.0.113.1"), 429, "eleventh public IP attempt throttled");
        for (int attempt = 0; attempt < 60; attempt++) limits.user(new PortalIdentity(100L, 100000L, 200L, 300L, 0, 1));
        rejectsCode(() -> limits.user(new PortalIdentity(100L, 100000L, 200L, 300L, 0, 1)), 429, "sixty-first user request throttled");
        limits.user(new PortalIdentity(100L, 100001L, 200L, 300L, 0, 1));
        for (int attempt = 0; attempt < 20; attempt++) limits.file(new PortalIdentity(100L, 100000L, 200L, 300L, 0, 1));
        rejectsCode(() -> limits.file(new PortalIdentity(100L, 100000L, 200L, 300L, 0, 1)), 429, "twenty-first file request throttled independently");
        limits.file(new PortalIdentity(101L, 100000L, 200L, 300L, 0, 1));
        limits.file(new PortalIdentity(100L, 100001L, 200L, 300L, 0, 1));
        check(store.counts.keySet().stream().allMatch(key -> key.startsWith("cloudflow:portal:rate:") && !key.contains("private@example.test") && !key.contains("203.0.113.1")), "rate keys isolated and personally identifying values hashed");
        store.unavailable = true;
        rejectsCode(() -> limits.account("tenant", "alice"), 503, "Redis failure cannot disable authentication throttling");
    }

    private static final class LimitStore extends StringRedisTemplate {
        private final Map<String, Long> counts = new HashMap<>();
        private boolean unavailable;

        @Override
        public <Result> Result execute(RedisScript<Result> script, List<String> keys, Object... arguments) {
            if (unavailable) throw new IllegalStateException("isolated unavailable store");
            check(script.getScriptAsString().contains("EXPIRE") && script.getScriptAsString().contains("60"), "atomic minute expiry in Redis script");
            return script.getResultType().cast(counts.merge(keys.get(0), 1L, Long::sum));
        }
    }

    private static void rejectsCode(Runnable action, int code, String label) {
        try { action.run(); } catch (ServiceException expected) { equal(code, expected.getCode(), label); return; }
        throw new AssertionError(label);
    }

    private static void sessions() throws Exception {
        SaTokenConfig previousConfig = SaManager.getConfig();
        SaManager.setConfig(new SaTokenConfig().setDataRefreshPeriod(-1).setIsPrint(false));
        SaTokenDao previousDao = SaManager.getSaTokenDao();
        StpInterface previousPermissions = SaManager.getStpInterface();
        StpLogic previousLogic = StpUtil.getStpLogic();
        SaTokenDaoDefaultImpl ownedDao = new SaTokenDaoDefaultImpl();
        try {
            SaManager.setSaTokenDao(ownedDao);
            StpUtil.setStpLogic(new StpLogic("login"));
            TokenService internal = new TokenService();
            CloudFlowStpInterface permissions = new CloudFlowStpInterface();
            Field field = CloudFlowStpInterface.class.getDeclaredField("tokenService");
            field.setAccessible(true);
            field.set(permissions, internal);
            Field policyField = CloudFlowStpInterface.class.getDeclaredField("currentPermissions");
            policyField.setAccessible(true);
            policyField.set(permissions, new com.cloudflow.common.security.service.CurrentPermissionService(tenantId ->
                    new com.cloudflow.common.core.permission.TenantPermissionPolicy.Entitlement(null, null, 0, Set.of(), Set.of())));
            SaManager.setStpInterface(permissions);
            String internalToken = StpUtil.getStpLogic().createLoginSession(100L, new SaLoginParameter().setTimeout(3600));
            StpUtil.getSessionByLoginId(100L).set(TokenService.LOGIN_USER_SESSION_KEY,
                    Map.of("tenantId", 100000L, "permissions", List.of("system:user:edit"), "roles", List.of("admin")));
            PortalTokens tokens = new PortalTokens();
            PortalIdentity identity = new PortalIdentity(100L, 100000L, 200L, 300L, 0, 1);
            String token = tokens.create(identity);
            equal(identity, tokens.verify(token), "real portal token resolves isolated snapshot");
            check(tokens.verify(internalToken) == null, "internal token rejected by portal");
            check(internal.verifyToken(token) == null, "portal token rejected by internal domain");
            check(tokens.logic().getTokenTimeout(token) > 28790 && tokens.logic().getTokenTimeout(token) <= 28800,
                    "absolute lifetime is eight hours");
            equal(1800L, tokens.logic().getTokenUseActiveTimeoutOrGlobalConfig(token), "idle lifetime is thirty minutes");
            check(!tokens.logic().getConfig().getAutoRenew(), "portal absolute lifetime never renews");
            check(!tokens.logic().getConfig().getIsReadBody() && !tokens.logic().getConfig().getIsReadCookie(),
                    "portal only reads its dedicated header");
            check(!tokens.logic().hasPermission(100L, "crm:portal:ticket:list"), "token alone cannot bypass current-account verification");
            PortalContext.setVerified(identity);
            check(tokens.logic().hasPermission(100L, "crm:portal:ticket:list"), "verified request gets fixed portal permission");
            check(!tokens.logic().hasPermission(100L, "system:user:edit"), "same numeric ID cannot gain internal write");
            check(!tokens.logic().hasRole(100L, "admin"), "portal has no internal admin role");
            check(!tokens.logic().hasPermission(101L, "crm:portal:ticket:list"), "different ID cannot reuse request context");
            check(!permissions.getPermissionList(100L, "oauth2").contains("crm:portal:ticket:list"), "OAuth2 cannot inherit portal context");
            PortalContext.clear();
            check(PortalContext.permissions(100L).isEmpty(), "completed request loses portal permissions");
            String another = tokens.create(identity);
            check(!token.equals(another), "sessions have independent tokens");
            tokens.end(token);
            check(tokens.verify(token) == null, "logout ends only selected portal token");
            check(tokens.verify(another) != null, "logout retains another portal session");
            check(internal.verifyToken(internalToken) != null, "portal logout retains internal same-ID session");
            tokens.endAccount(100L);
            check(tokens.verify(another) == null, "account revocation ends all portal sessions");
            check(internal.verifyToken(internalToken) != null, "portal account revocation cannot logout internal user");
            check(PortalIdentity.from(Map.of("portalUserId", "100.0")) == null, "malformed persisted identity denied");
            equal(identity, PortalIdentity.from(identity.snapshot()), "serialized identity round-trip");
        } finally {
            PortalContext.clear();
            StpUtil.setStpLogic(previousLogic);
            SaManager.setStpInterface(previousPermissions);
            SaManager.setSaTokenDao(previousDao);
            ownedDao.destroy();
            if (previousDao instanceof SaTokenDaoDefaultImpl previousInProcess) previousInProcess.destroy();
            SaManager.setConfig(previousConfig);
        }
    }

    private static void contactFailures() {
        Request request = Request.create(Request.HttpMethod.GET, "https://crm.invalid/contacts", Map.of(),
                new byte[0], StandardCharsets.UTF_8, null);
        for (int status : List.of(400, 403, 404, 409, 429, 500, 503)) {
            int expected = status == 403 || status == 409 ? status : 503;
            FeignException upstream = FeignException.errorStatus("portal-contact", Response.builder()
                    .status(status).reason("REMOTE_PRIVATE_DETAIL").request(request).headers(Map.of())
                    .body("REMOTE_PRIVATE_DETAIL", StandardCharsets.UTF_8).build());
            rejectedContact(() -> { throw upstream; }, expected);
            rejectedContact(() -> { throw new IllegalStateException("REMOTE_PRIVATE_DETAIL", upstream); }, expected);
            rejectedContact(() -> R.fail(status, "REMOTE_PRIVATE_DETAIL"), expected);
        }
        rejectedContact(() -> null, 503);
        rejectedContact(() -> { throw new IllegalStateException("REMOTE_PRIVATE_DETAIL"); }, 503);
        equal(List.of(200L), contactClient(() -> R.ok(List.of(200L))).visibleIds(), "successful contact response retained");
    }

    private static PortalContacts contactClient(Supplier<?> response) {
        RemoteCrmPortalService remote = (RemoteCrmPortalService) Proxy.newProxyInstance(PortalIdentityChecks.class.getClassLoader(),
                new Class<?>[] { RemoteCrmPortalService.class }, (proxy, method, arguments) -> response.get());
        return new PortalContacts(remote);
    }

    private static void rejectedContact(Supplier<?> response, int status) {
        try {
            contactClient(response).visibleIds();
            throw new AssertionError("remote contact failure was accepted");
        } catch (ServiceException failure) {
            equal(status, failure.getCode(), "remote contact HTTP and wrapped failures retain the safe status");
            check(!failure.getMessage().contains("REMOTE_PRIVATE_DETAIL"), "upstream response details stay private");
        }
    }

    private static SysPortalUser account() {
        SysPortalUser user = new SysPortalUser();
        user.setPortalUserId(100L);
        user.setTenantId(100000L);
        user.setCustomerId(200L);
        user.setRefBizId(300L);
        user.setUserType("CUSTOMER_CONTACT");
        user.setRefBizType("CRM_CONTACT");
        user.setStatus("ACTIVE");
        user.setSessionVersion(0);
        user.setFailCount(0);
        user.setDeleted(0);
        return user;
    }

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }

    private static void equal(Object expected, Object actual, String label) { check(expected.equals(actual), label); }

    private static void rejects(Runnable action, String label) {
        try { action.run(); } catch (com.cloudflow.common.core.exception.ServiceException expected) { checks++; return; }
        throw new AssertionError(label);
    }
}
