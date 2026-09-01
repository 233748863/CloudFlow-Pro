package com.cloudflow.auth.config.properties;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@ConfigurationProperties(prefix = "cloudflow.auth.totp")
public class TotpProperties {

    private boolean enabled = false;
    private String encryptionKey = "";
    /**
     * 轮换前的历史密钥，只用于解密旧密文，新密文一律用 encryptionKey 加密。
     * 轮换步骤：把当前 key 挪进这个列表 → encryptionKey 换成新值 → 全量重新加密后再清空列表。
     */
    private List<String> previousEncryptionKeys = new ArrayList<>();
    private String issuer = "CloudFlow Pro";
    private long challengeTtlSeconds = 300L;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getEncryptionKey() {
        return encryptionKey;
    }

    public void setEncryptionKey(String encryptionKey) {
        this.encryptionKey = encryptionKey;
    }

    public List<String> getPreviousEncryptionKeys() {
        return previousEncryptionKeys;
    }

    public void setPreviousEncryptionKeys(List<String> previousEncryptionKeys) {
        this.previousEncryptionKeys = previousEncryptionKeys == null ? new ArrayList<>() : previousEncryptionKeys;
    }

    public String getIssuer() {
        return issuer;
    }

    public void setIssuer(String issuer) {
        this.issuer = issuer;
    }

    public long getChallengeTtlSeconds() {
        return challengeTtlSeconds;
    }

    public void setChallengeTtlSeconds(long challengeTtlSeconds) {
        this.challengeTtlSeconds = challengeTtlSeconds;
    }
}
