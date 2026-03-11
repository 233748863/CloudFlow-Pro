package com.cloudflow.auth.config.properties;

import com.cloudflow.common.oss.properties.OssProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Component;

/**
 * Auth ??? OSS ???
 * <p>
 * ???? common-oss ????????? enabled / configKey?
 * ????????? MinIO???? OSS???? COS ????
 */
@Component
@RefreshScope
@ConfigurationProperties(prefix = "cloudflow.oss")
public class AuthOssProperties extends OssProperties {

    /**
     * ???? OSS ???
     */
    private Boolean enabled = false;

    /**
     * ?? OSS ????
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
