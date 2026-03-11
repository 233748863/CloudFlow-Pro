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
 * ???????????
 * <p>
 * ???
 * - ??????? LOCAL ????/????????????
 * - ????? storageType=OSS ????????????? OSS ???
 */
@Component
@RequiredArgsConstructor
public class FileStorageRegistry {

    private final List<FileStorageService> storageServices;
    private final FileStorageProperties fileStorageProperties;

    /**
     * ??????????????
     */
    public FileStorageService getCurrentService() {
        return getService(fileStorageProperties.getResolvedType());
    }

    /**
     * ????????????
     */
    public FileStorageService getService(FileStorageType storageType) {
        Map<FileStorageType, FileStorageService> serviceMap = new EnumMap<>(FileStorageType.class);
        for (FileStorageService storageService : storageServices) {
            serviceMap.put(storageService.getStorageType(), storageService);
        }
        FileStorageService targetService = serviceMap.get(storageType);
        if (targetService == null) {
            throw new IllegalStateException("???????: " + storageType.name());
        }
        return targetService;
    }

    /**
     * ?????????????????
     */
    public FileStorageType resolveType(String storageType) {
        if (StrUtil.isBlank(storageType)) {
            return FileStorageType.LOCAL;
        }
        return FileStorageType.fromValue(storageType);
    }
}
