package com.cloudflow.hr.service;

import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrFileStorageMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class HrRuleProofService {
    private final HrFileStorage storage;
    private final HrFileStorageMapper fileMapper;
    private final HrRuleSupport support;

    public Map<String, Object> upload(MultipartFile file, String purpose) {
        if (!Set.of("HR_LEAVE_PROOF", "HR_TAX_PROOF").contains(String.valueOf(purpose))) throw new HrBusinessException("INVALID_PROOF", "不支持该附件类别");
        if (file == null || file.isEmpty() || file.getSize() > 10 * 1024 * 1024) throw new HrBusinessException("INVALID_PROOF", "请选择不超过 10 MB 的证明文件");
        String name = file.getOriginalFilename() == null ? "proof.bin" : file.getOriginalFilename().replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        if (name.length() > 128) name = name.substring(name.length() - 128);
        if (!name.matches(".*\\.[A-Za-z0-9]{1,10}$")) name += ".bin";
        try {
            Long fileId = storage.save(file.getBytes(), name, purpose);
            support.audit("RULE_PROOF", fileId, "UPLOAD", Map.of("purpose", purpose));
            return Map.of("fileId", fileId, "fileName", name, "reference", "hr-file:" + purpose + ":" + fileId);
        } catch (IOException exception) { throw new HrBusinessException("PROOF_READ_FAILED", "读取证明文件失败", exception); }
    }

    public void requireOwned(String reference, String purpose) {
        Long fileId = fileId(reference, purpose);
        if (fileMapper.countOwnedProof(HrRuleSupport.tenantId(), HrRuleSupport.userName(), fileId, purpose) != 1) {
            throw new HrBusinessException("FORBIDDEN", "证明文件须通过对应业务入口由本人上传");
        }
    }

    public ResponseEntity<byte[]> download(String reference, String purpose) {
        Long fileId = fileId(reference, purpose);
        support.audit("RULE_PROOF", fileId, "DOWNLOAD", Map.of("purpose", purpose));
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(storage.fileName(fileId, purpose), java.nio.charset.StandardCharsets.UTF_8).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store").header("X-Content-Type-Options", "nosniff")
                .body(storage.loadPrivate(fileId, purpose));
    }

    private Long fileId(String reference, String purpose) {
        String prefix = "hr-file:" + purpose + ":";
        if (reference == null || !reference.startsWith(prefix)) throw new HrBusinessException("INVALID_PROOF", "证明文件引用无效，请重新上传");
        try {
            long fileId = Long.parseLong(reference.substring(prefix.length()));
            if (fileId <= 0) throw new NumberFormatException();
            return fileId;
        } catch (NumberFormatException exception) { throw new HrBusinessException("INVALID_PROOF", "证明文件引用无效"); }
    }
}
