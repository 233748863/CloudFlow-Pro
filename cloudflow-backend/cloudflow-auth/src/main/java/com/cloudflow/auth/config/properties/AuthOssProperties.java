package com.cloudflow.auth.config.properties;

import com.cloudflow.common.oss.properties.OssProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Component;

/**
 * Auth 服务 OSS 配置。
 * <p>
 * 在 common-oss 的基础上补充 enabled / configKey 配置，
 * 用于在认证服务中复用 MinIO、阿里云 OSS、腾讯云 COS 等对象存储。
 */
@Component
@RefreshScope
@ConfigurationProperties(prefix = "cloudflow.oss")
public class AuthOssProperties extends OssProperties {

    /**
     * 是否启用 OSS 存储。
     */
    private Boolean enabled = false;

    /**
     * 默认 OSS 配置键。
     */
    private String configKey = "default";

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public String getConfigKey() {
        return configKey;
    }

    public void setConfigKey(String configKey) {
        this.configKey = configKey;
    }
}
