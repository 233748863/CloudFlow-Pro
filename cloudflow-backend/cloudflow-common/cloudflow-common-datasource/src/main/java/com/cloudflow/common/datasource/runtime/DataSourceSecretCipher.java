package com.cloudflow.common.datasource.runtime;

import com.cloudflow.common.message.security.MessageSecretCipher;
import java.util.Objects;
import org.springframework.stereotype.Component;

@Component
public class DataSourceSecretCipher {
    private final DataSourceRuntimeProperties properties;

    public DataSourceSecretCipher(DataSourceRuntimeProperties properties) { this.properties = properties; }

    public String encrypt(String password) {
        requireKey();
        if (password == null || password.isBlank() || password.length() > 512
                || password.matches("\\*+") || password.indexOf('\0') >= 0) {
            throw new DataSourceFailure("INVALID_SECRET", "请输入真实的非空数据库密码", 400);
        }
        try {
            MessageSecretCipher cipher = delegate();
            String encrypted = cipher.encrypt(password);
            if (!Objects.equals(password, cipher.decrypt(encrypted))) throw new IllegalStateException();
            return "ds1:" + encrypted;
        } catch (RuntimeException failure) {
            throw new DataSourceFailure("SECRET_ENCRYPT_FAILED", "数据源密码加密校验失败", 503);
        }
    }

    public String decrypt(String encrypted) {
        requireKey();
        if (encrypted == null || !encrypted.startsWith("ds1:") || encrypted.length() > 2000) {
            throw new DataSourceFailure("SECRET_UNAVAILABLE", "数据源密码尚未配置或密文无效", 409);
        }
        try {
            String password = delegate().decrypt(encrypted.substring(4));
            if (password == null || password.isBlank()) throw new IllegalStateException();
            return password;
        } catch (RuntimeException failure) {
            throw new DataSourceFailure("SECRET_DECRYPT_FAILED", "数据源密码解密失败，请检查独立加密密钥", 503);
        }
    }

    public void requireKey() {
        if (properties.getSecretKey() == null || properties.getSecretKey().trim().length() < 32) {
            throw new DataSourceFailure("SECRET_KEY_MISSING", "未配置数据源独立加密密钥，禁止保存或启用", 503);
        }
    }

    private MessageSecretCipher delegate() {
        return new MessageSecretCipher("cloudflow:data-source:password:v1:" + properties.getSecretKey().trim());
    }
}
