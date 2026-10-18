package com.cloudflow.auth.im;

import com.cloudflow.common.security.cookie.AuthCookieSupport;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Enumeration;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
public class ImBindingHttp {
    private final ImProperties properties;
    private final ObjectMapper json;

    public ImBindingHttp(ImProperties properties, ObjectMapper json) {
        this.properties = properties;
        this.json = json.copy().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION).enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    }

    public JsonNode submission(HttpServletRequest request, Set<String> fields) {
        parameters(request, Set.of());
        String origin = ImConfigRules.origin(properties.getPublicUrl());
        if (origin == null || !origin.equals(header(request, "Origin"))
                || "cross-site".equalsIgnoreCase(header(request, "Sec-Fetch-Site"))) throw ImFailure.bindingTransport();
        String csrf = null;
        if (request.getCookies() != null) for (Cookie cookie : request.getCookies()) {
            if (!AuthCookieSupport.CSRF_COOKIE_NAME.equals(cookie.getName())) continue;
            if (csrf != null) throw ImFailure.bindingTransport();
            csrf = cookie.getValue();
        }
        if (csrf == null || !csrf.matches("[A-Za-z0-9_-]{43}") || !ImLoginChallenges.equal(csrf, header(request, AuthCookieSupport.CSRF_HEADER_NAME))) {
            throw ImFailure.bindingTransport();
        }
        try {
            byte[] bytes = request.getInputStream().readNBytes(4097);
            if (bytes.length > 4096) throw ImFailure.bindingRequest();
            JsonNode body = json.readTree(bytes);
            if (body == null || !body.isObject()) throw ImFailure.bindingRequest();
            java.util.Iterator<String> names = body.fieldNames();
            while (names.hasNext()) if (!fields.contains(names.next())) throw ImFailure.bindingRequest();
            return body;
        } catch (IOException failure) { throw ImFailure.bindingRequest(); }
    }

    public ImBindingIdentity.Credentials credentials(HttpServletRequest request) {
        JsonNode body = submission(request, Set.of("password", "totpCode"));
        if (!body.path("password").isTextual() || body.hasNonNull("totpCode") && !body.path("totpCode").isTextual()) throw ImFailure.bindingRequest();
        return new ImBindingIdentity.Credentials(body.path("password").asText(), body.hasNonNull("totpCode") ? body.path("totpCode").asText() : null);
    }

    public ImBindingAccounts.Selection selection(HttpServletRequest request) {
        JsonNode body = submission(request, Set.of("mappingId", "version"));
        JsonNode mappingId = body.path("mappingId");
        JsonNode version = body.path("version");
        if (!mappingId.isIntegralNumber() || !mappingId.canConvertToLong() || !version.isIntegralNumber() || !version.canConvertToInt()) {
            throw ImFailure.bindingRequest();
        }
        return new ImBindingAccounts.Selection(mappingId.longValue(), version.intValue());
    }

    public static void parameters(HttpServletRequest request, Set<String> allowed) {
        if (!allowed.containsAll(request.getParameterMap().keySet())) throw ImFailure.bindingRequest();
        for (String[] values : request.getParameterMap().values()) if (values == null || values.length != 1) throw ImFailure.bindingRequest();
    }

    public static String parameter(HttpServletRequest request, String name, int maximum) {
        String value = request.getParameter(name);
        if (value == null || value.isBlank() || value.length() > maximum || value.codePoints().anyMatch(Character::isISOControl)) throw ImFailure.bindingRequest();
        return value;
    }

    public static void headers(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store"); response.setHeader("Pragma", "no-cache");
        response.setHeader("Referrer-Policy", "no-referrer"); response.setHeader("X-Content-Type-Options", "nosniff");
    }

    private static String header(HttpServletRequest request, String name) {
        Enumeration<String> values = request.getHeaders(name);
        if (values == null || !values.hasMoreElements()) return null;
        String value = values.nextElement();
        if (values.hasMoreElements() || value == null || value.length() > 1024 || value.codePoints().anyMatch(Character::isISOControl)) throw ImFailure.bindingTransport();
        return value;
    }
}
