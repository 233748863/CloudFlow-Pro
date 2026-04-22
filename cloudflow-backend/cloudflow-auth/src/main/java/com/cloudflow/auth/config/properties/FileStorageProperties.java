package com.cloudflow.auth.config.properties;

import com.cloudflow.auth.enums.FileStorageType;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Component;

/**
 * 文件存储配置。
 * <p>
 * 配置示例：
 * cloudflow:
 *   file-storage:
 *     type: local
 *     presigned-expire-minutes: 30
 */
@Component
@RefreshScope
@ConfigurationProperties(prefix = "cloudflow.file-storage")
public class FileStorageProperties {

    /**
     * 存储类型，支持 local / oss，默认 local。
     */
    private String type = FileStorageType.LOCAL.name();

    /**
     * 私有 OSS 预签名访问地址有效期，单位分钟。
     */
    private Integer presignedExpireMinutes = 30;

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public Integer getPresignedExpireMinutes() {
        return presignedExpireMinutes;
    }

    public void setPresignedExpireMinutes(Integer presignedExpireMinutes) {
        this.presignedExpireMinutes = presignedExpireMinutes;
    }

    public FileStorageType getResolvedType() {
        return FileStorageType.fromValue(type);
    }
}
