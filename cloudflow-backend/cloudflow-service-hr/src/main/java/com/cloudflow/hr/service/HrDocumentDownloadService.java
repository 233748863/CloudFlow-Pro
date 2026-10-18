package com.cloudflow.hr.service;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.file.FilePreviewReferences;
import com.cloudflow.hr.domain.entity.HrTaxDeduction;
import com.cloudflow.hr.domain.entity.HrTrainingCertificate;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrTrainingCertificateMapper;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

/** 先校验业务记录与文件绑定；签发凭据时不读取附件全文。 */
@Service
@RequiredArgsConstructor
public class HrDocumentDownloadService {
    private final HrPayrollConfigurationService payroll;
    private final HrRuleProofService proofs;
    private final HrTrainingCertificateMapper certificates;
    private final HrEssSupport employees;
    private final HrFileStorage storage;

    public void authorizeTax(Long id, Long fileId, boolean mine) {
        HrTaxDeduction record = tax(id, mine);
        if (!Objects.equals(record.getProofFileUrl(), "hr-file:HR_TAX_PROOF:" + fileId)) throw FilePreviewReferences.denied();
        storage.fileName(fileId, "HR_TAX_PROOF");
    }

    public ResponseEntity<byte[]> taxContent(Long id, Long fileId, boolean mine) {
        HrTaxDeduction record = tax(id, mine);
        if (!Objects.equals(record.getProofFileUrl(), "hr-file:HR_TAX_PROOF:" + fileId)) throw FilePreviewReferences.denied();
        return proofs.download(record.getProofFileUrl(), "HR_TAX_PROOF");
    }

    private HrTaxDeduction tax(Long id, boolean mine) {
        StpUtil.checkPermission(mine ? "hr:payroll:mine" : "hr:payroll:verify");
        HrTaxDeduction record = payroll.deduction(id);
        if (mine) employees.assertOwner(record.getEmployeeId());
        return record;
    }

    public void authorizeTraining(Long id, Long fileId) {
        HrTrainingCertificate record = training(id, fileId);
        storage.fileName(record.getPdfFileId(), "application/pdf");
    }

    public ResponseEntity<byte[]> trainingContent(Long id, Long fileId) {
        HrTrainingCertificate record = training(id, fileId);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename("training-certificate-" + record.getCertNo() + ".pdf", StandardCharsets.UTF_8).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store").header("X-Content-Type-Options", "nosniff")
                .body(storage.loadPrivate(record.getPdfFileId(), "application/pdf"));
    }

    private HrTrainingCertificate training(Long id, Long fileId) {
        StpUtil.checkPermission("hr:training:cert:list");
        HrTrainingCertificate record = certificates.selectById(id);
        if (record == null || !Objects.equals(record.getTenantId(), HrRuleSupport.tenantId())
                || !Integer.valueOf(0).equals(record.getDeleted())) throw FilePreviewReferences.denied();
        employees.assertOwner(record.getEmployeeId());
        if (record.getPdfFileId() == null) throw new HrBusinessException("CERTIFICATE_PDF_MISSING", "证书 PDF 尚未生成");
        if (fileId != null && !Objects.equals(record.getPdfFileId(), fileId)) throw FilePreviewReferences.denied();
        return record;
    }
}
