package com.cloudflow.auth.config.properties;

import com.cloudflow.auth.enums.FileStorageType;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Component;

/**
 * ???????
 * <p>
 * ?????
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
     * ??????????????????????????
     */
    private String type = FileStorageType.LOCAL.name();

    /**
     * ????????????????
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
