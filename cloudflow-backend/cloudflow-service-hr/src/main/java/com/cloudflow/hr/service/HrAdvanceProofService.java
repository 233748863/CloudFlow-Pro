package com.cloudflow.hr.service;

import com.cloudflow.common.core.utils.file.FileUploadUtils;
import com.cloudflow.hr.domain.entity.HrAdvanceRepayment;
import com.cloudflow.hr.domain.vo.advance.HrAdvanceViews;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
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

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.forbidden;
import static com.cloudflow.hr.service.HrHException.invalid;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;
import static com.cloudflow.hr.service.HrRuleSupport.userName;

@Service
@RequiredArgsConstructor
public class HrAdvanceProofService {
    private static final String PURPOSE = "HR_ADVANCE_PROOF";
    private static final long MAX_SIZE = 10L * 1024 * 1024;
    private final HrFileStorage storage;
    private final HrEmployeeAdvanceMapper advances;
    private final HrHSupport access;
    private final HrRuleSupport support;

    HrAdvanceViews.Proof save(Long advanceId, MultipartFile file) {
        FileUploadUtils.ValidatedFile validated;
        byte[] bytes;
        try {
            validated = FileUploadUtils.validate(file, MAX_SIZE, new String[]{"pdf", "png", "jpg", "jpeg"});
            bytes = file.getBytes();
            if (bytes.length == 0 || bytes.length > MAX_SIZE || bytes.length != file.getSize()) throw invalid("证明文件大小无效");
        } catch (Exception failure) {
            throw invalid("请选择内容与扩展名一致且不超过10MiB的PDF、PNG或JPEG凭据");
        }
        Long fileId = storage.save(bytes, validated.originalFileName(), PURPOSE);
        String hash = hash(bytes);
        if (advances.bindProof(tenantId(), advanceId, fileId, hash, userName()) != 1) {
            throw conflict("ADVANCE_PROOF_BIND_FAILED", "还款凭据绑定失败，请重新上传");
        }
        support.audit("HR_ADVANCE", advanceId, uploadOperation(fileId), Map.of("fileId", fileId,
                "uploaderUserId", access.user(), "fileHash", hash, "fileSize", bytes.length));
        return new HrAdvanceViews.Proof(fileId, validated.originalFileName(), bytes.length);
    }

    void requireOwned(Long advanceId, Long fileId, String sourceEventKey) {
        HrEmployeeAdvanceMapper.ProofFile file = proof(advanceId, fileId);
        if (!Objects.equals(uploader(advanceId, file), access.user())) throw forbidden();
        HrAdvanceRepayment previous = advances.proofRepayment(tenantId(), fileId);
        if (previous != null && (!Objects.equals(previous.getAdvanceId(), advanceId)
                || !Objects.equals(previous.getSourceEventKey(), "MANUAL:" + sourceEventKey))) {
            throw conflict("ADVANCE_PROOF_ALREADY_USED", "该凭据已经用于另一笔实际还款，请核对原记录");
        }
        verifiedBytes(file);
    }

    HrEmployeeAdvanceMapper.ProofFile authorizeDownload(Long advanceId, Long fileId) {
        HrEmployeeAdvanceMapper.ProofFile file = proof(advanceId, fileId);
        Long uploader = uploader(advanceId, file);
        HrAdvanceRepayment posted = advances.proofRepayment(tenantId(), fileId);
        if (posted == null) {
            if (!Objects.equals(uploader, access.user()) || !access.permitted("hr:advance:repay")) throw forbidden();
        } else if (!Objects.equals(posted.getAdvanceId(), advanceId) || !"MANUAL".equals(posted.getRepayType())
                || !"POSTED".equals(posted.getStatus()) || posted.getReversalOfId() != null) {
            throw conflict("ADVANCE_PROOF_SOURCE_INVALID", "还款凭据关联记录无效");
        }
        return file;
    }

    ResponseEntity<byte[]> download(Long advanceId, Long fileId) {
        HrEmployeeAdvanceMapper.ProofFile file = authorizeDownload(advanceId, fileId);
        byte[] bytes = verifiedBytes(file);
        support.audit("HR_ADVANCE", advanceId, "PROOF_DOWNLOAD", Map.of("fileId", fileId));
        return ResponseEntity.ok().contentType(MediaTypeFactory.getMediaType(file.fileName()).orElse(MediaType.APPLICATION_OCTET_STREAM))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(file.fileName(), StandardCharsets.UTF_8).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header("Content-Security-Policy", "default-src 'none'; sandbox")
                .header("X-Content-Type-Options", "nosniff").body(bytes);
    }

    private HrEmployeeAdvanceMapper.ProofFile proof(Long advanceId, Long fileId) {
        if (fileId == null || fileId <= 0) throw invalid("还款凭据编号无效");
        HrEmployeeAdvanceMapper.ProofFile file = advances.lockProof(tenantId(), advanceId, fileId);
        if (file == null) throw forbidden();
        return file;
    }

    private Long uploader(Long advanceId, HrEmployeeAdvanceMapper.ProofFile file) {
        Map<String, Object> uploaded = support.auditDetail("HR_ADVANCE", advanceId, uploadOperation(file.fileId()));
        Long uploader = HrHSupport.number(uploaded.get("uploaderUserId"));
        if (uploader == null || uploader <= 0 || !Objects.equals(HrHSupport.number(uploaded.get("fileId")), file.fileId())
                || file.fileHash() == null || !file.fileHash().matches("[a-f0-9]{64}")
                || !Objects.equals(uploaded.get("fileHash"), file.fileHash())
                || !Objects.equals(HrHSupport.number(uploaded.get("fileSize")), file.fileSize())) {
            throw conflict("ADVANCE_PROOF_SOURCE_INVALID", "凭据缺少可核验的原始上传记录");
        }
        return uploader;
    }

    private byte[] verifiedBytes(HrEmployeeAdvanceMapper.ProofFile file) {
        if (file.fileSize() == null || file.fileSize() <= 0 || file.fileSize() > MAX_SIZE) throw invalid("还款凭据大小无效");
        byte[] bytes = storage.loadPrivate(file.fileId(), PURPOSE);
        if (bytes.length != file.fileSize() || !hash(bytes).equals(file.fileHash())) {
            throw conflict("ADVANCE_PROOF_CHANGED", "还款凭据内容与原上传记录不一致");
        }
        return bytes;
    }

    private static String uploadOperation(Long fileId) { return "PROOF_UPLOAD:" + fileId; }

    private static String hash(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (Exception failure) { throw conflict("ADVANCE_PROOF_HASH_FAILED", "无法核验还款凭据内容"); }
    }
}
