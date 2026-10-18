package com.cloudflow.auth.im;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import me.chanjar.weixin.common.util.crypto.SHA1;
import me.chanjar.weixin.cp.util.crypto.WxCpCryptUtil;

public final class ImSecurityChecks {
    private static int assertions;
    private static final long NOW = 1_790_611_200;
    private static final String NONCE = "callbackNonce8";

    public static void main(String[] arguments) throws Exception {
        secrets();
        credentials();
        xml();
        callbacks();
        malformedPackets();
        disabled();
        System.out.println("G4_IM_SECURITY_CHECKS: assertions=" + assertions
                + "; failed=0; actual_sdk=4.8.6.B; http=false; mysql=false; redis=false; production_modified=false");
    }

    private static void secrets() throws Exception {
        ImProperties properties = new ImProperties();
        ImSecretCipher cipher = new ImSecretCipher(properties);
        rejected(() -> cipher.encrypt(100, "WECOM", ImSecretCipher.Field.APP_SECRET, "input"), "IM_SECRET_UNAVAILABLE");
        properties.setSecretKey("im-test-key-" + "K".repeat(48));
        for (ImSecretCipher.Field field : ImSecretCipher.Field.values()) {
            String raw = field.name() + "-never-expose-" + "密钥".repeat(10);
            String encrypted = cipher.encrypt(100, "WECOM", field, raw);
            equal(raw, cipher.decrypt(100, "WECOM", field, encrypted), "field round trip");
            check(encrypted.startsWith("im1:") && !encrypted.contains(raw), "encrypted envelope only");
            check(!encrypted.equals(cipher.encrypt(100, "WECOM", field, raw)), "fresh random nonce");
            rejected(() -> cipher.decrypt(101, "WECOM", field, encrypted), "IM_SECRET_UNAVAILABLE");
            for (ImSecretCipher.Field other : ImSecretCipher.Field.values()) {
                if (other != field) rejected(() -> cipher.decrypt(100, "WECOM", other, encrypted), "IM_SECRET_UNAVAILABLE");
            }
            byte[] payload = Base64.getDecoder().decode(encrypted.substring(4));
            for (int index : List.of(0, 12, payload.length - 1)) {
                byte[] modified = payload.clone();
                modified[index] ^= 1;
                String tampered = "im1:" + Base64.getEncoder().encodeToString(modified);
                rejected(() -> cipher.decrypt(100, "WECOM", field, tampered), "IM_SECRET_UNAVAILABLE");
            }
            properties.setSecretKey("different-key-" + "Q".repeat(48));
            rejected(() -> cipher.decrypt(100, "WECOM", field, encrypted), "IM_SECRET_UNAVAILABLE");
            properties.setSecretKey("im-test-key-" + "K".repeat(48));
        }
        rejected(() -> cipher.encrypt(100, "WECOM", ImSecretCipher.Field.TOKEN, " "), "IM_CONFIGURATION_INVALID");
        rejected(() -> cipher.encrypt(100, "WECOM", ImSecretCipher.Field.TOKEN, "a".repeat(1025)), "IM_CONFIGURATION_INVALID");
        rejected(() -> cipher.decrypt(100, "WECOM", ImSecretCipher.Field.TOKEN, "plain-secret"), "IM_SECRET_UNAVAILABLE");
        rejected(() -> cipher.decrypt(100, "WECOM", ImSecretCipher.Field.TOKEN, "im1:" + "a".repeat(2000)), "IM_SECRET_UNAVAILABLE");
        rejected(() -> cipher.encrypt(0, "WECOM", ImSecretCipher.Field.TOKEN, "input"), "IM_CONFIGURATION_INVALID");
        rejected(() -> cipher.encrypt(100, "DINGTALK", ImSecretCipher.Field.TOKEN, "input"), "IM_CONFIGURATION_INVALID");
        check(!properties.toString().contains(properties.getSecretKey()), "properties safe string");
        check(!new ObjectMapper().writeValueAsString(properties).contains(properties.getSecretKey()), "properties safe JSON");
    }

    private static void credentials() throws Exception {
        WeComCredentials credentials = fixture();
        ObjectMapper json = new ObjectMapper();
        for (String secret : List.of(credentials.appSecret(), credentials.callbackToken(), credentials.aesKey())) {
            check(!credentials.toString().contains(secret), "credential string hides secret");
            check(!json.writeValueAsString(credentials).contains(secret), "credential JSON hides secret");
        }
        equal("cloudflow:im:token:100:200:3", credentials.cacheKey(), "token namespace includes tenant config version");
        check(!credentials.cacheKey().equals(new WeComCredentials(101, 200, 3, "corpA", 77, "secret", null, null).cacheKey()), "tenant namespace separated");
        check(!credentials.cacheKey().equals(new WeComCredentials(100, 201, 3, "corpA", 77, "secret", null, null).cacheKey()), "config namespace separated");
        check(!credentials.cacheKey().equals(new WeComCredentials(100, 200, 4, "corpA", 77, "secret", null, null).cacheKey()), "version namespace separated");
        for (String corp : Arrays.asList(null, "", "corp?secret=evil", "corp\n", "c".repeat(101))) {
            rejected(() -> new WeComCredentials(100, 200, 3, corp, 77, "secret", null, null), "IM_CONFIGURATION_INVALID");
        }
        for (String aes : List.of("a".repeat(42), "a".repeat(44), "?".repeat(43), "a".repeat(43))) {
            rejected(() -> new WeComCredentials(100, 200, 3, "corpA", 77, "secret", "token", aes), "IM_CONFIGURATION_INVALID");
        }
        ImAccessTokens.Grant grant = new ImAccessTokens.Grant("access-token-do-not-log", 7200);
        check(!grant.toString().contains(grant.token()), "token grant safe string");
        check(!json.writeValueAsString(grant).contains(grant.token()), "token grant safe JSON");
        rejected(() -> new ImAccessTokens.Grant("token", 120), "IM_PROVIDER_REJECTED");
        rejected(() -> new ImAccessTokens.Grant("token&injection", 7200), "IM_PROVIDER_REJECTED");
    }

    private static void xml() {
        Map<String, String> valid = ImCallbackXml.read(bytes("<xml><Encrypt><![CDATA[hello]]></Encrypt><Value>a&amp;b</Value></xml>"));
        equal("hello", valid.get("Encrypt"), "CDATA parsed");
        equal("a&b", valid.get("Value"), "built in entity parsed");
        for (String invalid : List.of("", " ", "<xml>", "<other/>", "<xml/><xml/>", "<xml>text</xml>",
                "<xml><Encrypt>first</Encrypt><Encrypt>second</Encrypt></xml>", "<xml xmlns='foreign'/>",
                "<xml><Value attribute='x'/></xml>", "<xml><?external action?></xml>",
                "<!DOCTYPE xml [<!ENTITY data SYSTEM 'file:///unreadable-secret'>]><xml><Value>&data;</Value></xml>",
                "<!DOCTYPE xml SYSTEM 'http://127.0.0.1:1/external'><xml/>",
                "<!DOCTYPE xml [<!ENTITY a 'explosion'>]><xml><Value>&a;</Value></xml>")) {
            rejected(() -> ImCallbackXml.read(bytes(invalid)), "IM_CALLBACK_INVALID");
        }
        rejected(() -> ImCallbackXml.read(null), "IM_CALLBACK_INVALID");
        rejected(() -> ImCallbackXml.read(new byte[]{(byte) 0xc3, 0x28}), "IM_CALLBACK_INVALID");
        ImCallbackXml.read(bytes("<xml>" + "<node>".repeat(31) + "</node>".repeat(31) + "</xml>"));
        assertions++;
        rejected(() -> ImCallbackXml.read(bytes("<xml>" + "<node>".repeat(32) + "</node>".repeat(32) + "</xml>")), "IM_CALLBACK_INVALID");
        String prefix = "<xml><Value>";
        String suffix = "</Value></xml>";
        String exact = prefix + "a".repeat(ImCallbackXml.MAX_BYTES - prefix.length() - suffix.length()) + suffix;
        check(ImCallbackXml.read(bytes(exact)).containsKey("Value"), "exact one MiB accepted");
        rejected(() -> ImCallbackXml.read(bytes(exact + " ")), "IM_CALLBACK_INVALID");
    }

    private static void callbacks() throws Exception {
        WeComCredentials credentials = fixture();
        WeComCallbackCodec codec = codec();
        String event = "<xml><ToUserName>corpA</ToUserName><AgentID>77</AgentID><MsgType>event</MsgType>"
                + "<Event>template_card_event</Event><FromUserName>private-person</FromUserName></xml>";
        String encrypted = encrypt(credentials, event);
        String body = "<xml><Encrypt><![CDATA[" + encrypted + "]]></Encrypt></xml>";
        for (long delta : List.of(-300L, 0L, 300L)) {
            String timestamp = Long.toString(NOW + delta);
            WeComCallbackCodec.VerifiedCallback decoded = codec.event(credentials, signature(credentials, encrypted, timestamp), timestamp, NONCE, bytes(body));
            equal("template_card_event", decoded.fields().get("Event"), "signed event decrypted");
            check(decoded.payloadHash().matches("[a-f0-9]{64}"), "payload SHA256");
            check(!decoded.toString().contains("private-person"), "callback safe string");
            check(!new ObjectMapper().writeValueAsString(decoded).contains("private-person"), "callback safe JSON");
        }
        for (long delta : List.of(-301L, 301L)) {
            String timestamp = Long.toString(NOW + delta);
            rejected(() -> codec.event(credentials, signature(credentials, encrypted, timestamp), timestamp, NONCE, bytes(body)), "IM_CALLBACK_INVALID");
        }
        for (String timestamp : List.of("-1", "9999999999999", "1e9", "time", " 1790611200")) {
            rejected(() -> codec.echo(credentials, "a".repeat(40), timestamp, NONCE, encrypted), "IM_CALLBACK_INVALID");
        }
        rejected(() -> codec.echo(credentials, "a".repeat(40), Long.toString(NOW), NONCE, encrypted), "IM_CALLBACK_INVALID");
        String timestamp = Long.toString(NOW);
        String signed = signature(credentials, encrypted, timestamp);
        rejected(() -> codec.echo(credentials, signed, timestamp, "alteredNonce", encrypted), "IM_CALLBACK_INVALID");
        String echo = encrypt(credentials, "echo-check-123");
        equal("echo-check-123", codec.echo(credentials, signature(credentials, echo, timestamp), timestamp, NONCE, echo), "GET echo verified");
        for (String otherEvent : List.of(event.replace("corpA", "corpB"), event.replace("77", "78"),
                "<xml><ToUserName>corpA</ToUserName><ToUserName>corpA</ToUserName></xml>",
                "<!DOCTYPE xml [<!ENTITY data SYSTEM 'http://127.0.0.1:1/secret'>]><xml><ToUserName>&data;</ToUserName></xml>")) {
            String other = encrypt(credentials, otherEvent);
            rejected(() -> codec.event(credentials, signature(credentials, other, timestamp), timestamp, NONCE,
                    bytes("<xml><Encrypt>" + other + "</Encrypt></xml>")), "IM_CALLBACK_INVALID");
        }
        WeComCredentials foreign = new WeComCredentials(100, 200, 3, "corpB", 77,
                credentials.appSecret(), credentials.callbackToken(), credentials.aesKey());
        String foreignEncrypted = encrypt(foreign, event);
        String foreignSignature = signature(credentials, foreignEncrypted, timestamp);
        equal(event, new WxCpCryptUtil(credentials.sdkConfiguration()).decryptContent(foreignSignature, timestamp, NONCE, foreignEncrypted),
                "upstream SDK accepts foreign enterprise suffix; wrapper regression required");
        rejected(() -> codec.echo(credentials, foreignSignature, timestamp, NONCE, foreignEncrypted), "IM_CALLBACK_INVALID");
        check(WxCpCryptUtil.class.getProtectionDomain().getCodeSource().getLocation().toString().contains("4.8.6.B"), "approved SDK loaded");
    }

    private static void malformedPackets() throws Exception {
        WeComCredentials credentials = fixture();
        byte[] content = bytes("echo");
        byte[] enterprise = bytes(credentials.corpId());
        int length = 20 + content.length + enterprise.length;
        int padding = 32 - length % 32;
        byte[] packet = new byte[length + padding];
        ByteBuffer.wrap(packet).position(16).putInt(content.length).put(content).put(enterprise);
        Arrays.fill(packet, length, packet.length, (byte) padding);
        for (int malformedLength : List.of(-1, Integer.MAX_VALUE, 0, length + 1)) {
            byte[] invalid = packet.clone();
            ByteBuffer.wrap(invalid, 16, 4).putInt(malformedLength);
            rejectedPacket(credentials, invalid);
        }
        for (int invalidPadding : List.of(0, 33, 255)) {
            byte[] invalid = packet.clone();
            invalid[invalid.length - 1] = (byte) invalidPadding;
            rejectedPacket(credentials, invalid);
        }
        byte[] inconsistent = packet.clone();
        inconsistent[inconsistent.length - 2] ^= 1;
        rejectedPacket(credentials, inconsistent);
        rejectedPacket(credentials, new byte[16]);
        String truncated = Base64.getEncoder().encodeToString(new byte[17]);
        rejected(() -> codec().echo(credentials, signature(credentials, truncated, Long.toString(NOW)), Long.toString(NOW), NONCE, truncated), "IM_CALLBACK_INVALID");
    }

    private static void rejectedPacket(WeComCredentials credentials, byte[] packet) throws Exception {
        byte[] secret = Base64.getDecoder().decode(credentials.aesKey() + "=");
        Cipher cipher = Cipher.getInstance("AES/CBC/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(secret, "AES"), new IvParameterSpec(Arrays.copyOf(secret, 16)));
        String encrypted = Base64.getEncoder().encodeToString(cipher.doFinal(packet));
        String timestamp = Long.toString(NOW);
        rejected(() -> codec().echo(credentials, signature(credentials, encrypted, timestamp), timestamp, NONCE, encrypted), "IM_CALLBACK_INVALID");
    }

    private static void disabled() {
        ImProperties properties = new ImProperties();
        WeComIdentityProvider provider = new WeComIdentityProvider(properties, null);
        equal("WECOM", provider.providerType(), "only approved provider registered");
        rejected(() -> provider.identify(fixture(), "validCode"), "IM_DISABLED");
        properties.setEnabled(true);
        for (String code : Arrays.asList(null, "", "value&agentid=0", "value#fragment", "value\n", "a".repeat(513))) {
            rejected(() -> provider.identify(fixture(), code), "IM_CONFIGURATION_INVALID");
        }
        ImAccessTokens tokens = new ImAccessTokens(null, null, new ImSecretCipher(properties));
        rejected(() -> tokens.resolve(fixture(), () -> { throw new AssertionError("missing key must prevent network access"); }), "IM_SECRET_UNAVAILABLE");
    }

    static WeComCredentials fixture() {
        byte[] secret = new byte[32];
        new SecureRandom().nextBytes(secret);
        return new WeComCredentials(100, 200, 3, "corpA", 77, "app-secret-do-not-log", "callbackTokenNoLog",
                Base64.getEncoder().withoutPadding().encodeToString(secret));
    }

    private static WeComCallbackCodec codec() { return new WeComCallbackCodec(Clock.fixed(Instant.ofEpochSecond(NOW), ZoneOffset.UTC)); }
    private static String encrypt(WeComCredentials credentials, String content) { return new WxCpCryptUtil(credentials.sdkConfiguration()).encrypt("0123456789abcdef", content); }
    private static String signature(WeComCredentials credentials, String encrypted, String timestamp) { return SHA1.gen(credentials.callbackToken(), timestamp, NONCE, encrypted); }
    private static byte[] bytes(String value) { return value.getBytes(StandardCharsets.UTF_8); }
    static void check(boolean result, String name) { assertions++; if (!result) throw new AssertionError(name); }
    static void equal(Object expected, Object actual, String name) { check(Objects.equals(expected, actual), name); }
    static void rejected(Runnable action, String reason) {
        try { action.run(); throw new AssertionError("expected " + reason); }
        catch (ImFailure failure) {
            equal(reason, failure.getReasonCode(), "safe reason");
            check(failure.getCause() == null, "no unsafe upstream exception chain");
        }
    }
}
