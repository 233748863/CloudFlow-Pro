package com.cloudflow.auth.im;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.TreeSet;
import org.springframework.stereotype.Component;

@Component
public class ImOrgSnapshotCodec {
    private final ImSecretCipher cipher;
    private final ObjectMapper json = JsonMapper.builder().addModule(new JavaTimeModule())
            .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS, DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
                    DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .enable(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY)
            .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS)
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
            .disable(MapperFeature.ALLOW_COERCION_OF_SCALARS).build();

    public ImOrgSnapshotCodec(ImSecretCipher cipher) { this.cipher = cipher; }

    public Sealed encode(ImOrgSnapshot snapshot) {
        if (snapshot == null) throw ImFailure.orgIncomplete();
        String plain = canonical(snapshot);
        return new Sealed(digest(plain), cipher.encrypt(snapshot.tenantId(), "WECOM", ImSecretCipher.Field.SNAPSHOT, plain));
    }

    public ImOrgSnapshot decode(WeComCredentials expected, Sealed sealed) {
        if (expected == null || sealed == null) throw ImFailure.secret();
        return decodeSnapshot(context(expected), sealed);
    }

    public ImOrgSnapshot decodeSnapshot(Context expected, Sealed sealed) {
        if (expected == null || sealed == null) throw ImFailure.secret();
        String plain = cipher.decrypt(expected.tenantId(), "WECOM", ImSecretCipher.Field.SNAPSHOT, sealed.encrypted());
        if (!same(sealed.hash(), digest(plain))) throw ImFailure.secret();
        try {
            JsonNode envelope = json.readTree(plain);
            if (envelope == null || !envelope.isObject() || envelope.size() != 2
                    || !envelope.path("schema").isInt() || envelope.path("schema").intValue() != 1
                    || !envelope.path("snapshot").isObject()) throw ImFailure.secret();
            ImOrgSnapshot snapshot = json.treeToValue(envelope.path("snapshot"), ImOrgSnapshot.class);
            requireContext(expected, snapshot);
            if (!same(plain, canonical(snapshot))) throw ImFailure.secret();
            return snapshot;
        } catch (JsonProcessingException | IllegalArgumentException failure) { throw ImFailure.secret(); }
    }

    public Sealed encodePreview(ImSyncPreview preview) {
        if (preview == null) throw ImFailure.orgLocal();
        String plain = canonicalPreview(preview);
        return new Sealed(digest(plain), cipher.encrypt(preview.source().tenantId(), "WECOM", ImSecretCipher.Field.SNAPSHOT, plain));
    }

    public ImSyncPreview decodePreview(Context expected, Sealed sealed) {
        if (expected == null || sealed == null) throw ImFailure.secret();
        String plain = cipher.decrypt(expected.tenantId(), "WECOM", ImSecretCipher.Field.SNAPSHOT, sealed.encrypted());
        if (!same(sealed.hash(), digest(plain))) throw ImFailure.secret();
        try {
            JsonNode envelope = json.readTree(plain);
            if (envelope == null || !envelope.isObject() || envelope.size() != 2 || !envelope.path("schema").isInt()
                    || envelope.path("schema").intValue() != 2 || !envelope.path("preview").isObject()) throw ImFailure.secret();
            ImSyncPreview preview = json.treeToValue(envelope.path("preview"), ImSyncPreview.class);
            requireContext(expected, preview.source());
            if (!same(plain, canonicalPreview(preview))) throw ImFailure.secret();
            return preview;
        } catch (JsonProcessingException | IllegalArgumentException failure) { throw ImFailure.secret(); }
    }

    public String localHash(ImLocalOrganization local) {
        if (local == null) throw ImFailure.orgLocal();
        ObjectNode payload = json.valueToTree(local);
        payload.set("protectedUsers", json.valueToTree(new TreeSet<>(local.protectedUsers())));
        try { return digest(json.writeValueAsString(payload)); }
        catch (JsonProcessingException failure) { throw ImFailure.orgLocal(); }
    }

    public String previewHash(ImSyncPreview preview) {
        if (preview == null) throw ImFailure.orgLocal();
        return digest(canonicalPreview(preview));
    }

    public Sealed encodeApplication(ImSyncApplication application) {
        if (application == null || !same(application.previewHash(), previewHash(application.preview()))) throw ImFailure.orgLocal();
        String plain = canonicalApplication(application);
        return new Sealed(digest(plain), cipher.encrypt(application.preview().source().tenantId(), "WECOM", ImSecretCipher.Field.SNAPSHOT, plain));
    }

    public ImSyncApplication decodeRun(ImSyncRunRow row) {
        if (row == null || !"APPLY".equals(row.getMode()) || !Boolean.TRUE.equals(row.getFullSnapshotFlag())
                || row.getTenantId() == null || row.getConfigId() == null || row.getConfigVersion() == null) throw ImFailure.orgLocal();
        ImSyncApplication application = decodeCommittedApplication(row.getTenantId(), row.getConfigId(), row.getConfigVersion(),
                row.getSnapshotHash(), new Sealed(row.getProgressCursor(), row.getSnapshotEncrypted()));
        if (!application.status().equals(row.getStatus()) || application.finished() != (row.getCompletedTime() != null)) throw ImFailure.orgLocal();
        try {
            ImSyncApplication.Summary summary = json.copy().enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
                    .readValue(row.getResultSummary(), ImSyncApplication.Summary.class);
            if (!java.util.Objects.equals(summary, application.summary())) throw ImFailure.secret();
        } catch (JsonProcessingException | IllegalArgumentException failure) { throw ImFailure.secret(); }
        return application;
    }

    public ImSyncApplication decodeApplication(Context expected, String previewHash, Sealed sealed) {
        if (expected == null) throw ImFailure.secret();
        ImSyncApplication application = readApplication(expected.tenantId(), previewHash, sealed);
        requireContext(expected, application.preview().source());
        return application;
    }

    ImSyncApplication decodeCommittedApplication(long tenantId, long configId, int version, String previewHash, Sealed sealed) {
        if (configId <= 0 || version < 0) throw ImFailure.secret();
        ImSyncApplication application = readApplication(tenantId, previewHash, sealed);
        ImOrgSnapshot source = application.preview().source();
        if (source.tenantId() != tenantId || source.configId() != configId || source.configVersion() != version) throw ImFailure.secret();
        return application;
    }

    private ImSyncApplication readApplication(long tenantId, String previewHash, Sealed sealed) {
        if (tenantId <= 0 || previewHash == null || !previewHash.matches("[a-f0-9]{64}") || sealed == null) throw ImFailure.secret();
        String plain = cipher.decrypt(tenantId, "WECOM", ImSecretCipher.Field.SNAPSHOT, sealed.encrypted());
        if (!same(sealed.hash(), digest(plain))) throw ImFailure.secret();
        try {
            JsonNode envelope = json.readTree(plain);
            if (envelope == null || !envelope.isObject() || envelope.size() != 2 || !envelope.path("schema").isInt()
                    || envelope.path("schema").intValue() != 3 || !envelope.path("application").isObject()) throw ImFailure.secret();
            ObjectNode payload = (ObjectNode) envelope.path("application");
            if (!payload.has("confirmedBy")) payload.put("confirmedBy", 0);
            ImSyncApplication application = json.treeToValue(payload, ImSyncApplication.class);
            if (application.preview().source().tenantId() != tenantId) throw ImFailure.secret();
            if (!same(previewHash, application.previewHash()) || !same(previewHash, previewHash(application.preview()))
                    || !same(plain, canonicalApplication(application))) throw ImFailure.secret();
            return application;
        } catch (JsonProcessingException | IllegalArgumentException failure) { throw ImFailure.secret(); }
    }

    private String canonicalApplication(ImSyncApplication application) {
        ObjectNode payload = json.valueToTree(application);
        ObjectNode preview = (ObjectNode) payload.path("preview");
        preview.set("source", snapshotPayload(application.preview().source()));
        ObjectNode envelope = json.createObjectNode().put("schema", 3);
        envelope.set("application", payload);
        try { return json.writeValueAsString(envelope); }
        catch (JsonProcessingException failure) { throw ImFailure.secret(); }
    }

    private String canonicalPreview(ImSyncPreview preview) {
        ObjectNode payload = json.valueToTree(preview);
        payload.set("source", snapshotPayload(preview.source()));
        ObjectNode envelope = json.createObjectNode().put("schema", 2);
        envelope.set("preview", payload);
        try { return json.writeValueAsString(envelope); }
        catch (JsonProcessingException failure) { throw ImFailure.secret(); }
    }

    private ObjectNode snapshotPayload(ImOrgSnapshot snapshot) {
        ObjectNode payload = json.valueToTree(snapshot);
        payload.set("roots", json.valueToTree(new TreeSet<>(snapshot.roots())));
        return payload;
    }

    private String canonical(ImOrgSnapshot snapshot) {
        ObjectNode envelope = json.createObjectNode().put("schema", 1);
        envelope.set("snapshot", snapshotPayload(snapshot));
        try { return json.writeValueAsString(envelope); }
        catch (JsonProcessingException failure) { throw ImFailure.secret(); }
    }

    private static String digest(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException failure) { throw ImFailure.secret(); }
    }

    private static boolean same(String expected, String actual) {
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), actual.getBytes(StandardCharsets.UTF_8));
    }

    private static void requireContext(Context expected, ImOrgSnapshot snapshot) {
        if (snapshot.tenantId() != expected.tenantId() || snapshot.configId() != expected.configId()
                || snapshot.configVersion() != expected.version() || snapshot.agentId() != expected.agentId()
                || !snapshot.corpId().equals(expected.corpId())) throw ImFailure.secret();
    }

    public static Context context(WeComCredentials credentials) {
        return new Context(credentials.tenantId(), credentials.configId(), credentials.version(), credentials.corpId(), credentials.agentId());
    }

    public record Context(long tenantId, long configId, int version, String corpId, long agentId) {
        public Context {
            if (tenantId <= 0 || configId <= 0 || version < 0 || corpId == null || !corpId.matches("[A-Za-z0-9_-]{1,100}") || agentId <= 0) throw ImFailure.secret();
        }
    }

    public record Sealed(String hash, @JsonIgnore String encrypted) {
        public Sealed {
            if (hash == null || !hash.matches("[a-f0-9]{64}") || encrypted == null
                    || !encrypted.startsWith("im1:") || encrypted.length() > 12 * 1024 * 1024) throw ImFailure.secret();
        }

        @Override
        public String toString() { return "ImOrgSnapshotSealed[protected=true]"; }
    }
}
