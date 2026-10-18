package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.quota.TenantQuotaService;
import com.cloudflow.oa.domain.OaPrivateFile;
import com.cloudflow.oa.mapper.OaPrivateFileMapper;
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
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class OaPrivateFileStorageService {
    public enum Kind {
        RFQ_QUOTATION("OA_RFQ_QUOTATION"), RFQ_INVITATION("OA_RFQ_INVITATION"), CONTRACT_EVIDENCE("OA_CONTRACT_EVIDENCE"), CONTRACT_SIGNED("OA_CONTRACT_SIGNED");
        private final String fileType;
        Kind(String fileType) { this.fileType = fileType; }
    }
    private static String prefix(Kind kind) { return "oa-file:" + kind.name() + ":"; }
    private final OaPrivateFileMapper files;
    private final TenantQuotaService tenantQuotas;
    @Value("${cloudflow.oa.private-storage-dir:${user.home}/.cloudflow/oa/private}")
    private String baseDirectory;

    public record UploadedFile(Long fileId, String fileName, String reference) { }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "上传保密供应商业务附件")
    public UploadedFile upload(Kind kind, MultipartFile upload) {
        if (upload == null || upload.isEmpty() || upload.getSize() > 10 * 1024 * 1024) throw new IllegalArgumentException("业务附件须为不超过10 MB的PDF、PNG或JPEG文件");
        String name = OaRecordSupport.text(upload.getOriginalFilename(), 255, "附件名称");
        int dot = name.lastIndexOf('.'); String suffix = dot < 0 ? "" : name.substring(dot).toLowerCase(Locale.ROOT);
        if (!Set.of(".pdf", ".png", ".jpg", ".jpeg").contains(suffix)) throw new IllegalArgumentException("仅支持PDF、PNG和JPEG业务扫描件");
        try {
            byte[] bytes = upload.getBytes();
            boolean valid = ".pdf".equals(suffix) ? bytes.length >= 5 && new String(bytes, 0, 5, StandardCharsets.US_ASCII).equals("%PDF-")
                    : ".png".equals(suffix) ? bytes.length >= 8 && (bytes[0] & 255) == 137 && bytes[1] == 80 && bytes[2] == 78 && bytes[3] == 71 && bytes[4] == 13 && bytes[5] == 10 && bytes[6] == 26 && bytes[7] == 10
                    : bytes.length >= 3 && (bytes[0] & 255) == 255 && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255;
            if (!valid) throw new IllegalArgumentException("附件内容与文件类型不一致");
            tenantQuotas.requireStorageCapacity(OaRecordSupport.tenantId(), bytes.length);
            Path root = Path.of(baseDirectory).resolve(kind.name()).toAbsolutePath().normalize(); Files.createDirectories(root); root = root.toRealPath();
            Path target = root.resolve(OaRecordSupport.tenantId() + "-" + UUID.randomUUID() + suffix).normalize();
            if (!target.startsWith(root) || target.toString().length() > 255) throw new IllegalStateException("业务附件存储目录配置无效");
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) try { Files.deleteIfExists(target); }
                    catch (Exception exception) { log.error("回滚业务附件写入失败，path={}", target, exception); }
                }
            });
            Files.write(target, bytes);
            OaPrivateFile record = new OaPrivateFile(); record.setTenantId(OaRecordSupport.tenantId()); record.setFileName(name); record.setFilePath(target.toString());
            record.setUrl(""); record.setStorageType("LOCAL"); record.setFileSize((long) bytes.length); record.setFileType(kind.fileType);
            record.setCreateBy(OaRecordSupport.require(UserContext.getUserId(), "上传人未登录").toString()); record.setCreateTime(LocalDateTime.now()); record.setDeleted(0);
            OaRecordSupport.saved(files.insert(record));
            tenantQuotas.refreshStorage(record.getTenantId());
            return new UploadedFile(record.getFileId(), name, prefix(kind) + record.getFileId());
        } catch (java.io.IOException exception) { throw new IllegalStateException("业务附件保存失败", exception); }
    }

    public void assertOwned(Kind kind, String reference, Long userId) {
        OaPrivateFile file = metadata(kind, reference);
        if (!Objects.equals(file.getCreateBy(), String.valueOf(userId))) throw new IllegalArgumentException("业务附件必须由录入人从业务专用入口上传");
    }

    @Audit(name = "读取保密供应商业务附件")
    public ResponseEntity<byte[]> download(Kind kind, String reference) {
        OaPrivateFile file = metadata(kind, reference);
        try {
            Path root = Path.of(baseDirectory).resolve(kind.name()).toAbsolutePath().normalize().toRealPath(); Path target = Path.of(file.getFilePath()).toAbsolutePath().normalize().toRealPath();
            if (!target.startsWith(root) || Files.size(target) > 10 * 1024 * 1024) throw new IllegalArgumentException("附件超出允许的存储范围");
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.getFileName(), StandardCharsets.UTF_8).build().toString())
                    .header(HttpHeaders.CACHE_CONTROL, "no-store").header("X-Content-Type-Options", "nosniff").body(Files.readAllBytes(target));
        } catch (java.io.IOException exception) { throw new IllegalStateException("业务附件读取失败", exception); }
    }

    private OaPrivateFile metadata(Kind kind, String reference) {
        if (reference == null || !reference.startsWith(prefix(kind))) throw new IllegalArgumentException("业务附件引用无效，请通过专用入口上传");
        Long id;
        try { id = Long.parseLong(reference.substring(prefix(kind).length())); }
        catch (NumberFormatException exception) { throw new IllegalArgumentException("业务附件引用无效"); }
        OaPrivateFile file = OaRecordSupport.active(files.selectById(id));
        if (!kind.fileType.equals(file.getFileType()) || !"LOCAL".equals(file.getStorageType())) throw new IllegalArgumentException("业务附件类型无效");
        return file;
    }
}
