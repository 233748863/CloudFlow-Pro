package com.cloudflow.hr.service;

import com.cloudflow.common.core.utils.file.FileUploadUtils;
import com.cloudflow.hr.mapper.HrEmployeeReferralMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.Objects;

import static com.cloudflow.hr.service.HrHException.*;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrReferralResumeService {
    private static final String PURPOSE = "HR_REFERRAL_RESUME";
    private static final long MAX_SIZE = 10L * 1024 * 1024;
    private final HrFileStorage storage;
    private final HrEmployeeReferralMapper referrals;
    private final HrRuleSupport support;
    private final HrHSupport access;

    public record Uploaded(Long fileId, String fileName, long size) { }

    public Uploaded upload(MultipartFile file) {
        access.permission("hr:referral:submit");
        Long employeeId = access.mine().getId();
        FileUploadUtils.ValidatedFile validated;
        byte[] bytes;
        try {
            validated = FileUploadUtils.validate(file, MAX_SIZE, new String[]{"pdf", "doc", "docx"});
            bytes = file.getBytes();
            if (bytes.length == 0 || bytes.length > MAX_SIZE || bytes.length != file.getSize()) throw invalid("简历大小无效");
        } catch (Exception failure) { throw invalid("请选择内容与扩展名一致且不超过10MiB的PDF或Word简历"); }
        return support.transaction(() -> {
            Long fileId = storage.save(bytes, validated.originalFileName(), PURPOSE);
            support.audit(PURPOSE, fileId, "UPLOAD", Map.of("uploaderUserId", access.user(), "employeeId", employeeId,
                    "fileHash", hash(bytes), "fileSize", bytes.length));
            return new Uploaded(fileId, validated.originalFileName(), bytes.length);
        });
    }

    void bind(Long referralId, Long fileId, Long employeeId) {
        HrEmployeeReferralMapper.ResumeFile file = requireFile(fileId);
        Map<String, Object> upload = uploadEvidence(file);
        if (!Objects.equals(HrHSupport.number(upload.get("uploaderUserId")), access.user())
                || !Objects.equals(HrHSupport.number(upload.get("employeeId")), employeeId)) throw forbidden();
        byte[] bytes = verifiedBytes(file, upload);
        if (file.businessId() != null || referrals.bindResume(tenantId(), fileId, referralId, hash(bytes)) != 1) {
            throw conflict("REFERRAL_RESUME_USED", "该简历已关联推荐，请核对原推荐记录");
        }
    }

    ResponseEntity<byte[]> download(Long referralId, Long fileId) {
        HrEmployeeReferralMapper.ResumeFile file = authorizeDownload(referralId, fileId);
        byte[] bytes = verifiedBytes(file, uploadEvidence(file));
        if (!Objects.equals(file.fileHash(), hash(bytes))) throw conflict("REFERRAL_RESUME_CHANGED", "简历与原上传文件不一致");
        support.audit("HR_REFERRAL", referralId, "RESUME_DOWNLOAD", Map.of("fileId", fileId));
        return ResponseEntity.ok().contentType(MediaTypeFactory.getMediaType(file.fileName()).orElse(MediaType.APPLICATION_OCTET_STREAM))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.fileName(), StandardCharsets.UTF_8).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store").header("Content-Security-Policy", "default-src 'none'; sandbox")
                .header("X-Content-Type-Options", "nosniff").body(bytes);
    }

    HrEmployeeReferralMapper.ResumeFile authorizeDownload(Long referralId, Long fileId) {
        HrEmployeeReferralMapper.ResumeFile file = requireFile(fileId);
        if (!Objects.equals(String.valueOf(referralId), file.businessId())) throw forbidden();
        Map<String, Object> upload = uploadEvidence(file);
        if (!Objects.equals(file.fileHash(), upload.get("fileHash"))) throw forbidden();
        return file;
    }

    private HrEmployeeReferralMapper.ResumeFile requireFile(Long fileId) {
        HrEmployeeReferralMapper.ResumeFile file = fileId == null ? null : referrals.lockResume(tenantId(), fileId);
        if (file == null || file.fileSize() == null || file.fileSize() <= 0 || file.fileSize() > MAX_SIZE) throw forbidden();
        storage.fileName(fileId, PURPOSE);
        return file;
    }

    private Map<String, Object> uploadEvidence(HrEmployeeReferralMapper.ResumeFile file) {
        Map<String, Object> upload = support.auditDetail(PURPOSE, file.fileId(), "UPLOAD");
        if (!Objects.equals(HrHSupport.number(upload.get("fileSize")), file.fileSize())
                || !(upload.get("fileHash") instanceof String digest) || !digest.matches("[a-f0-9]{64}")) throw forbidden();
        return upload;
    }

    private byte[] verifiedBytes(HrEmployeeReferralMapper.ResumeFile file, Map<String, Object> upload) {
        byte[] bytes = storage.loadPrivate(file.fileId(), PURPOSE);
        if (bytes.length != file.fileSize() || !hash(bytes).equals(upload.get("fileHash"))) throw conflict("REFERRAL_RESUME_CHANGED", "简历与原上传文件不一致");
        return bytes;
    }

    private static String hash(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (Exception failure) { throw conflict("REFERRAL_RESUME_HASH_FAILED", "无法核验简历内容"); }
    }
}
