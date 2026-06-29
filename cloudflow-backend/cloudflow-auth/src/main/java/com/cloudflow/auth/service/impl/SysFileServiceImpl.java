package com.cloudflow.auth.service.impl;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.net.URLDecoder;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.config.properties.AuthOssProperties;
import com.cloudflow.auth.config.properties.FileUploadProperties;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.enums.FileStorageType;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.service.ISysFileService;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.auth.service.ISysTenantService;
import com.cloudflow.auth.storage.FileStorageRegistry;
import com.cloudflow.auth.storage.FileStorageService;
import com.cloudflow.auth.storage.impl.OssFileStorageService;
import com.cloudflow.auth.storage.model.StoredFileInfo;
import com.cloudflow.common.config.CloudFlowConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.utils.file.FileUploadUtils;
import com.cloudflow.common.oss.core.OssClient;
import com.cloudflow.common.oss.enums.AccessPolicyType;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class SysFileServiceImpl implements ISysFileService {

    private static final String FILE_ACCESS_PATH = "/api/auth/system/file/access?path=";
    private static final String FILE_CATEGORY_IMAGE = "FILE_CATEGORY_IMAGE";
    private static final String FILE_CATEGORY_PDF = "FILE_CATEGORY_PDF";
    private static final String FILE_CATEGORY_WORD = "FILE_CATEGORY_WORD";
    private static final String FILE_CATEGORY_EXCEL = "FILE_CATEGORY_EXCEL";
    private static final String FILE_CATEGORY_PPT = "FILE_CATEGORY_PPT";
    private static final String FILE_CATEGORY_TEXT = "FILE_CATEGORY_TEXT";
    private static final String FILE_CATEGORY_ARCHIVE = "FILE_CATEGORY_ARCHIVE";
    private static final String FILE_CATEGORY_VIDEO = "FILE_CATEGORY_VIDEO";
    private static final String FILE_CATEGORY_AUDIO = "FILE_CATEGORY_AUDIO";

    private final SysFileMapper sysFileMapper;
    private final ISysTenantService sysTenantService;
    private final FileStorageRegistry storageRegistry;
    private final FileUploadProperties fileUploadProperties;
    private final AuthOssProperties authOssProperties;

    @Override
    public SysFile uploadFile(MultipartFile file) {
        try {
            FileUploadUtils.ValidatedFile validatedFile = FileUploadUtils.validate(
                file,
                fileUploadProperties.getResolvedMaxSize(),
                fileUploadProperties.getAllowedExtensionArray()
            );

            long size = validatedFile.file().getSize();
            Long tenantId = UserContext.getTenantId();

            if (tenantId != null && !sysTenantService.hasAvailableStorage(tenantId, size)) {
                sysTenantService.refreshTenantStorageSummary(tenantId);
                throw new RuntimeException("租户可用存储空间不足，无法上传当前文件");
            }

            FileStorageService storageService = storageRegistry.getCurrentService();
            StoredFileInfo storedFileInfo = storageService.store(validatedFile);

            SysFile sysFile = new SysFile();
            sysFile.setTenantId(tenantId);
            sysFile.setFileName(validatedFile.originalFileName());
            sysFile.setFilePath(storedFileInfo.getFilePath());
            sysFile.setUrl(storedFileInfo.getPersistedUrl());
            sysFile.setStorageType(storageService.getStorageType().name());
            sysFile.setFileSize(size);
            sysFile.setFileType(validatedFile.extension());
            sysFile.setCreateTime(LocalDateTime.now());
            sysFile.setCreateBy(UserContext.getUserName());
            sysFile.setDeleted(0);

            sysFileMapper.insert(sysFile);

            if (tenantId != null) {
                sysTenantService.refreshTenantStorageSummary(tenantId);
            }

            fillAccessibleUrl(sysFile);
            log.info("文件上传成功: {}, 大小: {}字节, 租户ID: {}, 存储类型: {}",
                validatedFile.originalFileName(), size, tenantId, sysFile.getStorageType());
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
            applyFileTypeFilter(wrapper, sysFile.getFileType());
        }

        wrapper.eq(SysFile::getDeleted, "0");
        wrapper.orderByDesc(SysFile::getCreateTime);

        Page<SysFile> result = sysFileMapper.selectPage(page, wrapper);
        fillAccessibleUrl(result.getRecords());
        return new PageResult<>(result.getRecords(), result.getTotal(), result.getCurrent(), result.getSize());
    }

    private void applyFileTypeFilter(LambdaQueryWrapper<SysFile> wrapper, String fileType) {
        String normalizedType = StrUtil.blankToDefault(fileType, "").trim();
        List<String> aliases = resolveFileTypeAliases(normalizedType);
        List<String> prefixes = resolveFileTypePrefixes(normalizedType);

        if (aliases.isEmpty() && prefixes.isEmpty()) {
            wrapper.eq(SysFile::getFileType, fileType);
            return;
        }

        wrapper.and(group -> {
            if (!aliases.isEmpty()) {
                group.in(SysFile::getFileType, aliases);
            }
            for (int index = 0; index < prefixes.size(); index++) {
                if (!aliases.isEmpty() || index > 0) {
                    group.or();
                }
                group.likeRight(SysFile::getFileType, prefixes.get(index));
            }
        });
    }

    private List<String> resolveFileTypeAliases(String category) {
        return switch (category) {
            case FILE_CATEGORY_IMAGE -> List.of("jpg", "jpeg", "png", "gif", "bmp", "webp", "svg");
            case FILE_CATEGORY_PDF -> List.of("pdf", "application/pdf");
            case FILE_CATEGORY_WORD -> List.of(
                    "doc", "docx", "application/msword", "application/doc", "application/docx",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            );
            case FILE_CATEGORY_EXCEL -> List.of(
                    "xls", "xlsx", "csv", "application/vnd.ms-excel", "application/xls",
                    "application/xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            );
            case FILE_CATEGORY_PPT -> List.of(
                    "ppt", "pptx", "application/vnd.ms-powerpoint", "application/ppt", "application/pptx",
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            );
            case FILE_CATEGORY_TEXT -> List.of(
                    "txt", "md", "html", "htm", "json", "xml", "application/json", "application/xml"
            );
            case FILE_CATEGORY_ARCHIVE -> List.of(
                    "zip", "rar", "7z", "tar", "gz", "bz2", "application/zip",
                    "application/x-zip-compressed", "application/x-rar-compressed",
                    "application/x-7z-compressed", "application/gzip", "application/x-tar",
                    "application/x-bzip2"
            );
            case FILE_CATEGORY_VIDEO -> List.of("mp4", "avi", "rmvb", "mov", "webm");
            case FILE_CATEGORY_AUDIO -> List.of("mp3", "wav", "aac", "flac");
            default -> List.of();
        };
    }

    private List<String> resolveFileTypePrefixes(String category) {
        return switch (category) {
            case FILE_CATEGORY_IMAGE -> List.of("image/");
            case FILE_CATEGORY_TEXT -> List.of("text/");
            case FILE_CATEGORY_VIDEO -> List.of("video/");
            case FILE_CATEGORY_AUDIO -> List.of("audio/");
            default -> List.of();
        };
    }

    @Override
    @Audit(name = "删除文件", highRisk = true)
    public void deleteFileByIds(Long[] fileIds) {
        for (Long id : fileIds) {
            SysFile existingFile = sysFileMapper.selectById(id);
            if (existingFile == null || !Integer.valueOf(0).equals(existingFile.getDeleted())) {
                continue;
            }

            FileStorageType storageType = storageRegistry.resolveType(existingFile.getStorageType());
            FileStorageService storageService = storageRegistry.getService(storageType);
            storageService.delete(existingFile.getFilePath());

            SysFile updateFile = new SysFile();
            updateFile.setFileId(id);
            updateFile.setDeleted(1);
            sysFileMapper.updateById(updateFile);

            if (existingFile.getTenantId() != null) {
                sysTenantService.refreshTenantStorageSummary(existingFile.getTenantId());
                log.info("文件删除后刷新租户存储: tenantId={}, fileId={}, storageType={}", existingFile.getTenantId(), id, storageType.name());
            }
        }
    }

    @Override
    public void accessFile(String reference, HttpServletResponse response) {
        SysFile sysFile = requireAccessibleFile(reference);
        FileStorageType storageType = storageRegistry.resolveType(sysFile.getStorageType());
        if (storageType == FileStorageType.LOCAL) {
            writeLocalFile(sysFile, response);
            return;
        }
        redirectToRemoteFile(sysFile, response);
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
        if (StrUtil.isBlank(file.getFileName())) {
            file.setFileName(extractFileName(file.getFilePath()));
        }
        String normalizedPath = normalizeFileReference(file.getUrl(), file.getFilePath());
        file.setFilePath(normalizedPath);
        file.setUrl(buildAccessUrl(normalizedPath));
    }

    private SysFile requireAccessibleFile(String reference) {
        String normalizedPath = normalizeReference(reference);
        if (StrUtil.isBlank(normalizedPath)) {
            throw new IllegalArgumentException("文件标识不能为空");
        }
        SysFile sysFile = sysFileMapper.selectPage(new Page<>(1, 1, false), new LambdaQueryWrapper<SysFile>()
                .eq(SysFile::getDeleted, 0)
                .eq(SysFile::getFilePath, normalizedPath))
                .getRecords().stream().findFirst().orElse(null);
        if (sysFile == null) {
            String normalizedUrl = removeQuery(normalizedPath);
            sysFile = sysFileMapper.selectPage(new Page<>(1, 1, false), new LambdaQueryWrapper<SysFile>()
                    .eq(SysFile::getDeleted, 0)
                    .eq(SysFile::getUrl, normalizedUrl))
                    .getRecords().stream().findFirst().orElse(null);
        }
        if (sysFile == null) {
            throw new IllegalArgumentException("文件不存在");
        }
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && sysFile.getTenantId() != null && !currentTenantId.equals(sysFile.getTenantId())) {
            throw new IllegalArgumentException("无权访问该文件");
        }
        sysFile.setFilePath(normalizeFileReference(sysFile.getUrl(), sysFile.getFilePath()));
        return sysFile;
    }

    private void redirectToRemoteFile(SysFile sysFile, HttpServletResponse response) {
        try {
            OssClient client = buildOssClient();
            String targetUrl;
            if (client.getAccessPolicy() == AccessPolicyType.PRIVATE) {
                targetUrl = client.getPresignedUrl(sysFile.getFilePath(), java.time.Duration.ofMinutes(30));
            } else {
                targetUrl = client.getUrl() + "/" + sysFile.getFilePath();
            }
            response.sendRedirect(targetUrl);
        } catch (IOException ex) {
            throw new RuntimeException("文件跳转失败", ex);
        }
    }

    private void writeLocalFile(SysFile sysFile, HttpServletResponse response) {
        String relativePath = StrUtil.removePrefix(sysFile.getFilePath(), "/");
        File file = FileUtil.file(CloudFlowConfig.getProfile(), relativePath);
        if (!file.exists() || !file.isFile()) {
            throw new IllegalArgumentException("文件不存在");
        }
        String fileName = StrUtil.blankToDefault(sysFile.getFileName(), extractFileName(sysFile.getFilePath()));
        try {
            response.setContentType(resolveContentType(file, fileName));
            response.setHeader("Content-Disposition", "inline; filename*=UTF-8''" + URLEncoder.encode(fileName, StandardCharsets.UTF_8));
            response.setContentLengthLong(file.length());
            java.nio.file.Files.copy(file.toPath(), response.getOutputStream());
            response.flushBuffer();
        } catch (IOException ex) {
            throw new RuntimeException("文件读取失败", ex);
        }
    }

    private String buildAccessUrl(String filePath) {
        return FILE_ACCESS_PATH + URLEncoder.encode(filePath, StandardCharsets.UTF_8);
    }

    private String normalizeReference(String reference) {
        String normalized = StrUtil.blankToDefault(reference, "").trim();
        if (StrUtil.isBlank(normalized)) {
            return "";
        }
        if (normalized.startsWith(FILE_ACCESS_PATH)) {
            normalized = StrUtil.removePrefix(normalized, FILE_ACCESS_PATH);
        }
        if (normalized.contains("/system/file/access?path=")) {
            normalized = StrUtil.subAfter(normalized, "path=", true);
        }
        normalized = URLDecoder.decode(normalized, StandardCharsets.UTF_8);
        return normalizeFileReference(normalized, normalized);
    }

    private String normalizeFileReference(String preferredValue, String fallbackValue) {
        String candidate = StrUtil.blankToDefault(preferredValue, StrUtil.blankToDefault(fallbackValue, "")).trim();
        if (StrUtil.isBlank(candidate)) {
            return "";
        }
        if (candidate.contains("/system/file/access?path=")) {
            return normalizeReference(candidate);
        }
        if (candidate.startsWith("/upload/")) {
            return removeQuery(candidate);
        }
        if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
            String candidateWithoutQuery = removeQuery(candidate);
            String ossBaseUrl = getOssBaseUrl();
            if (StrUtil.isNotBlank(ossBaseUrl) && candidateWithoutQuery.startsWith(ossBaseUrl + "/")) {
                return candidateWithoutQuery.substring((ossBaseUrl + "/").length());
            }
            if (StrUtil.isNotBlank(fallbackValue) && !candidate.equals(fallbackValue)) {
                return normalizeFileReference(fallbackValue, "");
            }
            return candidateWithoutQuery;
        }
        return removeQuery(candidate);
    }

    private String removeQuery(String value) {
        String normalized = StrUtil.blankToDefault(value, "");
        int queryIndex = normalized.indexOf('?');
        if (queryIndex >= 0) {
            normalized = normalized.substring(0, queryIndex);
        }
        int fragmentIndex = normalized.indexOf('#');
        if (fragmentIndex >= 0) {
            normalized = normalized.substring(0, fragmentIndex);
        }
        return normalized;
    }

    private String getOssBaseUrl() {
        if (!Boolean.TRUE.equals(authOssProperties.getEnabled())) {
            return "";
        }
        try {
            return buildOssClient().getUrl();
        } catch (Exception ex) {
            log.warn("解析 OSS 基础地址失败: {}", ex.getMessage());
            return "";
        }
    }

    private OssClient buildOssClient() {
        return ((OssFileStorageService) storageRegistry.getService(FileStorageType.OSS)).getClient();
    }

    private String resolveContentType(File file, String fileName) {
        try {
            String contentType = java.nio.file.Files.probeContentType(file.toPath());
            if (StrUtil.isNotBlank(contentType)) {
                return contentType;
            }
        } catch (IOException ignored) {
        }
        String contentType = java.net.URLConnection.guessContentTypeFromName(fileName);
        return StrUtil.blankToDefault(contentType, "application/octet-stream");
    }

    private String extractFileName(String filePath) {
        String normalized = StrUtil.blankToDefault(filePath, "");
        String fileName = StrUtil.subAfter(normalized, '/', true);
        fileName = StrUtil.blankToDefault(fileName, normalized);
        int underscoreIndex = fileName.lastIndexOf('_');
        int dotIndex = fileName.lastIndexOf('.');
        if (underscoreIndex > 0 && dotIndex > underscoreIndex) {
            return fileName.substring(0, underscoreIndex) + fileName.substring(dotIndex);
        }
        return fileName;
    }
}
