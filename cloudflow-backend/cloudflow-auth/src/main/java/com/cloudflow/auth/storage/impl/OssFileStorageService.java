package com.cloudflow.auth.storage.impl;

import cn.hutool.core.util.StrUtil;
import com.cloudflow.auth.config.properties.AuthOssProperties;
import com.cloudflow.auth.config.properties.FileStorageProperties;
import com.cloudflow.auth.enums.FileStorageType;
import com.cloudflow.auth.storage.FileStorageService;
import com.cloudflow.auth.storage.model.StoredFileInfo;
import com.cloudflow.common.oss.core.OssClient;
import com.cloudflow.common.oss.entity.UploadResult;
import com.cloudflow.common.oss.enums.AccessPolicyType;
import com.cloudflow.common.oss.factory.OssFactory;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;

/**
 * OSS ???????
 * <p>
 * ?? S3 ???????MinIO???? OSS???? COS??????
 */
@Service
@RequiredArgsConstructor
public class OssFileStorageService implements FileStorageService {

    private final AuthOssProperties authOssProperties;
    private final FileStorageProperties fileStorageProperties;

    @Override
    public FileStorageType getStorageType() {
        return FileStorageType.OSS;
    }

    @Override
    public StoredFileInfo store(MultipartFile file) throws Exception {
        OssClient client = getClient();
        String suffix = resolveSuffix(file);
        UploadResult uploadResult = client.uploadSuffix(file.getInputStream(), suffix, file.getSize(), file.getContentType());
        return StoredFileInfo.builder()
            .filePath(uploadResult.getFilename())
            .persistedUrl(uploadResult.getUrl())
            .build();
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
                ? 30
                : Math.max(fileStorageProperties.getPresignedExpireMinutes(), 1);
            // ????????????????????? URL ?????????
            return client.getPresignedUrl(filePath, Duration.ofMinutes(expireMinutes));
        }
        return client.getUrl() + "/" + filePath;
    }

    private OssClient getClient() {
        if (!Boolean.TRUE.equals(authOssProperties.getEnabled())) {
            throw new IllegalStateException("OSS ?????????? cloudflow.oss.enabled ???????");
        }
        validateRequiredConfig();
        OssFactory.register(authOssProperties.getConfigKey(), authOssProperties);
        OssFactory.setDefaultConfigKey(authOssProperties.getConfigKey());
        return OssFactory.instance(authOssProperties.getConfigKey());
    }

    /**
     * ?????????????????????????
     */
    private void validateRequiredConfig() {
        if (StrUtil.hasBlank(
            authOssProperties.getEndpoint(),
            authOssProperties.getAccessKey(),
            authOssProperties.getSecretKey(),
            authOssProperties.getBucketName(),
            authOssProperties.getRegion())) {
            throw new IllegalStateException("OSS ????????? endpoint/accessKey/secretKey/bucketName/region");
        }
    }

    private String resolveSuffix(MultipartFile file) {
        String originalFilename = file.getOriginalFilename();
        if (StrUtil.isBlank(originalFilename) || !originalFilename.contains(".")) {
            return ".bin";
        }
        return originalFilename.substring(originalFilename.lastIndexOf('.'));
    }
}
