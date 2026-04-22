package com.cloudflow.auth.service.impl;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.enums.FileStorageType;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.service.ISysFileService;
import com.cloudflow.auth.service.SysTenantService;
import com.cloudflow.auth.storage.FileStorageRegistry;
import com.cloudflow.auth.storage.FileStorageService;
import com.cloudflow.auth.storage.model.StoredFileInfo;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.utils.file.FileUploadUtils;
import com.cloudflow.common.core.utils.file.MimeTypeUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class SysFileServiceImpl implements ISysFileService {

    private final SysFileMapper sysFileMapper;
    private final SysTenantService sysTenantService;
    private final FileStorageRegistry storageRegistry;

    @Override
    public SysFile uploadFile(MultipartFile file) {
        try {
            FileUploadUtils.assertAllowed(file, MimeTypeUtils.DEFAULT_ALLOWED_EXTENSION);

            String originalFilename = file.getOriginalFilename();
            long size = file.getSize();
            Long tenantId = UserContext.getTenantId();

            if (tenantId != null && !sysTenantService.hasAvailableStorage(tenantId, size)) {
                sysTenantService.refreshTenantStorageSummary(tenantId);
                throw new RuntimeException("租户可用存储空间不足，无法上传当前文件");
            }

            // 根据当前配置自动选择本地存储或 OSS 存储实现。
            FileStorageService storageService = storageRegistry.getCurrentService();
            StoredFileInfo storedFileInfo = storageService.store(file);

            SysFile sysFile = new SysFile();
            sysFile.setTenantId(tenantId);
            sysFile.setFileName(originalFilename);
            sysFile.setFilePath(storedFileInfo.getFilePath());
            sysFile.setUrl(storedFileInfo.getPersistedUrl());
            sysFile.setStorageType(storageService.getStorageType().name());
            sysFile.setFileSize(size);
            sysFile.setFileType(FileUtil.extName(originalFilename));
            sysFile.setCreateTime(LocalDateTime.now());
            sysFile.setCreateBy(UserContext.getUserName());
            sysFile.setDelFlag("0");

            sysFileMapper.insert(sysFile);

            if (tenantId != null) {
                sysTenantService.refreshTenantStorageSummary(tenantId);
            }

            // 补齐可访问地址，前端统一读取 url 字段。
            fillAccessibleUrl(sysFile);
            log.info("文件上传成功: {}, 大小: {}字节, 租户ID: {}, 存储类型: {}", originalFilename, size, tenantId, sysFile.getStorageType());
            return sysFile;
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("文件上传失败: " + e.getMessage(), e);
        }
    }

    @Override
    public PageResult<SysFile> selectFileList(SysFile sysFile, PageQuery pageQuery) {
        Page<SysFile> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<SysFile> wrapper = new LambdaQueryWrapper<>();

        if (StrUtil.isNotBlank(sysFile.getFileName())) {
            wrapper.like(SysFile::getFileName, sysFile.getFileName());
        }
        if (StrUtil.isNotBlank(sysFile.getFileType())) {
            wrapper.eq(SysFile::getFileType, sysFile.getFileType());
        }

        wrapper.eq(SysFile::getDelFlag, "0");
        wrapper.orderByDesc(SysFile::getCreateTime);

        Page<SysFile> result = sysFileMapper.selectPage(page, wrapper);
        fillAccessibleUrl(result.getRecords());
        return new PageResult<>(result.getRecords(), result.getTotal(), result.getCurrent(), result.getSize());
    }

    @Override
    public void deleteFileByIds(Long[] fileIds) {
        for (Long id : fileIds) {
            SysFile existingFile = sysFileMapper.selectById(id);
            if (existingFile == null || !"0".equals(existingFile.getDelFlag())) {
                continue;
            }

            FileStorageType storageType = storageRegistry.resolveType(existingFile.getStorageType());
            FileStorageService storageService = storageRegistry.getService(storageType);
            // 同步删除底层存储文件，避免数据库删除后遗留脏文件。
            storageService.delete(existingFile.getFilePath());

            SysFile updateFile = new SysFile();
            updateFile.setFileId(id);
            updateFile.setDelFlag("2");
            sysFileMapper.updateById(updateFile);

            if (existingFile.getTenantId() != null) {
                sysTenantService.refreshTenantStorageSummary(existingFile.getTenantId());
                log.info("文件删除后刷新租户存储: tenantId={}, fileId={}, storageType={}", existingFile.getTenantId(), id, storageType.name());
            }
        }
    }

    private void fillAccessibleUrl(List<SysFile> files) {
        for (SysFile file : files) {
            fillAccessibleUrl(file);
        }
    }

    private void fillAccessibleUrl(SysFile file) {
        if (file == null) {
            return;
        }
        FileStorageType storageType = storageRegistry.resolveType(file.getStorageType());
        file.setStorageType(storageType.name());
        try {
            FileStorageService storageService = storageRegistry.getService(storageType);
            String accessibleUrl = storageService.resolveUrl(file.getFilePath());
            if (StrUtil.isNotBlank(accessibleUrl)) {
                file.setUrl(accessibleUrl);
            }
        } catch (Exception ex) {
            log.warn("解析文件访问地址失败: fileId={}, storageType={}, reason={}", file.getFileId(), storageType.name(), ex.getMessage());
        }
    }
}
