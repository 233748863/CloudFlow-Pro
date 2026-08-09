package com.cloudflow.auth.service;

import com.cloudflow.auth.config.properties.TotpProperties;
import com.cloudflow.common.core.exception.ErrorCodeConstants;
import com.cloudflow.common.core.exception.ServiceException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

@Component
public class TotpSecretCipher {

    private static final String VERSION_PREFIX = "v1:";
    private static final int NONCE_LENGTH = 12;
    private static final int GCM_TAG_BITS = 128;

    private final TotpProperties properties;
    private final SecureRandom secureRandom = new SecureRandom();

    public TotpSecretCipher(TotpProperties properties) {
        this.properties = properties;
    }

    public boolean isAvailable() {
        String key = properties.getEncryptionKey();
        return properties.isEnabled() && StringUtils.hasText(key) && key.trim().length() >= 32;
    }

    public String encrypt(String plainText) {
        assertAvailable();
        try {
            byte[] nonce = new byte[NONCE_LENGTH];
            secureRandom.nextBytes(nonce);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, deriveKey(), new GCMParameterSpec(GCM_TAG_BITS, nonce));
            byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
            byte[] payload = ByteBuffer.allocate(nonce.length + encrypted.length)
                    .put(nonce)
                    .put(encrypted)
                    .array();
            return VERSION_PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(payload);
        } catch (Exception ex) {
            throw new ServiceException("双因素认证密钥加密失败", ErrorCodeConstants.INTERNAL_SERVER_ERROR, ex);
        }
    }

    public String decrypt(String cipherText) {
        assertAvailable();
        if (!StringUtils.hasText(cipherText) || !cipherText.startsWith(VERSION_PREFIX)) {
            throw new ServiceException("双因素认证密钥格式无效", ErrorCodeConstants.INTERNAL_SERVER_ERROR);
        }
        byte[] payload;
        try {
            payload = Base64.getUrlDecoder().decode(cipherText.substring(VERSION_PREFIX.length()));
        } catch (Exception ex) {
            throw new ServiceException("双因素认证密钥格式无效", ErrorCodeConstants.INTERNAL_SERVER_ERROR, ex);
        }
        if (payload.length <= NONCE_LENGTH) {
            throw new ServiceException("双因素认证密钥格式无效", ErrorCodeConstants.INTERNAL_SERVER_ERROR);
        }

        byte[] nonce = new byte[NONCE_LENGTH];
        byte[] encrypted = new byte[payload.length - NONCE_LENGTH];
        System.arraycopy(payload, 0, nonce, 0, NONCE_LENGTH);
        System.arraycopy(payload, NONCE_LENGTH, encrypted, 0, encrypted.length);

        // 依次试当前密钥与历史密钥，支持轮换期间新旧密文并存。
        // GCM 的认证标签保证只有正确密钥能解出来，试错不会解出错误明文。
        for (String key : candidateKeys()) {
            try {
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, deriveKey(key), new GCMParameterSpec(GCM_TAG_BITS, nonce));
                return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
            } catch (Exception ignored) {
                // 换下一个候选密钥
            }
        }
        throw new ServiceException("双因素认证密钥解密失败", ErrorCodeConstants.INTERNAL_SERVER_ERROR);
    }

    /** 当前密钥优先，其后是配置的历史密钥 */
    private List<String> candidateKeys() {
        List<String> keys = new ArrayList<>();
        keys.add(properties.getEncryptionKey().trim());
        for (String previous : properties.getPreviousEncryptionKeys()) {
            if (StringUtils.hasText(previous)) {
                keys.add(previous.trim());
            }
        }
        return keys;
    }

    public void assertAvailable() {
        if (!isAvailable()) {
            throw new ServiceException("双因素认证功能尚未配置加密密钥", ErrorCodeConstants.CONFLICT);
        }
    }

    private SecretKeySpec deriveKey() throws Exception {
        return deriveKey(properties.getEncryptionKey().trim());
    }

    private SecretKeySpec deriveKey(String key) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(key.getBytes(StandardCharsets.UTF_8));
        return new SecretKeySpec(digest, "AES");
    }
}
