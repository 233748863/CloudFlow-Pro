package com.cloudflow.auth.config;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.config.properties.AuthOssProperties;
import com.cloudflow.auth.config.properties.FileStorageProperties;
import com.cloudflow.auth.domain.SysFileConfig;
import com.cloudflow.auth.enums.FileStorageType;
import com.cloudflow.auth.mapper.SysFileConfigMapper;
import com.cloudflow.auth.service.SysFileConfigService;
import com.cloudflow.auth.storage.impl.OssFileStorageService;
import com.cloudflow.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class FileStorageStartupValidator implements ApplicationRunner {
    private final AuthOssProperties properties;
    private final FileStorageProperties storageProperties;
    private final OssFileStorageService legacyStorage;
    private final SysFileConfigMapper mapper;
    private final SysFileConfigService configurations;

    @Override
    public void run(ApplicationArguments arguments) {
        FileStorageType type = storageProperties.getResolvedType();
        if (Boolean.TRUE.equals(properties.getEnabled())) legacyStorage.validateRequiredConfig();
        if (type != FileStorageType.LOCAL && !Boolean.TRUE.equals(properties.getEnabled())) {
            throw new IllegalStateException("默认对象存储未启用，禁止启动");
        }
        boolean skipped = Boolean.TRUE.equals(TenantContext.getTenantSkip());
        try {
            TenantContext.setTenantSkip();
            for (SysFileConfig config : mapper.selectList(new LambdaQueryWrapper<SysFileConfig>()
                    .eq(SysFileConfig::getDeleted, 0).eq(SysFileConfig::getStatus, "ENABLED"))) {
                configurations.storage(config);
            }
        } finally {
            if (!skipped) TenantContext.clearTenantSkip();
        }
    }
}
