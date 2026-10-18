package com.cloudflow.common.security.oauth2;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

public final class OAuthDigests {
    private static final SecureRandom RANDOM = new SecureRandom();

    private OAuthDigests() { }

    public static String random() {
        byte[] entropy = new byte[32];
        RANDOM.nextBytes(entropy);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(entropy);
    }

    public static String hash(String value) {
        return HexFormat.of().formatHex(sha256(value));
    }

    public static boolean token(String value) {
        if (value == null || !value.matches("[A-Za-z0-9_-]{43}")) return false;
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(value);
            return decoded.length == 32 && value.equals(Base64.getUrlEncoder().withoutPadding().encodeToString(decoded));
        } catch (IllegalArgumentException invalid) {
            return false;
        }
    }

    public static String challenge(String verifier) {
        if (verifier == null || !verifier.matches("[A-Za-z0-9._~-]{43,128}")) throw OAuthFailure.invalidGrant();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(sha256(verifier));
    }

    public static boolean matches(String first, String second) {
        return first != null && second != null && MessageDigest.isEqual(
                first.getBytes(StandardCharsets.UTF_8), second.getBytes(StandardCharsets.UTF_8));
    }

    private static byte[] sha256(String value) {
        if (value == null) throw new IllegalArgumentException("缺少摘要输入");
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256不可用");
        }
    }
}

