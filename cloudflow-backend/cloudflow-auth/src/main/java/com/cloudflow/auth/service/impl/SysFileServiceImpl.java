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
import com.cloudflow.auth.service.SysFileConfigService;
import com.cloudflow.auth.storage.FileStorageRules;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.auth.storage.FileStorageRegistry;
import com.cloudflow.auth.storage.FileStorageService;
import com.cloudflow.auth.storage.impl.OssFileStorageService;
import com.cloudflow.auth.storage.model.StoredFileInfo;
import com.cloudflow.common.config.CloudFlowConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.file.FileUploadUtils;
import com.cloudflow.common.oss.core.OssClient;
import com.cloudflow.common.oss.enums.AccessPolicyType;
import com.cloudflow.common.security.portal.PortalContext;
import com.cloudflow.common.security.portal.PortalIdentity;
import com.cloudflow.common.tenant.quota.TenantQuotaService;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.HexFormat;
import java.security.MessageDigest;
import java.io.InputStream;

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
    private static final List<String> BUSINESS_PRIVATE_TYPES = List.of("HR_GRIEVANCE", "HR_GRIEVANCE_EVIDENCE", "HR_LEAVE_PROOF", "HR_TAX_PROOF", "HR_ADVANCE_PROOF", "HR_REFERRAL_RESUME", "HR_EXIT_INTERVIEW", "HR_TRAINING_AGREEMENT", "HR_SEVERANCE_POLICY", "HR_SETTLEMENT_PROOF", "HR_ATTENDANCE_PHOTO", "OA_RFQ_QUOTATION", "OA_RFQ_INVITATION", "OA_CONTRACT_EVIDENCE", "OA_CONTRACT_SIGNED", "CRM_EMAIL_ATTACHMENT");

    private final SysFileMapper sysFileMapper;
    private final FileStorageRegistry storageRegistry;
    private final FileUploadProperties fileUploadProperties;
    private final AuthOssProperties authOssProperties;
    private final SysFileConfigService fileConfigurations;
    private final TenantQuotaService tenantQuotas;
    private final com.cloudflow.auth.portal.FinanceUploadAuthorization financeUploads;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public SysFile uploadFile(MultipartFile file) {
        return storeFile(file, null, null, null);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "移除打印模板旧附件", highRisk = true)
    public void removePrintTemplateFile(Long templateId, Long fileId) {
        Long tenantId = requireCurrentTenantId();
        if (UserContext.getUserId() == null || templateId == null || templateId <= 0 || fileId == null || fileId <= 0) {
            throw new ServiceException("打印模板附件上下文无效", 403);
        }
        fileConfigurations.lockTenant(tenantId);
        SysFile file = sysFileMapper.selectOne(new LambdaQueryWrapper<SysFile>()
                .eq(SysFile::getFileId, fileId).eq(SysFile::getTenantId, tenantId).eq(SysFile::getDeleted, 0)
                .eq(SysFile::getBizType, "PRINT_TEMPLATE").eq(SysFile::getBizId, templateId.toString())
                .eq(SysFile::getAccessType, "PRIVATE"));
        if (file == null) throw new ServiceException("打印模板附件不存在或无权移除", 403);
        deleteStoredFile(file, tenantId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "客户门户上传私有附件")
    public SysFile uploadPortalFile(MultipartFile file, String requestKey) {
        PortalIdentity identity = portalIdentity();
        portalRequestKey(requestKey);
        fileConfigurations.lockTenant(identity.tenantId());
        try {
            FileUploadUtils.ValidatedFile validated = FileUploadUtils.validate(file,
                    fileUploadProperties.getResolvedMaxSize(), fileUploadProperties.getAllowedExtensionArray());
            SysFile existing = sysFileMapper.portalUpload(identity.tenantId(), identity.portalUserId(), requestKey);
            if (existing != null) {
                if (!"PORTAL_TICKET_UPLOAD".equals(existing.getBizType()) || !Integer.valueOf(0).equals(existing.getDeleted())
                        || !"PRIVATE".equals(existing.getAccessType()) || !Objects.equals(existing.getFileHash(), hash(file))
                        || !Objects.equals(existing.getFileSize(), file.getSize())
                        || !Objects.equals(existing.getFileName(), validated.originalFileName())
                        || !Objects.equals(existing.getFileType(), validated.extension())) {
                    throw new ServiceException("该上传请求已使用或文件状态已变化，请先核对原附件", 409);
                }
                return existing;
            }
            return storeFile(file, "PORTAL_TICKET_UPLOAD", requestKey, "portal-upload:" + requestKey, identity.portalUserId());
        } catch (RuntimeException failure) { throw failure; }
        catch (Exception failure) { throw new ServiceException("附件内容或存储配置不可用，上传未完成", 400); }
    }

    @Override
    public SysFile portalUpload(String requestKey) {
        PortalIdentity identity = portalIdentity();
        portalRequestKey(requestKey);
        SysFile file = sysFileMapper.portalUpload(identity.tenantId(), identity.portalUserId(), requestKey);
        if (file == null || !Integer.valueOf(0).equals(file.getDeleted()) || !"PRIVATE".equals(file.getAccessType())
                || !"PORTAL_TICKET_UPLOAD".equals(file.getBizType())) throw new ServiceException("未找到当前账号的待提交附件", 404);
        return file;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "移除客户门户临时附件", highRisk = true)
    public void removePortalUpload(Long fileId) {
        PortalIdentity identity = portalIdentity();
        fileConfigurations.lockTenant(identity.tenantId());
        SysFile file = fileId == null ? null : sysFileMapper.lockPortalFile(identity.tenantId(), fileId);
        if (file == null || !Integer.valueOf(0).equals(file.getDeleted()) || !"PRIVATE".equals(file.getAccessType())
                || !Objects.equals(identity.portalUserId(), file.getPortalOwnerId()) || !"PORTAL_TICKET_UPLOAD".equals(file.getBizType())) {
            throw new ServiceException("附件不存在、已关联工单或无权移除", 404);
        }
        deleteStoredFile(file, identity.tenantId());
    }

    @Override
    public void copyPortalTicketFile(Long ticketId, Long fileId, HttpServletResponse response) {
        SysFile file = ticketId == null || fileId == null ? null
                : sysFileMapper.portalTicketFile(requireCurrentTenantId(), ticketId, fileId);
        if (file == null) throw new ServiceException("客户工单附件不存在或无权访问", 404);
        response.setContentType("application/octet-stream");
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("Content-Disposition", org.springframework.http.ContentDisposition.attachment()
                .filename(file.getFileName(), StandardCharsets.UTF_8).build().toString());
        try (InputStream stream = storageRegistry.getForFile(file).open(file.getFilePath())) {
            stream.transferTo(response.getOutputStream());
        } catch (IOException | IllegalStateException failure) { throw new ServiceException("客户工单附件暂不可用", 503); }
    }

    private PortalIdentity portalIdentity() {
        PortalIdentity identity = PortalContext.require();
        if (UserContext.getUserId() != null || !Objects.equals(identity.tenantId(), requireCurrentTenantId())
                || !("portal:" + identity.portalUserId()).equals(UserContext.getUserName())) {
            throw new ServiceException("门户上传身份无效", 403);
        }
        return identity;
    }

    private static void portalRequestKey(String value) {
        if (value == null || !value.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) {
            throw new ServiceException("附件上传请求标识无效", 400);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "上传流程私有附件")
    public SysFile uploadWorkflowFormFile(MultipartFile file, String definitionId, String instanceId, String fieldPath) {
        if (definitionId == null || !definitionId.matches("[A-Za-z0-9_-]{1,64}")
                || instanceId != null && !instanceId.matches("[A-Za-z0-9_-]{1,64}")
                || fieldPath == null || fieldPath.length() > 100 || !fieldPath.matches("[A-Za-z_][A-Za-z0-9_]*(\\.[A-Za-z_][A-Za-z0-9_]*)?")) {
            throw new ServiceException("流程附件上下文无效", 400);
        }
        if (UserContext.getUserId() == null || StrUtil.isBlank(UserContext.getUserName())) throw new ServiceException("缺少附件上传身份", 403);
        java.util.Map<String, Object> scope = new java.util.LinkedHashMap<>();
        scope.put("d", definitionId); scope.put("f", fieldPath); scope.put("i", instanceId);
        try {
            return storeFile(file, "WORKFLOW_FORM", instanceId == null ? definitionId : instanceId,
                    new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(scope));
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) { throw new ServiceException("流程附件上下文保存失败"); }
    }

    @Override
    public void copyWorkflowFormFile(Long fileId, HttpServletResponse response) {
        SysFile file = sysFileMapper.selectById(fileId);
        if (file == null || !Objects.equals(file.getTenantId(), requireCurrentTenantId()) || !Integer.valueOf(0).equals(file.getDeleted())
                || !"WORKFLOW_FORM".equals(file.getBizType()) || !"PRIVATE".equals(file.getAccessType())) throw new ServiceException("流程附件不存在或无权访问", 403);
        response.setContentType("application/octet-stream");
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("Content-Disposition", org.springframework.http.ContentDisposition.attachment().filename(file.getFileName(), StandardCharsets.UTF_8).build().toString());
        try (InputStream stream = storageRegistry.getForFile(file).open(file.getFilePath())) {
            stream.transferTo(response.getOutputStream());
        } catch (IOException exception) { throw new ServiceException("流程附件读取失败"); }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "上传会议室私有照片")
    public SysFile uploadMeetingRoomPhoto(MultipartFile file, Long roomId) {
        if (roomId == null || roomId <= 0 || UserContext.getUserId() == null || StrUtil.isBlank(UserContext.getUserName())) {
            throw new ServiceException("会议室照片上传上下文无效", 403);
        }
        try { FileUploadUtils.validate(file, fileUploadProperties.getResolvedMaxSize(), new String[]{"png", "jpg", "jpeg"}); }
        catch (Exception failure) { throw new ServiceException("照片须为内容真实的PNG或JPEG，且大小符合文件上传配置", 400); }
        return storeFile(file, "OA_MEETING_ROOM", roomId.toString(), null);
    }

    @Override
    public void copyMeetingRoomPhoto(Long roomId, Long fileId, HttpServletResponse response) {
        SysFile file = fileId == null ? null : sysFileMapper.selectById(fileId);
        if (roomId == null || file == null || !Objects.equals(file.getTenantId(), requireCurrentTenantId())
                || !Integer.valueOf(0).equals(file.getDeleted()) || !"OA_MEETING_ROOM".equals(file.getBizType())
                || !roomId.toString().equals(file.getBizId()) || !"PRIVATE".equals(file.getAccessType())
                || !List.of("png", "jpg", "jpeg").contains(file.getFileType())) throw new ServiceException("会议室照片不存在或无权访问", 404);
        response.setContentType("png".equals(file.getFileType()) ? "image/png" : "image/jpeg");
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "no-referrer");
        try (InputStream stream = storageRegistry.getForFile(file).open(file.getFilePath())) {
            stream.transferTo(response.getOutputStream());
        } catch (IOException failure) { throw new ServiceException("会议室照片读取失败", 503); }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "上传财务公开私有票据")
    public SysFile uploadFinanceFile(MultipartFile file, String kind, Long recordId) {
        financeUploads.require(kind, recordId);
        return storeFile(file, "PORTAL_FINANCE_" + kind, recordId.toString(), null);
    }

    private SysFile storeFile(MultipartFile file, String businessType, String businessId, String remark) {
        return storeFile(file, businessType, businessId, remark, null);
    }

    private SysFile storeFile(MultipartFile file, String businessType, String businessId, String remark, Long portalOwnerId) {
        try {
            FileUploadUtils.ValidatedFile validatedFile = FileUploadUtils.validate(
                file,
                fileUploadProperties.getResolvedMaxSize(),
                fileUploadProperties.getAllowedExtensionArray()
            );

            long size = validatedFile.file().getSize();
            Long tenantId = requireCurrentTenantId();
            String hash = hash(file);
            fileConfigurations.lockTenant(tenantId);
            FileStorageService storageService = storageRegistry.getCurrentService();
            storageService.validate(validatedFile);
            Long configId = storageService.getConfiguration() == null ? null : storageService.getConfiguration().getConfigId();
            Long reusableId = sysFileMapper.lockReusableId(tenantId, hash, size, storageService.getStorageType().name(), configId);
            SysFile source = reusableId == null ? null : sysFileMapper.lockPortalFile(tenantId, reusableId);
            tenantQuotas.requireStorageCapacity(tenantId, source == null ? size : 0);
            StoredFileInfo storedFileInfo = source == null ? storageService.store(validatedFile)
                    : StoredFileInfo.builder().filePath(source.getFilePath()).persistedUrl(source.getFilePath()).build();
            if (source == null) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCompletion(int status) {
                        if (status != STATUS_COMMITTED) safeDelete(storageService, storedFileInfo.getFilePath(), tenantId);
                    }
                });
            }

            SysFile sysFile = new SysFile();
            sysFile.setTenantId(tenantId);
            sysFile.setFileName(validatedFile.originalFileName());
            sysFile.setFilePath(storedFileInfo.getFilePath());
            sysFile.setUrl("");
            sysFile.setStorageType(storageService.getStorageType().name());
            sysFile.setConfigId(configId);
            sysFile.setFileHash(hash);
            sysFile.setBucket(storageService.getBucket());
            sysFile.setObjectKey(storageService.getStorageType() == FileStorageType.LOCAL ? null : storedFileInfo.getFilePath());
            sysFile.setAccessType("PRIVATE");
            sysFile.setBizType(businessType);
            sysFile.setBizId(businessId);
            sysFile.setPortalOwnerId(portalOwnerId);
            sysFile.setRemark(remark);
            sysFile.setRefCount(1);
            sysFile.setFileSize(size);
            sysFile.setFileType(validatedFile.extension());
            sysFile.setCreateTime(LocalDateTime.now());
            sysFile.setCreateBy(UserContext.getUserName());
            sysFile.setDeleted(0);

            if (sysFileMapper.insert(sysFile) != 1) throw new ServiceException("文件记录保存失败");
            int references = Math.toIntExact(sysFileMapper.countReferences(sysFile));
            sysFileMapper.updateReferenceCount(sysFile, references);
            sysFile.setRefCount(references);

            if (tenantId != null) {
                tenantQuotas.refreshStorage(tenantId);
            }

            fillAccessibleUrl(sysFile);
            log.info("文件上传成功: fileId={}, 大小: {}字节, 租户ID: {}, 存储类型: {}",
                sysFile.getFileId(), size, tenantId, sysFile.getStorageType());
            return sysFile;
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new ServiceException("文件上传失败，请检查文件内容与存储配置");
        }
    }

    @Override
    public PageResult<SysFile> selectFileList(SysFile sysFile, PageQuery pageQuery) {
        Long tenantId = requireCurrentTenantId();
        Page<SysFile> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<SysFile> wrapper = new LambdaQueryWrapper<>();

        if (sysFile != null && StrUtil.isNotBlank(sysFile.getFileName())) {
            wrapper.like(SysFile::getFileName, sysFile.getFileName());
        }
        if (sysFile != null && StrUtil.isNotBlank(sysFile.getFileType())) {
            applyFileTypeFilter(wrapper, sysFile.getFileType());
        }

        wrapper.eq(SysFile::getDeleted, "0");
        wrapper.eq(SysFile::getTenantId, tenantId);
        wrapper.isNull(SysFile::getPortalOwnerId);
        wrapper.eq(SysFile::getCreateBy, UserContext.getUserName());
        wrapper.and(filter -> filter.isNull(SysFile::getBizType).or().eq(SysFile::getBizType, ""));
        wrapper.and(filter -> filter.isNull(SysFile::getFileType).or().notIn(SysFile::getFileType, BUSINESS_PRIVATE_TYPES));
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
    @Transactional(rollbackFor = Exception.class)
    public void deleteFileByIds(Long[] fileIds) {
        Long tenantId = requireCurrentTenantId();
        if (fileIds == null || fileIds.length == 0) throw new ServiceException("请选择文件");
        fileConfigurations.lockTenant(tenantId);
        for (Long id : fileIds) {
            SysFile existingFile = sysFileMapper.selectOne(new LambdaQueryWrapper<SysFile>()
                    .eq(SysFile::getFileId, id)
                    .eq(SysFile::getTenantId, tenantId)
                    .eq(SysFile::getDeleted, 0));
            if (existingFile == null || !Integer.valueOf(0).equals(existingFile.getDeleted())) {
                throw new ServiceException("文件不存在或无权删除", 403);
            }
            assertPublicFile(existingFile);
            deleteStoredFile(existingFile, tenantId);
        }
    }

    private void deleteStoredFile(SysFile file, Long tenantId) {
        FileStorageType storageType = storageRegistry.resolveType(file.getStorageType());
        FileStorageService storageService = storageRegistry.getForFile(file);
        if (sysFileMapper.deleteById(file.getFileId()) != 1) throw new ServiceException("文件删除失败");
        int references = Math.toIntExact(sysFileMapper.countReferences(file));
        sysFileMapper.updateReferenceCount(file, references);
        if (references == 0) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() { safeDelete(storageService, file.getFilePath(), tenantId); }
            });
        }
        tenantQuotas.refreshStorage(tenantId);
        log.info("文件删除后刷新租户存储: tenantId={}, fileId={}, storageType={}", tenantId, file.getFileId(), storageType.name());
    }

    @Override
    public void accessFile(String reference, HttpServletResponse response) {
        SysFile sysFile = requireAccessibleFile(reference);
        writeFile(sysFile, response);
    }

    @Override
    public void accessFileById(Long fileId, HttpServletResponse response) {
        writeFile(getPublicPreviewFile(fileId, null), response);
    }

    @Override
    public SysFile getPublicPreviewFile(Long fileId, String reference) {
        if (fileId == null) return requireAccessibleFile(reference);
        SysFile file = sysFileMapper.selectOne(new LambdaQueryWrapper<SysFile>()
                .eq(SysFile::getFileId, fileId).eq(SysFile::getTenantId, requireCurrentTenantId()).eq(SysFile::getDeleted, 0));
        if (file == null) throw new ServiceException("文件不存在或无权访问", 403);
        assertPublicFile(file);
        return file;
    }

    private void writeFile(SysFile sysFile, HttpServletResponse response) {
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "no-referrer");
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
        file.setUrl("/api/auth/system/file/" + file.getFileId() + "/content");
    }

    private SysFile requireAccessibleFile(String reference) {
        Long currentTenantId = requireCurrentTenantId();
        String normalizedPath = normalizeReference(reference);
        if (StrUtil.isBlank(normalizedPath)) {
            throw new ServiceException("文件标识不能为空", 400);
        }
        SysFile sysFile = sysFileMapper.selectOwnedUnboundReference(currentTenantId,
                UserContext.getUserName(), normalizedPath, BUSINESS_PRIVATE_TYPES);
        if (sysFile == null) {
            throw new ServiceException("文件不存在或无权访问", 403);
        }
        if (!currentTenantId.equals(sysFile.getTenantId())) {
            throw new ServiceException("文件不存在或无权访问", 403);
        }
        assertPublicFile(sysFile);
        sysFile.setFilePath(normalizeFileReference(sysFile.getUrl(), sysFile.getFilePath()));
        return sysFile;
    }

    private void assertPublicFile(SysFile file) {
        if (file.getPortalOwnerId() != null || BUSINESS_PRIVATE_TYPES.contains(String.valueOf(file.getFileType())) || StrUtil.isNotBlank(file.getBizType())) {
            throw new ServiceException("该文件须从对应业务入口访问", 403);
        }
        if (StrUtil.isBlank(file.getCreateBy()) || !Objects.equals(file.getCreateBy(), UserContext.getUserName())) {
            throw new ServiceException("未绑定业务的文件仅上传者本人可访问", 403);
        }
    }

    private Long requireCurrentTenantId() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) {
            throw new ServiceException("当前用户未绑定租户", 403);
        }
        return tenantId;
    }

    private void redirectToRemoteFile(SysFile sysFile, HttpServletResponse response) {
        try {
            String targetUrl = storageRegistry.getForFile(sysFile).resolveUrl(sysFile.getFilePath());
            response.sendRedirect(targetUrl);
        } catch (IOException ex) {
            throw new RuntimeException("文件跳转失败", ex);
        }
    }

    private void writeLocalFile(SysFile sysFile, HttpServletResponse response) {
        File file = FileStorageRules.localFile(sysFile.getFilePath()).toFile();
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

    private String hash(MultipartFile file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = file.getInputStream()) {
            byte[] buffer = new byte[16384];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    private void safeDelete(FileStorageService service, String path, Long tenantId) {
        try {
            service.delete(path);
        } catch (RuntimeException exception) {
            log.error("文件物理清理失败，需要核对存储，tenantId={}", tenantId);
        }
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
