package com.cloudflow.hr.service;

import com.cloudflow.common.core.utils.file.FileUploadUtils;
import com.cloudflow.hr.mapper.HrSettlementFundsMapper;
import com.cloudflow.hr.mapper.HrSettlementFundsMapper.ProofFile;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.forbidden;
import static com.cloudflow.hr.service.HrHException.invalid;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrSettlementProofService {
    public static final String PURPOSE = "HR_SETTLEMENT_PROOF";
    private static final long MAX_SIZE = 10L * 1024 * 1024;
    private final HrFileStorage storage;
    private final HrSettlementFundsMapper funds;
    private final HrHSupport access;
    private final HrRuleSupport support;

    Proof save(Long settlementId, MultipartFile file) {
        FileUploadUtils.ValidatedFile validated; byte[] bytes;
        try {
            validated = FileUploadUtils.validate(file, MAX_SIZE, new String[]{"pdf", "png", "jpg", "jpeg"}); bytes = file.getBytes();
            if (bytes.length == 0 || bytes.length > MAX_SIZE || bytes.length != file.getSize()) throw invalid("凭据大小无效");
        } catch (Exception failure) { throw invalid("请选择内容与扩展名一致且不超过10MiB的PDF、PNG或JPEG收款凭据"); }
        Long id = storage.save(bytes, validated.originalFileName(), PURPOSE); String hash = hash(bytes);
        if (funds.bindProof(tenantId(), settlementId, id, hash, HrRuleSupport.userName()) != 1) throw conflict("SETTLEMENT_PROOF_BIND_FAILED", "收款凭据绑定失败，请重新上传");
        support.audit("HR_SETTLEMENT", settlementId, "PROOF_UPLOAD:" + id, Map.of("fileId", id, "uploaderUserId", access.user(), "fileHash", hash, "fileSize", bytes.length));
        return new Proof(id, validated.originalFileName(), bytes.length);
    }

    void requireOwned(Long settlementId, Long fileId) {
        ProofFile file = proof(settlementId, fileId);
        if (!Objects.equals(uploader(settlementId, file), access.user())) throw forbidden();
        bytes(file);
    }

    /** Internal check of already recognized money; the original uploader need not be the current reviewer. */
    void verifyPosted(Long settlementId, Long fileId, Long originalUploader) {
        if (!org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()) throw conflict("SETTLEMENT_TRANSACTION_REQUIRED", "须在原结算事务内核实收款凭据");
        ProofFile file = proof(settlementId, fileId);
        if (originalUploader == null || !Objects.equals(uploader(settlementId, file), originalUploader)) throw conflict("SETTLEMENT_PROOF_EVIDENCE_MISSING", "原收款人与凭据上传依据不一致");
        bytes(file);
    }

    ProofFile authorizeDownload(Long settlementId, Long fileId, Long postedFileId) {
        ProofFile file = proof(settlementId, fileId); Long uploader = uploader(settlementId, file);
        if (!Objects.equals(postedFileId, fileId) && (!Objects.equals(uploader, access.user()) || !access.permitted("hr:settlement:receipt"))) throw forbidden();
        return file;
    }

    ResponseEntity<byte[]> download(Long settlementId, Long fileId, Long postedFileId) {
        ProofFile file = authorizeDownload(settlementId, fileId, postedFileId);
        byte[] data = bytes(file); support.audit("HR_SETTLEMENT", settlementId, "PROOF_DOWNLOAD", Map.of("fileId", fileId));
        return ResponseEntity.ok().contentType(MediaTypeFactory.getMediaType(file.fileName()).orElse(MediaType.APPLICATION_OCTET_STREAM))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.fileName(), StandardCharsets.UTF_8).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store").header("Content-Security-Policy", "default-src 'none'; sandbox")
                .header("X-Content-Type-Options", "nosniff").body(data);
    }

    private ProofFile proof(Long settlementId, Long fileId) {
        if (fileId == null || fileId <= 0) throw invalid("收款凭据编号无效");
        ProofFile file = funds.lockProof(tenantId(), settlementId, fileId); if (file == null) throw forbidden(); return file;
    }
    private Long uploader(Long settlementId, ProofFile file) {
        Map<String, Object> original = support.auditDetail("HR_SETTLEMENT", settlementId, "PROOF_UPLOAD:" + file.fileId());
        Long uploader = HrHSupport.number(original.get("uploaderUserId"));
        if (uploader == null || !Objects.equals(HrHSupport.number(original.get("fileId")), file.fileId())
                || !Objects.equals(original.get("fileHash"), file.fileHash()) || !Objects.equals(HrHSupport.number(original.get("fileSize")), file.fileSize())) throw conflict("SETTLEMENT_PROOF_EVIDENCE_MISSING", "凭据缺少原始上传依据");
        return uploader;
    }
    private byte[] bytes(ProofFile file) {
        if (file.fileSize() == null || file.fileSize() <= 0 || file.fileSize() > MAX_SIZE) throw invalid("收款凭据大小无效");
        byte[] data = storage.loadPrivate(file.fileId(), PURPOSE);
        if (data.length != file.fileSize() || !hash(data).equals(file.fileHash())) throw conflict("SETTLEMENT_PROOF_CHANGED", "收款凭据与原上传内容不一致"); return data;
    }
    private static String hash(byte[] bytes) { try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); } catch (Exception failure) { throw conflict("SETTLEMENT_PROOF_HASH_FAILED", "无法核验凭据内容"); } }
    public record Proof(Long fileId, String fileName, long fileSize) { }
}
