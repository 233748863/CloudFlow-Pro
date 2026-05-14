package com.cloudflow.common.encrypt.core;

import cn.hutool.core.codec.Base64;
import cn.hutool.core.util.StrUtil;
import cn.hutool.crypto.symmetric.AES;
import cn.hutool.crypto.symmetric.SM4;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.encrypt.enums.AlgorithmType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;

/**
 * 加解密工具类
 * <p>
 * 基于 Hutool 实现 AES / SM4 / Base64 三种加密方式。
 * 加密后的密文统一使用 Base64 编码存储，方便数据库存储。
 *
 * @author CloudFlow
 */
public class EncryptUtils {

    private static final Logger log = LoggerFactory.getLogger(EncryptUtils.class);
    private static final String DECRYPT_FAILURE_PLACEHOLDER = "***";

    private EncryptUtils() {
    }

    /**
     * 加密
     *
     * @param plainText 明文
     * @param algorithm 算法类型
     * @param key       密钥
     * @return 密文（Base64 编码）
     */
    public static String encrypt(String plainText, AlgorithmType algorithm, String key) {
        if (StrUtil.isBlank(plainText)) {
            return plainText;
        }
        try {
            return switch (algorithm) {
                case AES -> {
                    AES aes = new AES(key.getBytes(StandardCharsets.UTF_8));
                    yield aes.encryptBase64(plainText);
                }
                case SM4 -> {
                    SM4 sm4 = new SM4(key.getBytes(StandardCharsets.UTF_8));
                    yield sm4.encryptBase64(plainText);
                }
                case BASE64 -> Base64.encode(plainText);
            };
        } catch (Exception e) {
            log.error("[Encrypt] 加密失败, algorithm={}, plainTextLength={}", algorithm, plainText.length(), e);
            throw new EncryptException("字段加密失败", e);
        }
    }

    /**
     * 解密
     *
     * @param cipherText 密文（Base64 编码）
     * @param algorithm  算法类型
     * @param key        密钥
     * @return 明文
     */
    public static String decrypt(String cipherText, AlgorithmType algorithm, String key) {
        if (StrUtil.isBlank(cipherText)) {
            return cipherText;
        }
        try {
            return switch (algorithm) {
                case AES -> {
                    AES aes = new AES(key.getBytes(StandardCharsets.UTF_8));
                    yield aes.decryptStr(cipherText);
                }
                case SM4 -> {
                    SM4 sm4 = new SM4(key.getBytes(StandardCharsets.UTF_8));
                    yield sm4.decryptStr(cipherText);
                }
                case BASE64 -> Base64.decodeStr(cipherText);
            };
        } catch (Exception e) {
            log.warn("[Encrypt] 解密失败, algorithm={}, cipherTextLength={}", algorithm, cipherText.length(), e);
            return DECRYPT_FAILURE_PLACEHOLDER;
        }
    }

    public static class EncryptException extends ServiceException {
        public EncryptException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
