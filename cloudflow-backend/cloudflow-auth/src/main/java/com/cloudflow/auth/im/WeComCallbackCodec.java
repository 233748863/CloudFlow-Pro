package com.cloudflow.auth.im;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import me.chanjar.weixin.common.util.crypto.SHA1;
import me.chanjar.weixin.cp.util.crypto.WxCpCryptUtil;

public final class WeComCallbackCodec {
    private final Clock clock;

    public WeComCallbackCodec() {
        this(Clock.systemUTC());
    }

    WeComCallbackCodec(Clock clock) {
        this.clock = clock;
    }

    public VerifiedCallback event(WeComCredentials credentials, String signature, String timestamp, String nonce, byte[] body) {
        Map<String, String> envelope = ImCallbackXml.read(body);
        String plainText = decrypt(credentials, signature, timestamp, nonce, envelope.get("Encrypt"));
        Map<String, String> fields = ImCallbackXml.read(plainText.getBytes(StandardCharsets.UTF_8));
        if (!credentials.corpId().equals(fields.get("ToUserName"))) throw ImFailure.callback();
        String agentId = fields.get("AgentID");
        if (agentId != null && !Long.toString(credentials.agentId()).equals(agentId)) throw ImFailure.callback();
        return new VerifiedCallback(hash(plainText), fields);
    }

    public String echo(WeComCredentials credentials, String signature, String timestamp, String nonce, String encrypted) {
        return decrypt(credentials, signature, timestamp, nonce, encrypted);
    }

    private String decrypt(WeComCredentials credentials, String signature, String timestamp, String nonce, String encrypted) {
        credentials.requireCallbackKeys();
        try {
            if (signature == null || !signature.matches("[a-fA-F0-9]{40}") || timestamp == null || !timestamp.matches("[0-9]{1,12}")
                    || nonce == null || !nonce.matches("[A-Za-z0-9_-]{1,128}") || encrypted == null
                    || encrypted.length() > ImCallbackXml.MAX_BYTES || !encrypted.matches("[A-Za-z0-9+/]+={0,2}")) {
                throw ImFailure.callback();
            }
            long sentAt = Long.parseLong(timestamp);
            long now = clock.instant().getEpochSecond();
            if (sentAt < now - 300 || sentAt > now + 300) throw ImFailure.callback();
            String expected = SHA1.gen(credentials.callbackToken(), timestamp, nonce, encrypted);
            if (!MessageDigest.isEqual(HexFormat.of().parseHex(expected), HexFormat.of().parseHex(signature))) {
                throw ImFailure.callback();
            }
            byte[] content = verifyEnterpriseEnvelope(credentials, encrypted);
            String plainText = new WxCpCryptUtil(credentials.sdkConfiguration()).decryptContent(expected, timestamp, nonce, encrypted);
            if (!MessageDigest.isEqual(content, plainText.getBytes(StandardCharsets.UTF_8))) throw ImFailure.callback();
            return ImCallbackXml.utf8(content);
        } catch (RuntimeException | GeneralSecurityException failure) {
            throw ImFailure.callback();
        }
    }

    private byte[] verifyEnterpriseEnvelope(WeComCredentials credentials, String encrypted) throws GeneralSecurityException {
        byte[] secret = Base64.getDecoder().decode(credentials.aesKey() + "=");
        byte[] encryptedBytes = Base64.getDecoder().decode(encrypted);
        if (encryptedBytes.length == 0 || encryptedBytes.length % 16 != 0
                || !Base64.getEncoder().encodeToString(encryptedBytes).equals(encrypted)) throw ImFailure.callback();
        Cipher cipher = Cipher.getInstance("AES/CBC/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(secret, "AES"), new IvParameterSpec(Arrays.copyOf(secret, 16)));
        byte[] packet = cipher.doFinal(encryptedBytes);
        int padding = Byte.toUnsignedInt(packet[packet.length - 1]);
        if (padding < 1 || padding > 32 || packet.length - padding < 20) throw ImFailure.callback();
        for (int index = packet.length - padding; index < packet.length; index++) {
            if (Byte.toUnsignedInt(packet[index]) != padding) throw ImFailure.callback();
        }
        int contentLength = ByteBuffer.wrap(packet, 16, 4).getInt();
        int unpaddedLength = packet.length - padding;
        if (contentLength <= 0 || contentLength > ImCallbackXml.MAX_BYTES || contentLength > unpaddedLength - 20) {
            throw ImFailure.callback();
        }
        byte[] enterprise = Arrays.copyOfRange(packet, 20 + contentLength, unpaddedLength);
        if (!MessageDigest.isEqual(enterprise, credentials.corpId().getBytes(StandardCharsets.UTF_8))) throw ImFailure.callback();
        return Arrays.copyOfRange(packet, 20, 20 + contentLength);
    }

    private String hash(String content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException failure) {
            throw ImFailure.callback();
        }
    }

    public record VerifiedCallback(String payloadHash, @JsonIgnore Map<String, String> fields) {
        public VerifiedCallback {
            fields = Map.copyOf(fields);
        }

        @Override
        public String toString() {
            return "VerifiedCallback[payloadHash=" + payloadHash + "]";
        }
    }
}
