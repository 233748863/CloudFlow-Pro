package com.cloudflow.auth.oauth2;

import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.common.security.oauth2.OAuthDigests;
import com.cloudflow.common.security.oauth2.OAuthFailure;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class OAuthSecretCipher {
    private final OAuthProperties properties;

    public String encrypt(String raw) {
        requireKey();
        if (!OAuthDigests.token(raw)) throw OAuthFailure.invalid("客户端密钥必须是32字节随机生成值");
        try {
            MessageSecretCipher cipher = delegate();
            String encrypted = cipher.encrypt(raw);
            if (!OAuthDigests.matches(raw, cipher.decrypt(encrypted))) throw new IllegalStateException();
            return "oauth1:" + encrypted;
        } catch (RuntimeException failure) {
            throw new OAuthFailure("server_error", "第三方客户端密钥加密失败", 503);
        }
    }

    public boolean matches(String raw, String encrypted) {
        requireKey();
        if (!OAuthDigests.token(raw) || encrypted == null || !encrypted.startsWith("oauth1:") || encrypted.length() > 2000) return false;
        try { return OAuthDigests.matches(raw, delegate().decrypt(encrypted.substring(7))); }
        catch (RuntimeException failure) { throw new OAuthFailure("server_error", "客户端密钥无法验证，请联系管理员", 503); }
    }

    public void requireKey() {
        if (properties.getSecretKey() == null || properties.getSecretKey().trim().length() < 32) {
            throw new OAuthFailure("temporarily_unavailable", "未配置第三方授权独立加密密钥", 503);
        }
    }

    private MessageSecretCipher delegate() {
        return new MessageSecretCipher("cloudflow:oauth2:client-secret:v1:" + properties.getSecretKey().trim());
    }
}

