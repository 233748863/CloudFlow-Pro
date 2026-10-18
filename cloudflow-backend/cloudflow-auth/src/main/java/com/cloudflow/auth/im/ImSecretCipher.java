package com.cloudflow.auth.im;

import com.cloudflow.common.message.security.MessageSecretCipher;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImSecretCipher {
    public enum Field { APP_KEY, APP_SECRET, TOKEN, AES_KEY, SNAPSHOT, ACCESS_TOKEN, LOGIN_CHALLENGE, LOGIN_MFA, BINDING_PROOF, BINDING_MEMBER }

    private final ImProperties properties;

    public String encrypt(long tenantId, String provider, Field field, String plainText) {
        MessageSecretCipher cipher = delegate(tenantId, provider, field);
        if (plainText == null || plainText.isBlank() || plainText.getBytes(StandardCharsets.UTF_8).length > limit(field)) {
            throw ImFailure.configuration();
        }
        try {
            String encrypted = cipher.encrypt(plainText);
            if (!same(plainText, cipher.decrypt(encrypted))) throw ImFailure.secret();
            return "im1:" + encrypted;
        } catch (RuntimeException failure) {
            throw ImFailure.secret();
        }
    }

    public String decrypt(long tenantId, String provider, Field field, String encrypted) {
        MessageSecretCipher cipher = delegate(tenantId, provider, field);
        if (encrypted == null || !encrypted.startsWith("im1:") || encrypted.length() > encodedLimit(field)) {
            throw ImFailure.secret();
        }
        try {
            String plainText = cipher.decrypt(encrypted.substring(4));
            if (plainText == null || plainText.isBlank() || plainText.getBytes(StandardCharsets.UTF_8).length > limit(field)) {
                throw ImFailure.secret();
            }
            return plainText;
        } catch (RuntimeException failure) {
            throw ImFailure.secret();
        }
    }

    public void requireKey() {
        if (properties.getSecretKey() == null || properties.getSecretKey().trim().length() < 32) {
            throw ImFailure.secret();
        }
    }

    private MessageSecretCipher delegate(long tenantId, String provider, Field field) {
        requireKey();
        if (tenantId <= 0 || !"WECOM".equals(provider) || field == null) throw ImFailure.configuration();
        return new MessageSecretCipher("cloudflow:im:v1:" + tenantId + ":" + provider + ":" + field.name()
                + ":" + properties.getSecretKey().trim());
    }

    private static int limit(Field field) {
        return field == Field.SNAPSHOT ? 8 * 1024 * 1024 : field == Field.LOGIN_CHALLENGE || field == Field.LOGIN_MFA || field == Field.BINDING_MEMBER ? 8192 : 1024;
    }

    private static int encodedLimit(Field field) {
        return field == Field.SNAPSHOT ? 12 * 1024 * 1024 : field == Field.LOGIN_CHALLENGE || field == Field.LOGIN_MFA || field == Field.BINDING_MEMBER ? 12000 : 2000;
    }

    private static boolean same(String expected, String actual) {
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), actual.getBytes(StandardCharsets.UTF_8));
    }
}
