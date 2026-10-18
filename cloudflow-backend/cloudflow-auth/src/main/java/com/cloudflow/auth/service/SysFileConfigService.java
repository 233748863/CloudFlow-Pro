package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.domain.SysFileConfig;
import com.cloudflow.auth.enums.FileStorageType;
import com.cloudflow.auth.mapper.SysFileConfigMapper;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.storage.FileStorageRules;
import com.cloudflow.auth.storage.FileStorageSecretCipher;
import com.cloudflow.auth.storage.impl.ConfiguredFileStorageService;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.oss.properties.OssProperties;
import com.cloudflow.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.util.List;
import java.util.Objects;
import java.util.function.Supplier;

@Service
@RequiredArgsConstructor
public class SysFileConfigService {
    private final SysFileConfigMapper mapper;
    private final SysFileMapper fileMapper;
    private final FileStorageSecretCipher cipher;

    public PageResult<SysFileConfig> page(PageQuery query) {
        Page<SysFileConfig> result = mapper.selectPage(new Page<>(query.getPageNum(), query.getPageSize()),
                new LambdaQueryWrapper<SysFileConfig>().eq(SysFileConfig::getTenantId, tenantId())
                        .eq(SysFileConfig::getDeleted, 0).orderByDesc(SysFileConfig::getMasterFlag)
                        .orderByAsc(SysFileConfig::getConfigId));
        return new PageResult<>(result.getRecords().stream().map(this::view).toList(), result.getTotal(), result.getCurrent(), result.getSize());
    }

    public SysFileConfig detail(Long configId) {
        return view(require(configId));
    }

    public SysFileConfig require(Long configId) {
        SysFileConfig config = mapper.selectOne(new LambdaQueryWrapper<SysFileConfig>()
                .eq(SysFileConfig::getConfigId, configId).eq(SysFileConfig::getTenantId, tenantId())
                .eq(SysFileConfig::getDeleted, 0));
        if (config == null) throw new ServiceException("存储配置不存在或无权访问", 403);
        return config;
    }

    public SysFileConfig current() {
        Long tenantId = tenantId();
        List<SysFileConfig> matches = withoutTenant(() -> mapper.selectList(new LambdaQueryWrapper<SysFileConfig>()
                .in(SysFileConfig::getTenantId, List.of(tenantId, 0L)).eq(SysFileConfig::getDeleted, 0)
                .eq(SysFileConfig::getMasterFlag, 1).eq(SysFileConfig::getStatus, "ENABLED")));
        List<SysFileConfig> tenantConfigs = matches.stream().filter(config -> tenantId.equals(config.getTenantId())).toList();
        List<SysFileConfig> platformConfigs = matches.stream().filter(config -> Long.valueOf(0).equals(config.getTenantId())).toList();
        if (tenantConfigs.size() > 1 || platformConfigs.size() > 1) throw new ServiceException("同一租户存在多个主用存储配置，请修复配置");
        if (!tenantConfigs.isEmpty()) return tenantConfigs.get(0);
        return platformConfigs.isEmpty() ? null : platformConfigs.get(0);
    }

    public SysFileConfig requireForStorage(Long configId) {
        Long tenantId = tenantId();
        SysFileConfig config = withoutTenant(() -> mapper.selectOne(new LambdaQueryWrapper<SysFileConfig>()
                .eq(SysFileConfig::getConfigId, configId).in(SysFileConfig::getTenantId, List.of(tenantId, 0L))
                .eq(SysFileConfig::getDeleted, 0)));
        if (config == null) throw new ServiceException("存储配置不存在或无权访问", 403);
        return config;
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "保存文件存储配置", highRisk = true)
    public SysFileConfig save(SysFileConfig request, boolean creating) {
        Long tenantId = tenantId();
        lockTenant(tenantId);
        if (creating && request.getConfigId() != null) throw new ServiceException("新增配置不能指定主键");
        if (!creating && request.getConfigId() == null) throw new ServiceException("修改配置必须指定主键");
        SysFileConfig previous = creating ? null : require(request.getConfigId());
        if (previous != null && !Objects.equals(previous.getVersion(), request.getVersion())) {
            throw new ServiceException("配置已被修改，请刷新后重试", 409);
        }
        SysFileConfig config = new SysFileConfig();
        config.setConfigId(creating ? null : previous.getConfigId());
        config.setTenantId(tenantId);
        config.setConfigCode(trim(request.getConfigCode()));
        config.setConfigName(trim(request.getConfigName()));
        config.setStorageType(FileStorageType.fromValue(request.getStorageType()).name());
        config.setMasterFlag(request.getMasterFlag() == null ? 0 : request.getMasterFlag());
        config.setEndpoint(trim(request.getEndpoint()));
        config.setRegion(trim(request.getRegion()));
        config.setBucket(trim(request.getBucket()));
        config.setAccessKey(trim(request.getAccessKey()));
        if (previous != null && (config.getAccessKey() == null || config.getAccessKey().startsWith("****"))) {
            config.setAccessKey(previous.getAccessKey());
        }
        config.setSecretKeyCipher(previous == null ? null : previous.getSecretKeyCipher());
        if (request.getSecretKey() != null && !request.getSecretKey().isBlank()) {
            if (request.getSecretKey().length() > 256) throw new ServiceException("SecretKey长度超出限制");
            config.setSecretKeyCipher(cipher.encrypt(request.getSecretKey()));
        }
        config.setBasePath(trim(request.getBasePath()));
        config.setDomain(trim(request.getDomain()));
        config.setMaxFileSize(request.getMaxFileSize() == null ? 52428800L : request.getMaxFileSize());
        config.setAllowedExtensions(trim(request.getAllowedExtensions()));
        config.setSignedUrlExpireSeconds(request.getSignedUrlExpireSeconds() == null ? 300 : request.getSignedUrlExpireSeconds());
        config.setAccessPolicy(request.getAccessPolicy() == null ? "0" : request.getAccessPolicy());
        config.setStatus(request.getStatus() == null ? "ENABLED" : request.getStatus());
        config.setRemark(request.getRemark());
        config.setVersion(previous == null ? 0 : previous.getVersion());
        config.setDeleted(0);
        FileStorageRules.validate(config);
        if (previous != null && referenced(previous.getConfigId()) && locationChanged(previous, config)) {
            throw new ServiceException("该配置已有文件引用，不能更改存储位置；请新增配置后切换主用");
        }
        if (previous != null && Integer.valueOf(1).equals(previous.getMasterFlag()) && config.getMasterFlag() != 1) {
            throw new ServiceException("请先将其他配置设为主用，再停用当前主用配置");
        }
        long duplicate = mapper.countCode(tenantId, config.getConfigCode(), config.getConfigId());
        if (duplicate > 0) throw new ServiceException("配置编码已使用（含已删除配置），请使用其他编码", 409);
        if (config.getMasterFlag() == 1) mapper.clearMaster(tenantId, config.getConfigId());
        int changed = creating ? mapper.insert(config) : mapper.updateById(config);
        if (changed != 1) throw new ServiceException("配置已被修改，请刷新后重试", 409);
        return view(config);
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "删除文件存储配置", highRisk = true)
    public void remove(Long configId) {
        lockTenant(tenantId());
        SysFileConfig config = require(configId);
        if (Integer.valueOf(1).equals(config.getMasterFlag()) || referenced(configId)) {
            throw new ServiceException("主用或仍有文件引用的存储配置不能删除");
        }
        if (mapper.deleteById(configId) != 1) throw new ServiceException("配置删除失败");
    }

    public ConfiguredFileStorageService storage(SysFileConfig config) {
        FileStorageRules.validate(config);
        OssProperties properties = null;
        if (FileStorageType.fromValue(config.getStorageType()) != FileStorageType.LOCAL) {
            properties = new OssProperties();
            URI endpoint = URI.create(config.getEndpoint().contains("://") ? config.getEndpoint() : "https://" + config.getEndpoint());
            properties.setEndpoint(endpoint.getRawAuthority());
            properties.setIsHttps("https".equals(endpoint.getScheme()) ? "Y" : "N");
            properties.setDomain(config.getDomain());
            properties.setRegion(config.getRegion());
            properties.setBucketName(config.getBucket());
            properties.setAccessKey(config.getAccessKey());
            properties.setSecretKey(cipher.decrypt(config.getSecretKeyCipher()));
            properties.setPrefix(config.getBasePath());
            properties.setAccessPolicy(config.getAccessPolicy());
        }
        return new ConfiguredFileStorageService(config, properties);
    }

    public void lockTenant(Long tenantId) {
        if (mapper.lockTenant(tenantId) == null) throw new ServiceException("租户不存在", 403);
    }

    private boolean referenced(Long configId) {
        return withoutTenant(() -> fileMapper.selectCount(new LambdaQueryWrapper<SysFile>()
                .eq(SysFile::getConfigId, configId).eq(SysFile::getDeleted, 0))) > 0;
    }

    private boolean locationChanged(SysFileConfig previous, SysFileConfig next) {
        return !Objects.equals(previous.getStorageType(), next.getStorageType())
                || !Objects.equals(previous.getEndpoint(), next.getEndpoint())
                || !Objects.equals(previous.getRegion(), next.getRegion())
                || !Objects.equals(previous.getBucket(), next.getBucket())
                || !Objects.equals(previous.getBasePath(), next.getBasePath());
    }

    private SysFileConfig view(SysFileConfig source) {
        SysFileConfig result = new SysFileConfig();
        BeanUtils.copyProperties(source, result);
        result.setSecretKeyCipher(null);
        result.setSecretKey(null);
        if (result.getAccessKey() != null) result.setAccessKey("****");
        return result;
    }

    private Long tenantId() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) throw new ServiceException("当前用户未绑定租户", 403);
        return tenantId;
    }

    private String trim(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private <Result> Result withoutTenant(Supplier<Result> operation) {
        boolean skipped = Boolean.TRUE.equals(TenantContext.getTenantSkip());
        try {
            TenantContext.setTenantSkip();
            return operation.get();
        } finally {
            if (!skipped) TenantContext.clearTenantSkip();
        }
    }
}
