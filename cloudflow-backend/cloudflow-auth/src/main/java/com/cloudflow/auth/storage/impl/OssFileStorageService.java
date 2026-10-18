package com.cloudflow.auth.storage.impl;

import cn.hutool.core.util.StrUtil;
import com.cloudflow.auth.config.properties.AuthOssProperties;
import com.cloudflow.auth.config.properties.FileStorageProperties;
import com.cloudflow.auth.enums.FileStorageType;
import com.cloudflow.auth.storage.FileStorageService;
import com.cloudflow.auth.storage.model.StoredFileInfo;
import com.cloudflow.common.core.utils.file.FileUploadUtils;
import com.cloudflow.common.oss.core.OssClient;
import com.cloudflow.common.oss.entity.UploadResult;
import com.cloudflow.common.oss.enums.AccessPolicyType;
import com.cloudflow.common.oss.factory.OssFactory;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * OSS 文件存储实现。
 * <p>
 * 基于 S3 兼容接口，支持 MinIO、阿里云 OSS、腾讯云 COS 等对象存储。
 */
@Service
@RequiredArgsConstructor
public class OssFileStorageService implements FileStorageService {

    @Override
    public java.io.InputStream open(String filePath) {
        return getClient().open(filePath);
    }

    private final AuthOssProperties authOssProperties;
    private final FileStorageProperties fileStorageProperties;

    @Override
    public FileStorageType getStorageType() {
        return FileStorageType.OSS;
    }

    @Override
    public String getBucket() {
        return authOssProperties.getBucketName();
    }

    @Override
    public StoredFileInfo store(FileUploadUtils.ValidatedFile file) throws Exception {
        OssClient client = getClient();
        String suffix = "." + file.extension();
        try (java.io.InputStream input = file.file().getInputStream()) {
            UploadResult uploadResult = client.uploadSuffix(input, suffix, file.file().getSize(), file.contentType());
            return StoredFileInfo.builder()
                .filePath(uploadResult.getFilename())
                .persistedUrl(uploadResult.getFilename())
                .build();
        }
    }

    @Override
    public void delete(String filePath) {
        if (StrUtil.isBlank(filePath)) {
            return;
        }
        getClient().delete(filePath);
    }

    @Override
    public String resolveUrl(String filePath) {
        if (StrUtil.isBlank(filePath)) {
            return "";
        }
        OssClient client = getClient();
        if (client.getAccessPolicy() == AccessPolicyType.PRIVATE) {
            int expireMinutes = fileStorageProperties.getPresignedExpireMinutes() == null
                ? 5
                : Math.min(60, Math.max(fileStorageProperties.getPresignedExpireMinutes(), 1));
            return client.getPresignedUrl(filePath, Duration.ofMinutes(expireMinutes));
        }
        return client.getUrl() + "/" + filePath;
    }

    public OssClient getClient() {
        if (!Boolean.TRUE.equals(authOssProperties.getEnabled())) {
            throw new IllegalStateException("OSS 存储未启用，请先开启 cloudflow.oss.enabled 配置");
        }
        authOssProperties.requirePrivateAccess();
        validateRequiredConfig();
        OssFactory.register(authOssProperties.getConfigKey(), authOssProperties);
        OssFactory.setDefaultConfigKey(authOssProperties.getConfigKey());
        return OssFactory.instance(authOssProperties.getConfigKey());
    }

    @Override
    public String resolveSignedUrl(String filePath, int seconds) {
        if (StrUtil.isBlank(filePath) || seconds < 1 || seconds > 3600) {
            throw new IllegalArgumentException("文件路径或签名有效期无效");
        }
        return getClient().getPresignedUrl(filePath, Duration.ofSeconds(seconds));
    }

    /**
     * 校验创建 OSS 客户端所需的关键配置。
     */
    public void validateRequiredConfig() {
        authOssProperties.requirePrivateAccess();
        if (StrUtil.hasBlank(
            authOssProperties.getEndpoint(),
            authOssProperties.getAccessKey(),
            authOssProperties.getSecretKey(),
            authOssProperties.getBucketName(),
            authOssProperties.getRegion())) {
            throw new IllegalStateException("OSS 存储配置不完整，请检查 endpoint/accessKey/secretKey/bucketName/region");
        }
    }
}
