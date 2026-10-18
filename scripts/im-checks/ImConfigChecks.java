package com.cloudflow.auth.im;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.controller.system.ImConfigController;
import com.cloudflow.common.log.annotation.SysLog;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Consumer;

public final class ImConfigChecks {
    private static int assertions;
    static final String APP_KEY = "unused-provider-key-never-log";
    static final String APP_SECRET = "app-secret-never-log";
    static final String CALLBACK_TOKEN = "callbackTokenNeverLog";
    static final String AES_KEY = Base64.getEncoder().withoutPadding().encodeToString(new byte[32]);

    public static void main(String[] arguments) throws Exception {
        try (ValidatorFactory validators = Validation.buildDefaultValidatorFactory()) {
            ImProperties properties = properties();
            ImSecretCipher cipher = new ImSecretCipher(properties);
            ImConfigRules rules = new ImConfigRules(properties, cipher, validators.getValidator(), new ObjectMapper());
            actions(rules, cipher);
            invalid(rules);
            callbacks(rules, properties);
            serialization();
            annotations();
        }
        System.out.println("G4_IM_CONFIG_RULES: assertions=" + assertions
                + "; failed=0; mysql=false; redis=false; http=false; production_modified=false");
    }

    private static void actions(ImConfigRules rules, ImSecretCipher cipher) {
        ImConfigRow created = row();
        ImConfigRequest request = createRequest();
        rules.request(request, true);
        rules.assign(created, request);
        equal(APP_KEY, cipher.decrypt(100000, "WECOM", ImSecretCipher.Field.APP_KEY, created.getAppKeyEncrypted()), "unused app key encrypted");
        equal(APP_SECRET, rules.credentials(withId(created)).appSecret(), "credential assembled from encrypted row");
        equal(CALLBACK_TOKEN, rules.credentials(created).callbackToken(), "callback token round trip");
        equal(AES_KEY, rules.credentials(created).aesKey(), "AES key round trip");
        String previous = created.getAppSecretEncrypted();
        rules.assign(created, editRequest(created));
        equal(previous, created.getAppSecretEncrypted(), "KEEP preserves actual ciphertext");
        ImConfigRequest replacement = editRequest(created);
        replacement.setAppSecret(change(ImConfigRequest.SecretAction.REPLACE, APP_SECRET));
        rules.assign(created, replacement);
        check(!previous.equals(created.getAppSecretEncrypted()), "replacement uses fresh IV even for same value");
        ImConfigRequest cleared = editRequest(created);
        cleared.setAppKey(change(ImConfigRequest.SecretAction.CLEAR, null));
        cleared.setToken(change(ImConfigRequest.SecretAction.CLEAR, null));
        cleared.setAesKey(change(ImConfigRequest.SecretAction.CLEAR, null));
        rules.assign(created, cleared);
        check(created.getAppKeyEncrypted() == null && created.getTokenEncrypted() == null && created.getAesKeyEncrypted() == null,
                "optional secrets clear to actual NULL");
        ImConfigRequest requiredClear = editRequest(created);
        requiredClear.setAppSecret(change(ImConfigRequest.SecretAction.CLEAR, null));
        rejected(() -> rules.assign(created, requiredClear), "IM_CONFIGURATION_INVALID");
        for (ImConfigRequest.SecretAction action : List.of(ImConfigRequest.SecretAction.CLEAR, ImConfigRequest.SecretAction.KEEP)) {
            for (String ambiguous : List.of("", "new-value")) {
                ImConfigRequest candidate = editRequest(created);
                candidate.setToken(change(action, ambiguous));
                rejected(() -> rules.assign(created, candidate), "IM_CONFIGURATION_INVALID");
            }
        }
        ImConfigRequest keepNew = createRequest();
        keepNew.setAppKey(change(ImConfigRequest.SecretAction.KEEP, null));
        rejected(() -> rules.assign(row(), keepNew), "IM_CONFIGURATION_INVALID");
        ImConfigRow damaged = row();
        rules.assign(damaged, createRequest());
        withId(damaged);
        damaged.setAppSecretEncrypted("plain-secret");
        rejected(() -> rules.assign(damaged, editRequest(damaged)), "IM_SECRET_UNAVAILABLE");
        ImConfigRules.version(created, 0);
        for (Integer version : Arrays.asList(null, -1, 1, Integer.MAX_VALUE)) {
            rejected(() -> ImConfigRules.version(created, version), "IM_VERSION_CONFLICT");
        }
        rejected(() -> ImConfigRules.version(null, 0), "IM_CONFIG_NOT_FOUND");
    }

    private static void invalid(ImConfigRules rules) {
        rejected(() -> rules.request(null, true), "IM_CONFIGURATION_INVALID");
        for (Consumer<ImConfigRequest> mutation : List.<Consumer<ImConfigRequest>>of(
                request -> request.setCorpId("corp?injected"), request -> request.setAgentId("01"),
                request -> request.setAgentId("9223372036854775808"), request -> request.setAgentId("0"),
                request -> request.setConfigId(100L), request -> request.setVersion(0),
                request -> request.setStatus("0"), request -> request.setStatus("ENABLED"),
                request -> request.setSyncEnabled(null), request -> request.setSyncEnabled(true),
                request -> request.setLoginEnabled(true), request -> request.setTodoEnabled(true),
                request -> request.setSyncCron("@daily"), request -> request.setSyncCron("invalid"),
                request -> request.setAppSecret(null), request -> request.setCallbackUrl("https://evil.test"))) {
            ImConfigRequest request = createRequest();
            mutation.accept(request);
            rejected(() -> rules.request(request, true), "IM_CONFIGURATION_INVALID");
        }
        for (String provider : List.of("DINGTALK", "FEISHU", "wecom", "OTHER")) {
            ImConfigRequest request = createRequest();
            request.setImType(provider);
            rejected(() -> rules.request(request, true), "IM_PROVIDER_UNSUPPORTED");
        }
        for (String invalid : List.of("", "a".repeat(1025), "secret?injected", "secret\n")) {
            ImConfigRequest request = createRequest();
            request.setAppSecret(change(ImConfigRequest.SecretAction.REPLACE, invalid));
            rejected(() -> { rules.request(request, true); rules.assign(row(), request); }, "IM_CONFIGURATION_INVALID");
        }
        ImConfigRequest request = createRequest();
        ImConfigRequest.SyncScope scope = new ImConfigRequest.SyncScope();
        scope.setLocalRootDeptId(100L);
        scope.setRemoteDepartmentIds(List.of(4L, 1L));
        scope.setPrimaryDepartments(Map.of("user-b", 4L, "user-a", 1L));
        request.setSyncScope(scope);
        request.setSyncEnabled(true);
        request.setSyncCron("0 0 2 * * ?");
        rules.request(request, true);
        ImConfigRow row = row();
        rules.assign(row, request);
        equal(List.of(1L, 4L), rules.readScope(row.getSyncScope()).getRemoteDepartmentIds(), "department selection normalized");
        equal(Map.of("user-a", 1L, "user-b", 4L), rules.readScope(row.getSyncScope()).getPrimaryDepartments(), "explicit primary choices preserved");
        scope.setRemoteDepartmentIds(List.of(1L, 1L));
        rejected(() -> rules.request(request, true), "IM_CONFIGURATION_INVALID");
        scope.setRemoteDepartmentIds(List.of(1L));
        scope.setPrimaryDepartments(Map.of("user\n", 1L));
        rejected(() -> rules.request(request, true), "IM_CONFIGURATION_INVALID");
        rejected(() -> rules.readScope("{\"localRootDeptId\":1,\"remoteDepartmentIds\":[1],\"tenantId\":10}"), "IM_CONFIGURATION_INVALID");
        rejected(() -> rules.readScope("{\"localRootDeptId\":1,\"localRootDeptId\":2,\"remoteDepartmentIds\":[1]}"), "IM_CONFIGURATION_INVALID");
    }

    private static void callbacks(ImConfigRules rules, ImProperties properties) {
        equal("https://cloudflow.example", ImConfigRules.origin("https://CloudFlow.Example:443/"), "canonical origin");
        equal("https://cloudflow.example:8443", ImConfigRules.origin("https://cloudflow.example:8443"), "deployment HTTPS port");
        for (String origin : List.of("http://cloudflow.example", "https://user@cloudflow.example", "https://cloudflow.example/path",
                "https://cloudflow.example?query=1", "https://cloudflow.example#fragment", "https://cloudflow.example:0",
                "https://cloudflow.example:65536", "https://cloudflow.example\\@evil.test", " https://cloudflow.example", "https://cloudflow.example/%2f")) {
            equal(null, ImConfigRules.origin(origin), "unsafe origin rejected");
        }
        ImConfigRow row = row();
        rules.assign(row, createRequest());
        withId(row);
        equal("https://cloudflow.example/api/auth/im/callback/100", rules.expectedCallbackUrl(100L), "gateway StripPrefix compatible callback");
        ImConfigRequest request = editRequest(row);
        request.setLoginEnabled(true);
        request.setTodoEnabled(true);
        request.setCallbackUrl(rules.expectedCallbackUrl(row.getConfigId()));
        rules.request(request, false);
        rules.assign(row, request);
        for (String url : List.of("https://evil.test/api/auth/im/callback/100", "https://cloudflow.example/api/auth/im/callback/101",
                "https://cloudflow.example/api/auth/im/callback/100?query=1", "https://cloudflow.example/api/auth/im/callback/%31%30%30", "")) {
            request.setCallbackUrl(url);
            rejected(() -> rules.assign(row, request), "IM_CONFIGURATION_INVALID");
        }
        request.setCallbackUrl(null);
        rejected(() -> rules.assign(row, request), "IM_CONFIGURATION_INVALID");
        request.setCallbackUrl(rules.expectedCallbackUrl(100L));
        request.setToken(change(ImConfigRequest.SecretAction.CLEAR, null));
        rejected(() -> rules.assign(row, request), "IM_CONFIGURATION_INVALID");
        properties.setPublicUrl(null);
        equal(null, rules.expectedCallbackUrl(100L), "no fabricated deployment URL");
        properties.setEnabled(false);
        rejected(rules::requireDeployment, "IM_DISABLED");
        check(rules.canConfigure(), "encrypted draft editing possible while vendor deployment disabled");
        properties.setSecretKey(null);
        check(!rules.canConfigure(), "no draft writes without independent encryption key");
        rejected(() -> rules.request(createRequest(), true), "IM_SECRET_UNAVAILABLE");
    }

    private static void serialization() throws Exception {
        ObjectMapper json = new ObjectMapper();
        ImConfigRequest request = createRequest();
        String serialized = json.writeValueAsString(request);
        for (String secret : List.of(APP_KEY, APP_SECRET, CALLBACK_TOKEN, AES_KEY)) {
            check(!serialized.contains(secret) && !request.toString().contains(secret), "request secrets write-only");
        }
        ImConfigRow row = row();
        row.setAppKeyEncrypted(APP_KEY);
        row.setAppSecretEncrypted(APP_SECRET);
        row.setTokenEncrypted(CALLBACK_TOKEN);
        row.setAesKeyEncrypted(AES_KEY);
        for (String secret : List.of(APP_KEY, APP_SECRET, CALLBACK_TOKEN, AES_KEY)) {
            check(!json.writeValueAsString(row).contains(secret) && !row.toString().contains(secret), "row secrets excluded from JSON and string");
        }
        for (Class<?> type : List.of(ImConfigRequest.class, ImConfigRequest.SecretChange.class, ImConfigRequest.SyncScope.class, ImVersionRequest.class)) {
            boolean rejected = false;
            try { json.readValue("{\"tenantId\":999999}", type); }
            catch (com.fasterxml.jackson.core.JsonProcessingException failure) { rejected = true; }
            check(rejected, "client identity and undeclared fields rejected");
        }
    }

    private static void annotations() {
        for (Method method : ImConfigController.class.getDeclaredMethods()) {
            if (method.getName().equals("responseHeaders")) continue;
            check(method.isAnnotationPresent(SaCheckPermission.class), "all routes declare business permissions");
            check(method.isAnnotationPresent(SysLog.class) && !method.getAnnotation(SysLog.class).logParams(), "route logging omits request credentials");
        }
    }

    static ImProperties properties() {
        ImProperties properties = new ImProperties();
        properties.setEnabled(true);
        properties.setSecretKey("im-config-test-key-" + "K".repeat(48));
        properties.setPublicUrl("https://cloudflow.example");
        return properties;
    }

    static ImConfigRow row() {
        ImConfigRow row = new ImConfigRow();
        row.setTenantId(100000L);
        row.setImType("WECOM");
        row.setVersion(0);
        return row;
    }

    private static ImConfigRow withId(ImConfigRow row) { row.setConfigId(100L); return row; }

    static ImConfigRequest createRequest() {
        ImConfigRequest request = new ImConfigRequest();
        request.setImType("WECOM");
        request.setCorpId("corpA");
        request.setAgentId("77");
        request.setAppKey(change(ImConfigRequest.SecretAction.REPLACE, APP_KEY));
        request.setAppSecret(change(ImConfigRequest.SecretAction.REPLACE, APP_SECRET));
        request.setToken(change(ImConfigRequest.SecretAction.REPLACE, CALLBACK_TOKEN));
        request.setAesKey(change(ImConfigRequest.SecretAction.REPLACE, AES_KEY));
        request.setSyncEnabled(false);
        request.setLoginEnabled(false);
        request.setMessageEnabled(false);
        request.setTodoEnabled(false);
        request.setStatus("DISABLED");
        return request;
    }

    static ImConfigRequest editRequest(ImConfigRow row) {
        ImConfigRequest request = createRequest();
        request.setConfigId(row.getConfigId());
        request.setVersion(row.getVersion());
        request.setAppKey(change(ImConfigRequest.SecretAction.KEEP, null));
        request.setAppSecret(change(ImConfigRequest.SecretAction.KEEP, null));
        request.setToken(change(ImConfigRequest.SecretAction.KEEP, null));
        request.setAesKey(change(ImConfigRequest.SecretAction.KEEP, null));
        return request;
    }

    static ImConfigRequest.SecretChange change(ImConfigRequest.SecretAction action, String value) {
        ImConfigRequest.SecretChange change = new ImConfigRequest.SecretChange();
        change.setAction(action);
        change.setValue(value);
        return change;
    }

    static void rejected(Runnable operation, String reason) {
        try { operation.run(); throw new AssertionError("expected rejection " + reason); }
        catch (ImFailure failure) { equal(reason, failure.getReasonCode(), "safe reason code"); }
    }

    static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    static void equal(Object expected, Object actual, String message) { check(Objects.equals(expected, actual), message); }
}
