package com.cloudflow.auth.im;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Consumer;

public final class ImOrgSnapshotChecks {
    private static int assertions;
    private static final String SECRET = "IM_SECRET_UNAVAILABLE";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String KEY = "snapshot-check-key-" + "K".repeat(40);

    public static void main(String[] arguments) throws Exception {
        ImProperties properties = new ImProperties();
        properties.setSecretKey(KEY);
        ImSecretCipher cipher = new ImSecretCipher(properties);
        ImOrgSnapshotCodec codec = new ImOrgSnapshotCodec(cipher);
        ImOrgSnapshot snapshot = snapshot(List.of(member("private-Ada", 2), member("private-Bob", 3)));
        ImOrgSnapshotCodec.Sealed sealed = codec.encode(snapshot);
        equal(snapshot, codec.decode(ImSecurityChecks.fixture(), sealed), "full encrypted round trip");
        String raw = cipher.decrypt(100, "WECOM", ImSecretCipher.Field.SNAPSHOT, sealed.encrypted());
        equal(hash(raw), sealed.hash(), "digest of complete canonical envelope");
        check(!raw.contains("outOfScopeMembers"), "empty outside list leaves legacy canonical JSON and digest unchanged");
        equal(List.of(), codec.decode(ImSecurityChecks.fixture(), sealed).outOfScopeMembers(), "legacy encrypted record with no new field remains readable");
        ImOrgSnapshot released = new ImOrgSnapshot(snapshot.tenantId(), snapshot.configId(), snapshot.configVersion(), snapshot.corpId(), snapshot.agentId(),
                snapshot.capturedAt(), snapshot.localRootDeptId(), snapshot.roots(), snapshot.primaryDepartments(), snapshot.departments(), snapshot.members(),
                List.of(member("private-Moved", 4)));
        equal(released, codec.decode(ImSecurityChecks.fixture(), codec.encode(released)), "new outside proof encrypted round trip");
        check(!sealed.encrypted().contains("private"), "encrypted contents conceal members and department names");
        check(!sealed.toString().contains(sealed.encrypted()), "sealed diagnostic does not expose encrypted payload");
        equal("{\"hash\":\"" + sealed.hash() + "\"}", JSON.writeValueAsString(sealed), "ordinary serialization contains digest only");
        ImOrgSnapshotCodec.Sealed another = codec.encode(snapshot);
        equal(sealed.hash(), another.hash(), "stable digest for same snapshot");
        check(!sealed.encrypted().equals(another.encrypted()), "independent encryption nonce per encoding");
        for (WeComCredentials expected : List.of(credentials(101, 200, 3, "corpA"), credentials(100, 201, 3, "corpA"),
                credentials(100, 200, 4, "corpA"), credentials(100, 200, 3, "corpB"),
                new WeComCredentials(100, 200, 3, "corpA", 78, "secret", null, null))) {
            rejected(() -> codec.decode(expected, sealed), SECRET);
        }
        rejected(() -> codec.decode(null, sealed), SECRET);
        rejected(() -> codec.decode(ImSecurityChecks.fixture(), null), SECRET);
        rejected(() -> codec.encode(null), "IM_ORG_SNAPSHOT_INCOMPLETE");
        rejected(() -> codec.decode(ImSecurityChecks.fixture(), new ImOrgSnapshotCodec.Sealed("0".repeat(64), sealed.encrypted())), SECRET);
        for (String invalidHash : List.of("", "a".repeat(63), "a".repeat(65), "A".repeat(64), "g".repeat(64))) {
            rejected(() -> new ImOrgSnapshotCodec.Sealed(invalidHash, sealed.encrypted()), SECRET);
        }
        for (String invalidEncrypted : List.of("plain-private", "im2:unknown")) {
            rejected(() -> new ImOrgSnapshotCodec.Sealed(sealed.hash(), invalidEncrypted), SECRET);
        }
        byte[] bytes = Base64.getDecoder().decode(sealed.encrypted().substring(4));
        for (int position : List.of(0, 12, bytes.length - 1)) {
            byte[] modified = bytes.clone();
            modified[position] ^= 1;
            ImOrgSnapshotCodec.Sealed tampered = new ImOrgSnapshotCodec.Sealed(sealed.hash(), "im1:" + Base64.getEncoder().encodeToString(modified));
            rejected(() -> codec.decode(ImSecurityChecks.fixture(), tampered), SECRET);
        }
        properties.setSecretKey("other-snapshot-key-" + "L".repeat(40));
        rejected(() -> codec.decode(ImSecurityChecks.fixture(), sealed), SECRET);
        properties.setSecretKey(KEY);
        for (String malformed : List.of(raw + "{}", raw.replace("\"schema\":1", "\"schema\":1,\"schema\":1"), raw + " ",
                raw.replace("\"configVersion\":3", "\"configVersion\":\"3\""), "{}", "[]", "private-invalid-json")) {
            rejectedRaw(codec, cipher, malformed);
        }
        for (Consumer<ObjectNode> mutation : List.<Consumer<ObjectNode>>of(node -> node.put("schema", 2), node -> node.put("schema", "1"),
                node -> node.put("unexpected", true), node -> node.remove("schema"), node -> node.putNull("snapshot"),
                node -> payload(node).put("unknown", "private-field"), node -> payload(node).putNull("tenantId"),
                node -> payload(node).putNull("outOfScopeMembers"), node -> payload(node).putArray("outOfScopeMembers"),
                node -> payload(node).putArray("outOfScopeMembers").add(payload(node).path("members").get(0)),
                node -> payload(node).remove("configVersion"), node -> payload(node).put("configVersion", -1),
                node -> payload(node).put("tenantId", 101), node -> payload(node).put("configId", 201), node -> payload(node).put("corpId", "corpB"),
                node -> payload(node).put("agentId", 78), node -> payload(node).put("agentId", 0),
                node -> payload(node).put("localRootDeptId", 0), node -> payload(node).putNull("capturedAt"),
                node -> payload(node).putArray("roots").add(2).add(2), node -> payload(node).putArray("roots").add(99),
                node -> ((ArrayNode) payload(node).path("departments")).add(payload(node).path("departments").get(0)),
                node -> ((ObjectNode) payload(node).path("departments").get(0)).put("parentId", 3),
                node -> ((ObjectNode) payload(node).path("members").get(0)).put("status", 9),
                node -> ((ObjectNode) payload(node).path("members").get(0)).putArray("departmentIds").add(4),
                node -> ((ObjectNode) payload(node).path("members").get(0).path("mobile")).put("available", false),
                node -> ((ObjectNode) payload(node).path("members").get(0).path("avatar")).put("value", "https://127.0.0.1/private"))) {
            ObjectNode envelope = (ObjectNode) JSON.readTree(raw);
            mutation.accept(envelope);
            rejectedRaw(codec, cipher, envelope.toString());
        }
        List<ImOrgSnapshot.Member> people = new ArrayList<>();
        for (int identifier = 0; identifier < 1000; identifier++) people.add(member("private-perf-" + identifier, 2));
        ImOrgSnapshot large = snapshot(people);
        long started = System.nanoTime();
        ImOrgSnapshotCodec.Sealed encoded = codec.encode(large);
        equal(large, codec.decode(ImSecurityChecks.fixture(), encoded), "1000 member encrypted round trip");
        long elapsed = Duration.ofNanos(System.nanoTime() - started).toMillis();
        check(elapsed < 300000, "1000 member encoding and decoding under five minutes");
        System.out.println("G4_IM_ORG_SNAPSHOT_PERFORMANCE: members=1000; encrypted_chars=" + encoded.encrypted().length()
                + "; elapsed_ms=" + elapsed + "; database_persistence=false; complete_sync=false");
        System.out.println("G4_IM_ORG_SNAPSHOT_CHECKS: assertions=" + assertions
                + "; failed=0; authenticated_encryption=true; tenant_config_version_checked=true; mysql=false; redis=false; http=false; production_modified=false");
    }

    private static ObjectNode payload(ObjectNode envelope) { return (ObjectNode) envelope.path("snapshot"); }

    private static ImOrgSnapshot.Member member(String identifier, long department) {
        return new ImOrgSnapshot.Member(identifier, "private-name", List.of(department), 1,
                new ImOrgSnapshot.Field(true, "13900000000"), new ImOrgSnapshot.Field(false, null),
                new ImOrgSnapshot.Field(true, "https://wework.qpic.cn/private-avatar"));
    }

    private static ImOrgSnapshot snapshot(List<ImOrgSnapshot.Member> members) {
        return new ImOrgSnapshot(100, 200, 3, "corpA", 77, Instant.parse("2026-09-29T00:00:00Z"), 1000, Set.of(2L, 3L),
                Map.of("private-Bob", 3L, "private-Ada", 2L),
                List.of(new ImOrgSnapshot.Department(3, 2, "private-child", 0), new ImOrgSnapshot.Department(2, 1, "private-root", 0)), members);
    }

    private static WeComCredentials credentials(long tenant, long config, int version, String corp) {
        return new WeComCredentials(tenant, config, version, corp, 77, "secret", null, null);
    }

    private static void rejectedRaw(ImOrgSnapshotCodec codec, ImSecretCipher cipher, String raw) throws Exception {
        ImOrgSnapshotCodec.Sealed sealed = new ImOrgSnapshotCodec.Sealed(hash(raw), cipher.encrypt(100, "WECOM", ImSecretCipher.Field.SNAPSHOT, raw));
        rejected(() -> codec.decode(ImSecurityChecks.fixture(), sealed), SECRET);
    }

    private static String hash(String value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    }

    private static void check(boolean result, String name) { assertions++; if (!result) throw new AssertionError(name); }
    private static void equal(Object expected, Object actual, String name) { check(Objects.equals(expected, actual), name); }
    private static void rejected(Runnable action, String reason) {
        try { action.run(); throw new AssertionError("expected " + reason); }
        catch (ImFailure failure) {
            equal(reason, failure.getReasonCode(), "safe reason");
            check(failure.getCause() == null && !failure.getMessage().contains("private"), "decryption and validation error hides plaintext and causes");
        }
    }
}
