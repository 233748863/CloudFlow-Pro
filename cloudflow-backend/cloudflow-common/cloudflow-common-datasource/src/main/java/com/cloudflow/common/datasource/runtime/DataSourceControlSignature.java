package com.cloudflow.common.datasource.runtime;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class DataSourceControlSignature {
    public static final String TIME_HEADER = "X-DataSource-Time";
    public static final String NONCE_HEADER = "X-DataSource-Nonce";
    public static final String TARGET_HEADER = "X-DataSource-Target";
    public static final String SIGNATURE_HEADER = "X-DataSource-Signature";
    private final DataSourceRuntimeProperties properties;
    private final Clock clock;
    private final Map<String, Long> consumed = new ConcurrentHashMap<>();

    @Autowired
    public DataSourceControlSignature(DataSourceRuntimeProperties properties) { this(properties, Clock.systemUTC()); }

    DataSourceControlSignature(DataSourceRuntimeProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    public Map<String, String> sign(String path, String instanceKey, DataSourceApplyRequest request) {
        requireConfigured();
        validate(request);
        String timestamp = String.valueOf(clock.millis());
        String nonce = UUID.randomUUID().toString().replace("-", "");
        return Map.of(TIME_HEADER, timestamp, NONCE_HEADER, nonce, TARGET_HEADER, instanceKey,
                SIGNATURE_HEADER, digest(path, instanceKey, timestamp, nonce, request));
    }

    public synchronized void verify(String path, String expectedInstanceKey, String source, String address,
            String timestamp, String nonce, String target, String signature, DataSourceApplyRequest request) {
        requireConfigured();
        validate(request);
        if (!"cloudflow-auth".equals(source) || address == null || properties.getAllowedAuthAddresses() == null
                || !properties.getAllowedAuthAddresses().stream().anyMatch(allowed -> sameAddress(allowed, address))
                || timestamp == null || !timestamp.matches("[0-9]{13}") || nonce == null || !nonce.matches("[a-f0-9]{32}")
                || !expectedInstanceKey.equals(target) || signature == null || !signature.matches("[A-Za-z0-9_-]{43}")) throw rejected();
        long now = clock.millis();
        long issued = Long.parseLong(timestamp);
        if (issued > now + 5000 || issued < now - 30000) throw rejected();
        byte[] actual;
        try { actual = Base64.getUrlDecoder().decode(signature); }
        catch (IllegalArgumentException failure) { throw rejected(); }
        byte[] expected = Base64.getUrlDecoder().decode(digest(path, target, timestamp, nonce, request));
        if (!MessageDigest.isEqual(expected, actual)) throw rejected();
        consumed.entrySet().removeIf(entry -> entry.getValue() <= now);
        if (consumed.size() >= 10000 || consumed.putIfAbsent(nonce, now + 60000) != null) throw rejected();
    }

    public static String instanceKey(String service, String host, int port, boolean secure) {
        if (!DataSourceNetworkPolicy.SERVICES.contains(service) || host == null || host.isBlank()
                || port < 1 || port > 65535) throw new DataSourceFailure("INSTANCE_UNAVAILABLE", "服务实例身份尚未就绪", 503);
        try {
            String material = service + "\n" + host.toLowerCase(java.util.Locale.ROOT) + "\n" + port + "\n" + secure;
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(material.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException failure) { throw new IllegalStateException("实例标识摘要不可用"); }
    }

    private String digest(String path, String instanceKey, String timestamp, String nonce, DataSourceApplyRequest request) {
        try {
            String material = "data-source:apply:v1\ncloudflow-auth\nPOST\n" + path + "\n" + instanceKey + "\n"
                    + request.getConfigId() + "\n" + request.getVersion() + "\n" + timestamp + "\n" + nonce;
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(properties.getControlKey().trim().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(material.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception failure) { throw new DataSourceFailure("CONTROL_KEY_INVALID", "数据源内部指令签名不可用", 503); }
    }

    private boolean sameAddress(String allowed, String address) {
        try { return DataSourceNetworkPolicy.literal(allowed).equals(DataSourceNetworkPolicy.literal(address)); }
        catch (DataSourceFailure failure) { return false; }
    }

    private void requireConfigured() {
        if (!properties.configured()) throw DataSourceFailure.disabled();
    }

    private static void validate(DataSourceApplyRequest request) {
        if (request == null) throw new DataSourceFailure("INVALID_COMMAND", "缺少数据源应用指令", 400);
        request.validate();
    }

    private static DataSourceFailure rejected() {
        return new DataSourceFailure("UNTRUSTED_CONTROL_REQUEST", "数据源内部指令身份校验失败", 403);
    }
}
