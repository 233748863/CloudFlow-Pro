package com.cloudflow.auth.config.properties;

import com.cloudflow.common.core.utils.file.FileUploadUtils;
import com.cloudflow.common.core.utils.file.MimeTypeUtils;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 文件上传安全配置。
 */
@Component
@RefreshScope
@ConfigurationProperties(prefix = "cloudflow.file-upload")
public class FileUploadProperties {

    /**
     * 单文件最大上传大小，单位字节。
     */
    private Long maxSize = FileUploadUtils.DEFAULT_MAX_SIZE;

    /**
     * 允许上传的扩展名白名单。
     */
    private List<String> allowedExtensions = new ArrayList<>(Arrays.asList(MimeTypeUtils.DEFAULT_ALLOWED_EXTENSION));

    public Long getMaxSize() {
        return maxSize;
    }

    public void setMaxSize(Long maxSize) {
        this.maxSize = maxSize;
    }

    public List<String> getAllowedExtensions() {
        return allowedExtensions;
    }

    public void setAllowedExtensions(List<String> allowedExtensions) {
        this.allowedExtensions = allowedExtensions;
    }

    public long getResolvedMaxSize() {
        return maxSize == null || maxSize <= 0 ? FileUploadUtils.DEFAULT_MAX_SIZE : maxSize;
    }

    public String[] getAllowedExtensionArray() {
        if (allowedExtensions == null || allowedExtensions.isEmpty()) {
            return MimeTypeUtils.DEFAULT_ALLOWED_EXTENSION;
        }
        return allowedExtensions.toArray(new String[0]);
    }
}
