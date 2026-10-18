package com.cloudflow.common.job.security;

import com.cloudflow.common.core.constant.SecurityConstants;
import org.springframework.http.HttpHeaders;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.Base64;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Only the internal job protocol uses these credentials. Keys and signatures must never be logged. */
public final class JobRequestSignature {
    private static final SecureRandom RANDOM = new SecureRandom();
    public static final String TARGET = "X-Job-Target";
    public static final String TIME = "X-Job-Timestamp";
    public static final String NONCE = "X-Job-Nonce";
    public static final String DIGEST = "X-Job-Body-SHA256";
    public static final String SIGNATURE = "X-Job-Signature";
    public static final Set<String> SERVICES = Set.of("cloudflow-auth", "cloudflow-service-hr",
            "cloudflow-service-oa", "cloudflow-service-crm", "cloudflow-service-workflow");
    public static final List<String> BOUND_HEADERS = List.of(SecurityConstants.INNER_CALL_HEADER,
            SecurityConstants.FROM_SERVICE_HEADER, SecurityConstants.TENANT_ID_HEADER,
            "X-User-Id", "Authorization", "Cookie", TARGET, TIME, NONCE, DIGEST, SIGNATURE);
    private final String serviceName;
    private final Map<String, byte[]> keys;
    private final Clock clock;

    public JobRequestSignature(String serviceName, Map<String, String> encodedKeys, Clock clock) {
        if (!SERVICES.contains(serviceName)) throw new IllegalArgumentException("Unknown internal job service");
        this.serviceName = serviceName;
        this.clock = clock;
        Map<String, byte[]> decoded = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : encodedKeys.entrySet()) {
            if (!SERVICES.contains(entry.getKey()) || entry.getValue() == null || entry.getValue().isBlank()) continue;
            byte[] key;
            try { key = Base64.getDecoder().decode(entry.getValue()); }
            catch (IllegalArgumentException exception) { throw new IllegalArgumentException("Invalid internal job credential encoding"); }
            if (key.length != 32) throw new IllegalArgumentException("Internal job credentials must contain exactly 32 bytes");
            decoded.put(entry.getKey(), key);
        }
        Set<String> required = "cloudflow-auth".equals(serviceName) ? SERVICES : Set.of(serviceName, "cloudflow-auth");
        if (!decoded.keySet().containsAll(required)) throw new IllegalArgumentException("Required internal job credentials are missing");
        this.keys = Collections.unmodifiableMap(decoded);
    }

    public void sign(HttpHeaders headers, String method, String requestTarget, String recipient, byte[] body) {
        if (!SERVICES.contains(recipient)) throw new IllegalArgumentException("Unknown internal job recipient");
        headers.set(SecurityConstants.INNER_CALL_HEADER, SecurityConstants.INNER_CALL_VALUE);
        headers.set(SecurityConstants.FROM_SERVICE_HEADER, serviceName);
        headers.set(TARGET, recipient);
        headers.set(TIME, Long.toString(clock.instant().getEpochSecond()));
        byte[] nonce = new byte[16];
        RANDOM.nextBytes(nonce);
        headers.set(NONCE, HexFormat.of().formatHex(nonce));
        headers.set(DIGEST, digest(body));
        headers.remove(SIGNATURE);
        requireSingleHeaders(headers);
        headers.set(SIGNATURE, HexFormat.of().formatHex(mac(keys.get(serviceName), canonical(headers, method, requestTarget))));
    }

    /** Checks the signed digest before reading the body; the receiver must also check matchesBody. */
    public boolean verify(HttpHeaders headers, String method, String requestTarget) {
        try {
            requireSingleHeaders(headers);
            String source = headers.getFirst(SecurityConstants.FROM_SERVICE_HEADER);
            byte[] key = keys.get(source);
            if (key == null || !serviceName.equals(headers.getFirst(TARGET))
                    || !SecurityConstants.INNER_CALL_VALUE.equals(headers.getFirst(SecurityConstants.INNER_CALL_HEADER))) return false;
            if (!matches(headers.getFirst(NONCE), "[0-9a-f]{32}") || !matches(headers.getFirst(DIGEST), "[0-9a-f]{64}")
                    || !matches(headers.getFirst(SIGNATURE), "[0-9a-f]{64}") || !matches(headers.getFirst(TIME), "[0-9]{1,12}")) return false;
            long timestamp = Long.parseLong(headers.getFirst(TIME));
            long now = clock.instant().getEpochSecond();
            if (timestamp < now - 300 || timestamp > now + 300) return false;
            return MessageDigest.isEqual(HexFormat.of().parseHex(headers.getFirst(SIGNATURE)), mac(key, canonical(headers, method, requestTarget)));
        } catch (IllegalArgumentException exception) { return false; }
    }

    public boolean matchesBody(HttpHeaders headers, byte[] body) {
        return MessageDigest.isEqual(digest(body).getBytes(StandardCharsets.US_ASCII),
                value(headers, DIGEST).getBytes(StandardCharsets.US_ASCII));
    }

    public static String requestTarget(java.net.URI uri) {
        return uri.getRawPath() + (uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery());
    }

    private static void requireSingleHeaders(HttpHeaders headers) {
        for (String name : BOUND_HEADERS) {
            List<String> values = headers.get(name);
            if (values != null && (values.size() != 1 || values.get(0).indexOf('\n') >= 0 || values.get(0).indexOf('\r') >= 0)) {
                throw new IllegalArgumentException("Ambiguous internal job context");
            }
        }
    }

    private static String canonical(HttpHeaders headers, String method, String target) {
        if (method == null || target == null || method.indexOf('\n') >= 0 || target.indexOf('\n') >= 0
                || method.indexOf('\r') >= 0 || target.indexOf('\r') >= 0) {
            throw new IllegalArgumentException("Invalid internal job target");
        }
        return String.join("\n", "CF-JOB-V1", method, target,
                value(headers, SecurityConstants.FROM_SERVICE_HEADER), value(headers, TARGET),
                value(headers, SecurityConstants.TENANT_ID_HEADER), value(headers, "X-User-Id"),
                digest(value(headers, "Authorization").getBytes(StandardCharsets.UTF_8)),
                digest(value(headers, "Cookie").getBytes(StandardCharsets.UTF_8)),
                value(headers, DIGEST), value(headers, TIME), value(headers, NONCE));
    }

    private static String value(HttpHeaders headers, String name) { return headers.getFirst(name) == null ? "" : headers.getFirst(name); }
    private static boolean matches(String value, String expression) { return value != null && value.matches(expression); }
    private static String digest(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes == null ? new byte[0] : bytes)); }
        catch (GeneralSecurityException exception) { throw new IllegalStateException("Job digest algorithm unavailable"); }
    }
    private static byte[] mac(byte[] key, String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException exception) { throw new IllegalStateException("Job signature algorithm unavailable"); }
    }
}
