package com.cloudflow.crm.service.email.archive;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.quota.TenantQuotaService;
import com.cloudflow.common.message.api.MessageAttachment;
import com.cloudflow.crm.domain.CrmEmailPrivateFile;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmEmailPrivateFileMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

@Slf4j
@Service
@RequiredArgsConstructor
public class CrmEmailArchiveFiles {
    private static final String FILE_TYPE = "CRM_EMAIL_ATTACHMENT";
    private static final int MAXIMUM_BYTES = 10 * 1024 * 1024;
    private final CrmEmailPrivateFileMapper files;
    private final TenantQuotaService tenantQuotas;
    @Value("${cloudflow.crm.private-storage-dir:${user.home}/.cloudflow/crm/private}")
    private String baseDirectory;

    public record FileInfo(Long fileId, String fileName, long fileSize) { }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "上传客户邮件私有附件")
    public FileInfo upload(CrmEmailArchiveAccess.Business business, MultipartFile upload) {
        if (upload == null || upload.isEmpty() || upload.getSize() > MAXIMUM_BYTES) throw invalid();
        String name = filename(upload.getOriginalFilename());
        try {
            byte[] bytes = upload.getBytes();
            if (bytes.length == 0 || bytes.length > MAXIMUM_BYTES) throw invalid();
            contentType(name, bytes);
            tenantQuotas.requireStorageCapacity(CrmRecordSupport.tenantId(), bytes.length);
            Path root = root(true);
            Path target = root.resolve(CrmRecordSupport.tenantId() + "-" + UUID.randomUUID() + name.substring(name.lastIndexOf('.'))).normalize();
            if (!target.startsWith(root) || target.toString().length() > 255) throw invalid();
            if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("附件保存必须处于事务中");
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) try { Files.deleteIfExists(target); }
                    catch (Exception unavailable) { log.error("客户邮件附件回滚清理失败，请核查私有存储"); }
                }
            });
            Files.write(target, bytes, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
            CrmEmailPrivateFile file = new CrmEmailPrivateFile();
            file.setTenantId(CrmRecordSupport.tenantId()); file.setFileName(name); file.setFilePath(target.toString());
            file.setUrl(""); file.setStorageType("LOCAL"); file.setFileSize((long) bytes.length); file.setFileType(FILE_TYPE);
            file.setFileHash(hash(bytes)); file.setAccessType("PRIVATE"); file.setBizType(FILE_TYPE); file.setBizId(business.type() + ":" + business.id());
            file.setCreateBy(String.valueOf(CrmRecordSupport.require(UserContext.getUserId(), "上传人未登录"))); file.setCreateTime(LocalDateTime.now()); file.setDeleted(0);
            CrmRecordSupport.saved(files.insert(file));
            tenantQuotas.refreshStorage(file.getTenantId());
            return new FileInfo(file.getFileId(), name, bytes.length);
        } catch (java.io.IOException failure) { throw new IllegalStateException("客户邮件附件保存失败"); }
    }

    public List<MessageAttachment> attachments(String bizType, Long bizId, Long uploaderId, List<Long> fileIds) {
        List<Long> identifiers = fileIds == null ? List.of() : fileIds;
        if (identifiers.size() > 10 || new HashSet<>(identifiers).size() != identifiers.size() || identifiers.stream().anyMatch(identifier -> identifier == null || identifier <= 0)) throw invalid();
        List<MessageAttachment> result = new ArrayList<>();
        long total = 0;
        for (Long fileId : identifiers) {
            CrmEmailPrivateFile file = metadata(bizType, bizId, fileId);
            if (uploaderId != null && !Objects.equals(file.getCreateBy(), String.valueOf(uploaderId))) throw invalid();
            byte[] bytes = bytes(file);
            total += bytes.length;
            if (total > MAXIMUM_BYTES) throw invalid();
            result.add(new MessageAttachment(fileId, file.getFileName(), contentType(file.getFileName(), bytes), bytes));
        }
        return List.copyOf(result);
    }

    public List<FileInfo> info(String bizType, Long bizId, List<Long> fileIds) {
        return (fileIds == null ? List.<Long>of() : fileIds).stream().map(fileId -> {
            CrmEmailPrivateFile file = metadata(bizType, bizId, fileId);
            return new FileInfo(file.getFileId(), file.getFileName(), file.getFileSize());
        }).toList();
    }

    @Audit(name = "读取客户邮件私有附件")
    public ResponseEntity<byte[]> download(String bizType, Long bizId, Long fileId) {
        CrmEmailPrivateFile file = metadata(bizType, bizId, fileId);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.getFileName(), StandardCharsets.UTF_8).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store").header("X-Content-Type-Options", "nosniff").body(bytes(file));
    }

    private CrmEmailPrivateFile metadata(String bizType, Long bizId, Long fileId) {
        CrmEmailPrivateFile file = files.selectById(fileId);
        if (file == null || !Objects.equals(file.getTenantId(), CrmRecordSupport.tenantId()) || !Integer.valueOf(0).equals(file.getDeleted())
                || !FILE_TYPE.equals(file.getFileType()) || !FILE_TYPE.equals(file.getBizType()) || !"PRIVATE".equals(file.getAccessType())
                || !Objects.equals(bizType + ":" + bizId, file.getBizId()) || !"LOCAL".equals(file.getStorageType())
                || file.getFileSize() == null || file.getFileSize() <= 0 || file.getFileSize() > MAXIMUM_BYTES) throw invalid();
        filename(file.getFileName());
        return file;
    }

    private byte[] bytes(CrmEmailPrivateFile file) {
        try {
            Path root = root(false);
            Path stored = Path.of(file.getFilePath()).toAbsolutePath().normalize();
            if (!stored.startsWith(root) || Files.isSymbolicLink(stored) || !Files.isRegularFile(stored, LinkOption.NOFOLLOW_LINKS)) throw invalid();
            Path target = stored.toRealPath();
            if (!target.startsWith(root) || Files.size(target) != file.getFileSize() || Files.size(target) > MAXIMUM_BYTES) throw invalid();
            byte[] bytes;
            try (InputStream stream = Files.newInputStream(target, LinkOption.NOFOLLOW_LINKS)) { bytes = stream.readNBytes(MAXIMUM_BYTES + 1); }
            if (bytes.length != file.getFileSize() || !hash(bytes).equals(file.getFileHash())) throw invalid();
            contentType(file.getFileName(), bytes);
            return bytes;
        } catch (java.io.IOException failure) { throw new CrmBusinessException("邮件附件当前不可用"); }
    }

    private Path root(boolean create) throws java.io.IOException {
        Path root = Path.of(baseDirectory).resolve(FILE_TYPE).toAbsolutePath().normalize();
        String systemDrive = System.getenv("SystemDrive");
        if (systemDrive != null && root.startsWith(Path.of(systemDrive + "\\"))) throw new IllegalStateException("邮件私有附件禁止写入系统盘");
        Path ancestor = root;
        while (!Files.exists(ancestor, LinkOption.NOFOLLOW_LINKS)) {
            ancestor = ancestor.getParent();
            if (ancestor == null) throw invalid();
        }
        if (!Files.isDirectory(ancestor, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(ancestor)
                || !ancestor.equals(ancestor.toRealPath())) throw invalid();
        if (create) Files.createDirectories(root);
        Path actual = root.toRealPath();
        if (!root.equals(actual) || Files.isSymbolicLink(root)) throw invalid();
        return actual;
    }

    private static String filename(String input) {
        String value = CrmRecordSupport.text(input, 255, "附件名称");
        if (value.chars().anyMatch(character -> character < 32 || character == 127) || value.contains("/") || value.contains("\\") || value.contains(":")) throw invalid();
        int dot = value.lastIndexOf('.');
        if (dot <= 0 || !Set.of(".pdf", ".png", ".jpg", ".jpeg").contains(value.substring(dot).toLowerCase(Locale.ROOT))) throw invalid();
        return value;
    }

    private static String contentType(String name, byte[] bytes) {
        String suffix = name.substring(name.lastIndexOf('.')).toLowerCase(Locale.ROOT);
        if (".pdf".equals(suffix) && bytes.length >= 5 && new String(bytes, 0, 5, StandardCharsets.US_ASCII).equals("%PDF-")) return "application/pdf";
        if (".png".equals(suffix) && bytes.length >= 8 && (bytes[0] & 255) == 137 && bytes[1] == 80 && bytes[2] == 78 && bytes[3] == 71 && bytes[4] == 13 && bytes[5] == 10 && bytes[6] == 26 && bytes[7] == 10) return "image/png";
        if (Set.of(".jpg", ".jpeg").contains(suffix) && bytes.length >= 3 && (bytes[0] & 255) == 255 && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255) return "image/jpeg";
        throw invalid();
    }

    private static String hash(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    private static CrmBusinessException invalid() { return new CrmBusinessException("邮件附件须为本业务专用入口上传的PDF、PNG或JPEG，最多10个且合计不超过10 MB"); }
}
