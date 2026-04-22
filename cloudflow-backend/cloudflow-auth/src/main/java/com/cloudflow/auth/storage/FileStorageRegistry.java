package com.cloudflow.auth.storage;

import cn.hutool.core.util.StrUtil;
import com.cloudflow.auth.config.properties.FileStorageProperties;
import com.cloudflow.auth.enums.FileStorageType;
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

    /**
     * 获取当前启用的存储服务。
     */
    public FileStorageService getCurrentService() {
        return getService(fileStorageProperties.getResolvedType());
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
}
