package com.cloudflow.common.encrypt.properties;

import cn.hutool.core.util.StrUtil;
import com.cloudflow.common.core.exception.ServiceException;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 加密模块配置属性
 * <p>
 * 在 application.yml 中配置：
 * <pre>
 * cloudflow:
 *   encrypt:
 *     enabled: true
 *     aes-key: "1234567890abcdef"   # AES 密钥（16位）
 *     sm4-key: "1234567890abcdef"   # SM4 密钥（16位）
 * </pre>
 *
 * @author CloudFlow
 */
@ConfigurationProperties(prefix = "cloudflow.encrypt")
public class EncryptorProperties {

    /** 是否启用加密功能 */
    private boolean enabled = false;

    /** AES 加密密钥（16/24/32 字节） */
    private String aesKey = "";

    /** SM4 加密密钥（16 字节） */
    private String sm4Key = "";

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getAesKey() {
        return aesKey;
    }

    public void setAesKey(String aesKey) {
        this.aesKey = aesKey;
    }

    public String getSm4Key() {
        return sm4Key;
    }

    public void setSm4Key(String sm4Key) {
        this.sm4Key = sm4Key;
    }

    public void validate() {
        if (!enabled) {
            return;
        }
        if (StrUtil.isBlank(aesKey) && StrUtil.isBlank(sm4Key)) {
            throw new ServiceException("cloudflow.encrypt 已启用，但未配置 aes-key 或 sm4-key");
        }
    }
}
