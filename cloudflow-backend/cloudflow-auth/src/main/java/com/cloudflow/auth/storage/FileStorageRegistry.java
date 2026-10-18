package com.cloudflow.auth.storage;

import cn.hutool.core.util.StrUtil;
import com.cloudflow.auth.config.properties.FileStorageProperties;
import com.cloudflow.auth.enums.FileStorageType;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.domain.SysFileConfig;
import com.cloudflow.auth.service.SysFileConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * 文件存储服务注册表。
 * <p>
 * 职责：
 * - 根据配置选择 LOCAL 实现，或按指定类型查找存储服务。
 * - 兼容历史 storageType=OSS 场景，统一解析为对象存储服务。
 */
@Component
@RequiredArgsConstructor
public class FileStorageRegistry {

    private final List<FileStorageService> storageServices;
    private final FileStorageProperties fileStorageProperties;
    private final SysFileConfigService configurations;

    /**
     * 获取当前启用的存储服务。
     */
    public FileStorageService getCurrentService() {
        SysFileConfig config = configurations.current();
        return config == null ? getService(fileStorageProperties.getResolvedType()) : configurations.storage(config);
    }

    public FileStorageService getForFile(SysFile file) {
        if (file.getConfigId() == null) return getService(resolveType(file.getStorageType()));
        SysFileConfig config = configurations.requireForStorage(file.getConfigId());
        if (!config.getStorageType().equals(file.getStorageType())) {
            throw new IllegalStateException("文件存储配置与记录不一致");
        }
        return configurations.storage(config);
    }

    /**
     * 按存储类型获取服务实现。
     */
    public FileStorageService getService(FileStorageType storageType) {
        Map<FileStorageType, FileStorageService> serviceMap = new EnumMap<>(FileStorageType.class);
        for (FileStorageService storageService : storageServices) {
            serviceMap.put(storageService.getStorageType(), storageService);
        }
        FileStorageService targetService = serviceMap.get(storageType);
        if (targetService == null && storageType != FileStorageType.LOCAL) {
            FileStorageService remote = serviceMap.get(FileStorageType.OSS);
            if (remote != null) return new RemoteFileStorageAlias(storageType, remote);
        }
        if (targetService == null) {
            throw new IllegalStateException("未找到存储服务实现: " + storageType.name());
        }
        return targetService;
    }

    /**
     * 解析数据库中的存储类型字符串。
     */
    public FileStorageType resolveType(String storageType) {
        if (StrUtil.isBlank(storageType)) {
            return FileStorageType.LOCAL;
        }
        return FileStorageType.fromValue(storageType);
    }

    private record RemoteFileStorageAlias(FileStorageType type, FileStorageService delegate) implements FileStorageService {
        @Override
        public FileStorageType getStorageType() { return type; }

        @Override
        public String getBucket() { return delegate.getBucket(); }

        @Override
        public com.cloudflow.auth.storage.model.StoredFileInfo store(com.cloudflow.common.core.utils.file.FileUploadUtils.ValidatedFile file) throws Exception {
            return delegate.store(file);
        }

        @Override
        public void validate(com.cloudflow.common.core.utils.file.FileUploadUtils.ValidatedFile file) { delegate.validate(file); }

        @Override
        public void delete(String filePath) { delegate.delete(filePath); }

        @Override
        public java.io.InputStream open(String filePath) throws java.io.IOException { return delegate.open(filePath); }

        @Override
        public String resolveUrl(String filePath) { return delegate.resolveUrl(filePath); }

        @Override
        public String resolveSignedUrl(String filePath, int seconds) { return delegate.resolveSignedUrl(filePath, seconds); }
    }
}
