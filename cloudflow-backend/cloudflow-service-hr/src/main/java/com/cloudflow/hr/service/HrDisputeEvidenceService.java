package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.domain.dto.dispute.HrDisputeEvidenceDTO;
import com.cloudflow.hr.domain.entity.HrDisputeEvidence;
import com.cloudflow.hr.domain.entity.HrLaborDispute;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrDisputeEvidenceMapper;
import com.cloudflow.hr.mapper.HrFileStorageMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Set;

/** 证据保存与文件授权使用同一案件范围，文件名在提交时写入。 */
@Service
@RequiredArgsConstructor
public class HrDisputeEvidenceService {
    private static final String PURPOSE = "HR_DISPUTE_EVIDENCE";
    private static final Set<String> SOURCE_PURPOSES = Set.of("HR_GRIEVANCE", "HR_GRIEVANCE_EVIDENCE");
    private final HrDisputeEvidenceMapper evidenceMapper;
    private final HrFileStorageMapper files;
    private final HrFileStorage storage;
    private final HrTypedCrudService records;
    private final HrGrievanceAccessService grievanceAccess;
    private final HrRuleSupport support;

    @Transactional(rollbackFor = Exception.class)
    public Long upload(Long disputeId, MultipartFile file, HrDisputeEvidenceDTO dto) {
        requireDispute(disputeId);
        if (file == null || file.isEmpty() || file.getSize() > 10 * 1024 * 1024) {
            throw new HrBusinessException("INVALID_EVIDENCE_FILE", "请选择不超过10 MB的证据文件");
        }
        String fileName = file.getOriginalFilename() == null ? "attachment.bin" : file.getOriginalFilename();
        fileName = fileName.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        if (fileName.length() > 200) fileName = fileName.substring(fileName.length() - 200);
        try {
            Long fileId = storage.save(file.getBytes(), fileName, PURPOSE);
            return insert(disputeId, fileId, fileName, dto.getEvidenceType(), dto.getRemark());
        } catch (IOException exception) {
            throw new HrBusinessException("FILE_READ_FAILED", "读取证据文件失败", exception);
        }
    }

    /** 同包申诉升级入口；调用方已验证来源申诉和每个附件，文件名来自授权后的 sys_file 元数据。 */
    void attachAuthorizedSource(Long disputeId, Long fileId, String fileName) {
        insert(disputeId, fileId, fileName, "OTHER", "申诉材料，沿用来源申诉访问限制");
    }

    private Long insert(Long disputeId, Long fileId, String fileName, String evidenceType, String remark) {
        HrDisputeEvidence evidence = new HrDisputeEvidence();
        evidence.setTenantId(HrRuleSupport.tenantId());
        evidence.setDisputeId(disputeId);
        evidence.setFileId(fileId);
        evidence.setFileName(fileName);
        evidence.setEvidenceType(evidenceType);
        evidence.setRemark(remark);
        evidence.setUploadedBy(UserContext.getUserId());
        evidence.setUploadedAt(LocalDateTime.now());
        evidence.setCreateBy(HrRuleSupport.userName());
        evidence.setUpdateBy(HrRuleSupport.userName());
        evidence.setDeleted(0);
        evidenceMapper.insert(evidence);
        support.audit("LABOR_DISPUTE", disputeId, "ATTACH_EVIDENCE", Map.of("evidenceId", evidence.getId(), "fileId", fileId));
        return evidence.getId();
    }

    public void requireDispute(Long disputeId) {
        if (UserContext.getUserId() == null) throw new HrBusinessException("UNAUTHORIZED", "请先登录");
        if (records.get(HrLaborDispute.class, disputeId).isEmpty()) {
            throw new HrBusinessException("FORBIDDEN", "争议不存在或无权访问");
        }
    }

    public String authorizeDownload(Long disputeId, Long fileId) {
        return requireFile(disputeId, fileId).purpose();
    }

    public ResponseEntity<byte[]> download(Long disputeId, Long fileId) {
        AuthorizedEvidence authorized = requireFile(disputeId, fileId);
        support.audit("LABOR_DISPUTE", disputeId, "DOWNLOAD_EVIDENCE", Map.of("fileId", fileId));
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(authorized.evidence().getFileName(), StandardCharsets.UTF_8).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store").header("X-Content-Type-Options", "nosniff")
                .body(storage.loadPrivate(fileId, authorized.purpose()));
    }

    private AuthorizedEvidence requireFile(Long disputeId, Long fileId) {
        requireDispute(disputeId);
        HrDisputeEvidence evidence = evidenceMapper.selectOne(new LambdaQueryWrapper<HrDisputeEvidence>()
                .eq(HrDisputeEvidence::getTenantId, HrRuleSupport.tenantId()).eq(HrDisputeEvidence::getDeleted, 0)
                .eq(HrDisputeEvidence::getDisputeId, disputeId).eq(HrDisputeEvidence::getFileId, fileId));
        if (evidence == null) throw new HrBusinessException("FORBIDDEN", "文件不属于该争议");
        Map<String, Object> metadata = files.selectFileMetadata(fileId, HrRuleSupport.tenantId());
        if (metadata == null) throw new HrBusinessException("FORBIDDEN", "证据文件不存在");
        String purpose = String.valueOf(metadata.get("fileType"));
        if (SOURCE_PURPOSES.contains(purpose)) grievanceAccess.linkedDispute(disputeId);
        else if (!PURPOSE.equals(purpose)) throw new HrBusinessException("FORBIDDEN", "证据文件用途不匹配");
        return new AuthorizedEvidence(evidence, purpose);
    }

    private record AuthorizedEvidence(HrDisputeEvidence evidence, String purpose) { }
}
