package com.cloudflow.auth.im;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validator;
import java.net.URI;
import java.util.Locale;
import java.util.Objects;
import java.util.TreeMap;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Component;

@Component
public class ImConfigRules {
    private final ImProperties properties;
    private final ImSecretCipher cipher;
    private final Validator validator;
    private final ObjectMapper json;

    public ImConfigRules(ImProperties properties, ImSecretCipher cipher, Validator validator, ObjectMapper json) {
        this.properties = properties;
        this.cipher = cipher;
        this.validator = validator;
        this.json = json.copy().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    }

    public void request(ImConfigRequest request, boolean creating) {
        if (request == null || !validator.validate(request).isEmpty()) throw ImFailure.configuration();
        if (!"WECOM".equals(request.getImType())) throw ImFailure.unsupported();
        if (!request.getCorpId().matches("[A-Za-z0-9_-]{1,100}")) throw ImFailure.configuration();
        agent(request.getAgentId());
        if (!"ENABLED".equals(request.getStatus()) && !"DISABLED".equals(request.getStatus())) throw ImFailure.configuration();
        if (creating && (request.getConfigId() != null || request.getVersion() != null
                || !"DISABLED".equals(request.getStatus()) || request.getCallbackUrl() != null
                || request.getLoginEnabled() || request.getTodoEnabled())) throw ImFailure.configuration();
        if (!creating && (request.getConfigId() == null || request.getVersion() == null)) throw ImFailure.conflict();
        if (request.getVersion() != null && request.getVersion() == Integer.MAX_VALUE) throw ImFailure.conflict();
        if (request.getSyncCron() != null && (!request.getSyncCron().equals(request.getSyncCron().trim())
                || request.getSyncCron().startsWith("@") || !CronExpression.isValidExpression(request.getSyncCron()))) {
            throw ImFailure.configuration();
        }
        scope(request.getSyncScope());
        if (request.getSyncEnabled() && (request.getSyncScope() == null || request.getSyncCron() == null)) throw ImFailure.configuration();
        if ("ENABLED".equals(request.getStatus())) requireDeployment();
        cipher.requireKey();
    }

    public void assign(ImConfigRow row, ImConfigRequest request) {
        row.setAppKeyEncrypted(secret(row, ImSecretCipher.Field.APP_KEY, request.getAppKey(), row.getAppKeyEncrypted()));
        row.setAppSecretEncrypted(secret(row, ImSecretCipher.Field.APP_SECRET, request.getAppSecret(), row.getAppSecretEncrypted()));
        row.setTokenEncrypted(secret(row, ImSecretCipher.Field.TOKEN, request.getToken(), row.getTokenEncrypted()));
        row.setAesKeyEncrypted(secret(row, ImSecretCipher.Field.AES_KEY, request.getAesKey(), row.getAesKeyEncrypted()));
        row.setCorpId(request.getCorpId());
        row.setAgentId(request.getAgentId());
        row.setCallbackUrl(request.getCallbackUrl());
        row.setSyncEnabled(request.getSyncEnabled());
        row.setSyncCron(request.getSyncCron());
        row.setLoginEnabled(request.getLoginEnabled());
        row.setMessageEnabled(request.getMessageEnabled());
        row.setTodoEnabled(request.getTodoEnabled());
        row.setSyncScope(scopeJson(request.getSyncScope()));
        row.setStatus(request.getStatus());
        credentials(row, row.getConfigId() == null ? 1 : row.getConfigId());
        callback(row);
    }

    public void requireDeployment() {
        if (!properties.isEnabled()) throw ImFailure.disabled();
        cipher.requireKey();
    }

    public boolean canConfigure() {
        try { cipher.requireKey(); return true; }
        catch (ImFailure failure) { return false; }
    }

    public String reason() {
        if (!properties.isEnabled()) return "企业通信接入未启用，原账号登录和审批照常使用";
        if (!canConfigure()) return "企业通信独立加密密钥未配置，配置写入和外部请求已停用";
        if (origin(properties.getPublicUrl()) == null) return "未配置有效的HTTPS站点地址，扫码登录和待办回调不可启用";
        return "企业微信按租户独立配置；钉钉、飞书尚未实现";
    }

    public String expectedCallbackUrl(Long configId) {
        String origin = origin(properties.getPublicUrl());
        return origin == null || configId == null || configId <= 0 ? null : origin + "/api/auth/im/callback/" + configId;
    }

    public WeComCredentials credentials(ImConfigRow row) {
        return credentials(row, row.getConfigId());
    }

    public ImConfigRequest.SyncScope readScope(String value) {
        if (value == null) return null;
        try {
            ImConfigRequest.SyncScope result = json.readValue(value, ImConfigRequest.SyncScope.class);
            scope(result);
            return result;
        } catch (JsonProcessingException failure) { throw ImFailure.configuration(); }
    }

    public static void version(ImConfigRow row, Integer expected) {
        if (row == null) throw ImFailure.notFound();
        if (expected == null || expected < 0 || expected == Integer.MAX_VALUE || !Objects.equals(row.getVersion(), expected)) {
            throw ImFailure.conflict();
        }
    }

    private String secret(ImConfigRow row, ImSecretCipher.Field field, ImConfigRequest.SecretChange change, String previous) {
        if (change == null || change.getAction() == null) throw ImFailure.configuration();
        if (change.getAction() != ImConfigRequest.SecretAction.REPLACE && change.getValue() != null) throw ImFailure.configuration();
        return switch (change.getAction()) {
            case KEEP -> {
                if (row.getConfigId() == null) throw ImFailure.configuration();
                if (previous != null) cipher.decrypt(row.getTenantId(), row.getImType(), field, previous);
                if (previous == null && field == ImSecretCipher.Field.APP_SECRET) throw ImFailure.configuration();
                yield previous;
            }
            case CLEAR -> {
                if (field == ImSecretCipher.Field.APP_SECRET) throw ImFailure.configuration();
                yield null;
            }
            case REPLACE -> cipher.encrypt(row.getTenantId(), row.getImType(), field, change.getValue());
        };
    }

    private WeComCredentials credentials(ImConfigRow row, Long configId) {
        if (configId == null || !"WECOM".equals(row.getImType())) throw ImFailure.configuration();
        return new WeComCredentials(row.getTenantId(), configId, row.getVersion(), row.getCorpId(), agent(row.getAgentId()),
                decrypt(row, ImSecretCipher.Field.APP_SECRET, row.getAppSecretEncrypted()),
                decrypt(row, ImSecretCipher.Field.TOKEN, row.getTokenEncrypted()),
                decrypt(row, ImSecretCipher.Field.AES_KEY, row.getAesKeyEncrypted()));
    }

    private String decrypt(ImConfigRow row, ImSecretCipher.Field field, String encrypted) {
        return encrypted == null ? null : cipher.decrypt(row.getTenantId(), row.getImType(), field, encrypted);
    }

    private void callback(ImConfigRow row) {
        String expected = expectedCallbackUrl(row.getConfigId());
        if (row.getCallbackUrl() != null && (expected == null || !expected.equals(row.getCallbackUrl()))) throw ImFailure.configuration();
        if (Boolean.TRUE.equals(row.getLoginEnabled()) || Boolean.TRUE.equals(row.getTodoEnabled())) {
            if (row.getCallbackUrl() == null || row.getTokenEncrypted() == null || row.getAesKeyEncrypted() == null) {
                throw ImFailure.configuration();
            }
        }
    }

    private void scope(ImConfigRequest.SyncScope scope) {
        if (scope == null) return;
        if (!validator.validate(scope).isEmpty()) throw ImFailure.configuration();
        ImOrgScope.copy(scope);
    }

    private String scopeJson(ImConfigRequest.SyncScope scope) {
        if (scope == null) return null;
        ImConfigRequest.SyncScope normalized = new ImConfigRequest.SyncScope();
        normalized.setLocalRootDeptId(scope.getLocalRootDeptId());
        normalized.setRemoteDepartmentIds(scope.getRemoteDepartmentIds().stream().sorted().toList());
        normalized.setPrimaryDepartments(scope.getPrimaryDepartments() == null ? null : new TreeMap<>(scope.getPrimaryDepartments()));
        try { return json.writeValueAsString(normalized); }
        catch (JsonProcessingException failure) { throw ImFailure.configuration(); }
    }

    private static long agent(String value) {
        if (value == null || !value.matches("[1-9][0-9]{0,18}")) throw ImFailure.configuration();
        try { return Long.parseLong(value); }
        catch (NumberFormatException failure) { throw ImFailure.configuration(); }
    }

    static String origin(String value) {
        if (value == null || value.isBlank() || value.length() > 900 || value.contains("\\")
                || value.codePoints().anyMatch(character -> character <= 32 || character >= 127)) return null;
        try {
            URI uri = URI.create(value);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null
                    || uri.getRawQuery() != null || uri.getRawFragment() != null || uri.getPort() == 0 || uri.getPort() > 65535
                    || !(uri.getRawPath().isEmpty() || "/".equals(uri.getRawPath()))) return null;
            return "https://" + uri.getHost().toLowerCase(Locale.ROOT)
                    + (uri.getPort() == -1 || uri.getPort() == 443 ? "" : ":" + uri.getPort());
        } catch (IllegalArgumentException failure) { return null; }
    }
}
