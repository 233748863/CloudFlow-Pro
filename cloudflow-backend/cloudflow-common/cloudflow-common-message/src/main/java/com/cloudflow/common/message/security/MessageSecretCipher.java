package com.cloudflow.common.message.security;

import com.cloudflow.common.core.exception.ServiceException;
import org.springframework.beans.factory.annotation.Value;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * 消息渠道密钥加密器。密钥只在内存中解密使用，日志不输出明文。
 */
public class MessageSecretCipher {
    private static final int NONCE_LENGTH = 12;
    private static final int TAG_BITS = 128;
    private final SecureRandom secureRandom = new SecureRandom();
    private final String secretKey;

    public MessageSecretCipher(@Value("${cloudflow.message.secret-key:${CLOUDFLOW_MESSAGE_SECRET_KEY:}}") String secretKey) {
        this.secretKey = secretKey;
    }

    public String encrypt(String plainText) {
        if (plainText == null || plainText.isBlank()) {
            return plainText;
        }
        try {
            byte[] nonce = new byte[NONCE_LENGTH];
            secureRandom.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(keyBytes(), "AES"),
                    new GCMParameterSpec(TAG_BITS, nonce));
            byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(nonce.length + encrypted.length)
                    .put(nonce).put(encrypted).array());
        } catch (Exception e) {
            throw new ServiceException("消息密钥加密失败", 500, e);
        }
    }

    public String decrypt(String cipherText) {
        if (cipherText == null || cipherText.isBlank()) {
            return cipherText;
        }
        try {
            byte[] payload = Base64.getDecoder().decode(cipherText);
            if (payload.length <= NONCE_LENGTH) {
                throw new IllegalArgumentException("密文格式错误");
            }
            byte[] nonce = new byte[NONCE_LENGTH];
            byte[] encrypted = new byte[payload.length - NONCE_LENGTH];
            System.arraycopy(payload, 0, nonce, 0, NONCE_LENGTH);
            System.arraycopy(payload, NONCE_LENGTH, encrypted, 0, encrypted.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(keyBytes(), "AES"),
                    new GCMParameterSpec(TAG_BITS, nonce));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new ServiceException("消息密钥解密失败", 500, e);
        }
    }

    public String mask(String plainText) {
        if (plainText == null || plainText.isBlank()) {
            return plainText;
        }
        String value = plainText.trim();
        if (value.length() <= 4) return "****";
        return "****" + value.substring(value.length() - 4);
    }

    /** 按接收地址类型脱敏；手机号与邮箱保持项目统一展示格式。 */
    public String maskAddress(String plainText) {
        if (plainText == null || plainText.isBlank()) return plainText;
        String value = plainText.trim();
        if (value.matches("^1[3-9]\\d{9}$")) {
            return value.substring(0, 3) + "****" + value.substring(7);
        }
        int at = value.indexOf('@');
        if (at >= 0) {
            String local = value.substring(0, at);
            String domain = value.substring(at);
            return (local.isEmpty() ? "***" : local.substring(0, 1) + "***") + domain;
        }
        return mask(value);
    }

    private byte[] keyBytes() {
        if (secretKey == null || secretKey.isBlank()) {
            throw new ServiceException("未配置 cloudflow.message.secret-key，禁止加解密消息密钥", 500);
        }
        String source = secretKey.trim();
        if (source.length() < 32) {
            throw new ServiceException("cloudflow.message.secret-key 长度不能少于32个字符", 500);
        }
        try {
            return MessageDigest.getInstance("SHA-256")
                    .digest(source.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new ServiceException("消息密钥初始化失败", 500, e);
        }
    }
}
