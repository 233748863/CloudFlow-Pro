package com.cloudflow.auth.oauth2;

import com.cloudflow.common.security.oauth2.OAuthFailure;
import com.cloudflow.common.security.oauth2.OAuthDigests;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Collections;
import java.util.Map;
import java.util.Set;
import lombok.Data;
import lombok.ToString;

public final class OAuthProtocolRequests {
    private OAuthProtocolRequests() { }

    public static Begin authorize(HttpServletRequest request) {
        Map<String, String[]> parameters = parameters(request, Set.of("response_type", "client_id", "redirect_uri", "scope",
                "state", "code_challenge", "code_challenge_method"), false);
        return new Begin(value(parameters, "response_type"), value(parameters, "client_id"), value(parameters, "redirect_uri"),
                value(parameters, "scope"), value(parameters, "state"), value(parameters, "code_challenge"), value(parameters, "code_challenge_method"));
    }

    public static Token token(HttpServletRequest request) {
        Map<String, String[]> parameters = parameters(request, Set.of("grant_type", "client_id", "code", "redirect_uri", "code_verifier", "refresh_token", "scope"), true);
        return new Token(credentials(request, value(parameters, "client_id")), value(parameters, "grant_type"),
                value(parameters, "code"), value(parameters, "redirect_uri"), value(parameters, "code_verifier"),
                value(parameters, "refresh_token"), value(parameters, "scope"));
    }

    public static Revocation revoke(HttpServletRequest request) {
        Map<String, String[]> parameters = parameters(request, Set.of("client_id", "token", "token_type_hint"), true);
        return new Revocation(credentials(request, value(parameters, "client_id")), value(parameters, "token"));
    }

    private static Credentials credentials(HttpServletRequest request, String bodyClientId) {
        java.util.List<String> headers = Collections.list(request.getHeaders("Authorization"));
        if (headers.isEmpty()) return new Credentials(clientKey(bodyClientId), null, false);
        if (headers.size() != 1 || !headers.get(0).startsWith("Basic ") || headers.get(0).length() > 1024) throw invalidClient();
        try {
            byte[] bytes = Base64.getDecoder().decode(headers.get(0).substring(6));
            String pair = new String(bytes, StandardCharsets.US_ASCII);
            if (!java.util.Arrays.equals(bytes, pair.getBytes(StandardCharsets.US_ASCII))) throw invalidClient();
            int colon = pair.indexOf(':');
            if (colon <= 0 || pair.indexOf(':', colon + 1) >= 0) throw invalidClient();
            String clientKey = clientKey(pair.substring(0, colon));
            if (bodyClientId != null && !bodyClientId.equals(clientKey)) throw invalidClient();
            return new Credentials(clientKey, pair.substring(colon + 1), true);
        } catch (IllegalArgumentException invalid) { throw invalidClient(); }
    }

    private static String clientKey(String value) {
        if (value == null || !value.matches("[A-Za-z0-9_-]{1,64}")) throw invalidClient();
        return value;
    }

    private static Map<String, String[]> parameters(HttpServletRequest request, Set<String> allowed, boolean form) {
        if (form && (request.getQueryString() != null || request.getContentType() == null
                || !request.getContentType().split(";", 2)[0].trim().equalsIgnoreCase("application/x-www-form-urlencoded"))) {
            throw OAuthFailure.invalid("令牌协议只接受表单正文，不能混用查询参数");
        }
        if (request.getContentLengthLong() > 16384) throw OAuthFailure.invalid("授权请求过大");
        Map<String, String[]> parameters = request.getParameterMap();
        int length = 0;
        for (Map.Entry<String, String[]> entry : parameters.entrySet()) {
            if (!allowed.contains(entry.getKey()) || entry.getValue() == null || entry.getValue().length != 1
                    || entry.getValue()[0] == null || entry.getValue()[0].length() > 4096) throw OAuthFailure.invalid("授权参数重复、未知或超出限制");
            length += entry.getKey().length() + entry.getValue()[0].length();
        }
        if (length > 16384) throw OAuthFailure.invalid("授权请求过大");
        return parameters;
    }

    private static String value(Map<String, String[]> parameters, String key) {
        String[] value = parameters.get(key);
        return value == null ? null : value[0];
    }

    public static OAuthFailure invalidClient() { return new OAuthFailure("invalid_client", "客户端认证失败", 401); }

    public record Begin(String responseType, String clientId, String redirectUri, String scope, String state,
            String codeChallenge, String codeChallengeMethod) {
        @Override public String toString() { return "OAuthBegin[REDACTED]"; }
    }

    public record Credentials(String clientId, String clientSecret, boolean basic) {
        @Override public String toString() { return "OAuthCredentials[REDACTED]"; }
    }

    public record Token(Credentials credentials, String grantType, String code, String redirectUri, String verifier, String refreshToken, String scope) {
        @Override public String toString() { return "OAuthTokenRequest[REDACTED]"; }
    }

    public record Revocation(Credentials credentials, String token) {
        @Override public String toString() { return "OAuthRevocationRequest[REDACTED]"; }
    }

    @Data
    @ToString(onlyExplicitlyIncluded = true)
    public static class Consent {
        @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
        private String requestToken;
        private Boolean approve;
        private java.util.List<String> scopes;

        public String submissionKey() {
            return OAuthDigests.token(requestToken) ? OAuthDigests.hash(requestToken) : "invalid";
        }
    }
}
