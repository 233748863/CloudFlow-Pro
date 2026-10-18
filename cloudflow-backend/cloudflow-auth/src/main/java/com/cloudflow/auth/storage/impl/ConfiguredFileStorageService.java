package com.cloudflow.auth.storage.impl;

import com.cloudflow.auth.domain.SysFileConfig;
import com.cloudflow.auth.enums.FileStorageType;
import com.cloudflow.auth.storage.FileStorageRules;
import com.cloudflow.auth.storage.FileStorageService;
import com.cloudflow.auth.storage.model.StoredFileInfo;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.file.FileUploadUtils;
import com.cloudflow.common.oss.core.OssClient;
import com.cloudflow.common.oss.entity.UploadResult;
import com.cloudflow.common.oss.factory.OssFactory;
import com.cloudflow.common.oss.properties.OssProperties;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;

public class ConfiguredFileStorageService implements FileStorageService {
    private final SysFileConfig configuration;
    private final OssProperties properties;

    public ConfiguredFileStorageService(SysFileConfig configuration, OssProperties properties) {
        this.configuration = configuration;
        this.properties = properties;
    }

    @Override
    public SysFileConfig getConfiguration() {
        return configuration;
    }

    @Override
    public String getBucket() {
        return configuration.getBucket();
    }

    @Override
    public FileStorageType getStorageType() {
        return FileStorageType.fromValue(configuration.getStorageType());
    }

    @Override
    public void validate(FileUploadUtils.ValidatedFile file) {
        if (file.file().getSize() > configuration.getMaxFileSize()) {
            throw new ServiceException("文件大小超出当前存储配置上限");
        }
        String extensions = configuration.getAllowedExtensions();
        if (extensions != null && !extensions.isBlank()
                && Arrays.stream(extensions.split(",")).noneMatch(extension -> extension.equalsIgnoreCase(file.extension()))) {
            throw new ServiceException("当前存储配置不允许该文件类型");
        }
    }

    @Override
    public StoredFileInfo store(FileUploadUtils.ValidatedFile file) throws Exception {
        validate(file);
        if (getStorageType() == FileStorageType.LOCAL) {
            String relative = FileUploadUtils.upload(FileStorageRules.localDirectory(configuration.getBasePath()).toString(), file);
            return StoredFileInfo.builder().filePath(relative).persistedUrl(relative).build();
        }
        try (InputStream input = file.file().getInputStream()) {
            UploadResult result = client().uploadSuffix(input, "." + file.extension(), file.file().getSize(), file.contentType());
            return StoredFileInfo.builder().filePath(result.getFilename()).persistedUrl(result.getFilename()).build();
        }
    }

    @Override
    public void delete(String filePath) {
        if (getStorageType() != FileStorageType.LOCAL) {
            client().delete(filePath);
            return;
        }
        try {
            Files.deleteIfExists(FileStorageRules.localFile(filePath));
        } catch (IOException exception) {
            throw new ServiceException("本地文件删除失败");
        }
    }

    @Override
    public String resolveUrl(String filePath) {
        if (getStorageType() == FileStorageType.LOCAL) return filePath;
        return client().getPresignedUrl(filePath, Duration.ofSeconds(configuration.getSignedUrlExpireSeconds()));
    }

    @Override
    public String resolveSignedUrl(String filePath, int seconds) {
        if (getStorageType() == FileStorageType.LOCAL || seconds < 1 || seconds > 3600) {
            throw new ServiceException("存储类型或签名有效期无效");
        }
        return client().getPresignedUrl(filePath, Duration.ofSeconds(seconds));
    }

    @Override
    public InputStream open(String filePath) throws IOException {
        return getStorageType() == FileStorageType.LOCAL
                ? Files.newInputStream(FileStorageRules.localFile(filePath)) : client().open(filePath);
    }

    public void testConnection() {
        try {
            if (getStorageType() == FileStorageType.LOCAL) {
                Path directory = FileStorageRules.localDirectory(configuration.getBasePath());
                Files.createDirectories(directory);
                Path probe = Files.createTempFile(directory, ".cloudflow-connection-", ".tmp");
                try {
                    Files.writeString(probe, "cloudflow-storage-check", StandardCharsets.UTF_8);
                } finally {
                    Files.deleteIfExists(probe);
                }
            } else {
                client().testConnection();
            }
        } catch (Exception exception) {
            throw new ServiceException("存储连接测试失败，请检查地址、权限及密钥配置");
        }
    }

    private OssClient client() {
        properties.requirePrivateAccess();
        String key = "file-config-" + configuration.getTenantId() + "-" + configuration.getConfigId();
        OssFactory.register(key, properties);
        return OssFactory.instance(key);
    }
}
