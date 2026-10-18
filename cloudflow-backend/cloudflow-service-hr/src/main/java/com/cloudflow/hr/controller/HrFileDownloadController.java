package com.cloudflow.hr.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.file.FilePreviewBinding;
import com.cloudflow.common.core.file.FilePreviewReferences;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.core.file.HrFileDownloadTypes;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.file.FilePreviewAccess;
import com.cloudflow.hr.service.HrAttendancePhotoService;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.HrFileStorage;
import com.cloudflow.hr.service.HrGrievanceService;
import com.cloudflow.hr.service.HrLeaveBusinessService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.hr.service.HrAdvanceService;
import com.cloudflow.hr.service.HrSettlementFundsService;
import com.cloudflow.hr.service.HrExitInterviewService;
import com.cloudflow.hr.service.HrTrainingRecoveryService;
import com.cloudflow.hr.service.HrSeveranceRuleService;
import com.cloudflow.hr.service.HrReferralService;
import com.cloudflow.hr.service.HrDocumentDownloadService;
import com.cloudflow.hr.service.IHrCertificateService;
import com.cloudflow.hr.domain.entity.HrTimeRequest;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/hr/file-download")
@RequiredArgsConstructor
public class HrFileDownloadController {
    private final HrAttendancePhotoService photos;
    private final HrEssSupport employees;
    private final HrGrievanceService grievances;
    private final HrLeaveBusinessService leaves;
    private final HrFileStorage storage;
    private final HrTypedCrudService records;
    private final HrAdvanceService advances;
    private final HrSettlementFundsService settlements;
    private final HrExitInterviewService interviews;
    private final HrTrainingRecoveryService training;
    private final HrSeveranceRuleService severance;
    private final HrReferralService referrals;
    private final HrDocumentDownloadService documents;
    private final IHrCertificateService certificates;

    @PostMapping("/authorize")
    @Inner(allowedServices = "cloudflow-auth")
    @RepeatSubmit.Disabled
    @SysLog(value = "核验人事附件下载范围", logParams = false)
    public R<FilePreviewBinding> authorize(@RequestBody FilePreviewRequest request) {
        String purpose = require(request);
        String reference = "/api/auth/system/file/" + request.fileId() + "/content";
        FilePreviewReferences.choose(request, List.of(reference));
        return R.ok(new FilePreviewBinding(reference, request.bizType() + ":" + request.bizId() + ":" + purpose));
    }

    @PostMapping("/content")
    @Inner(allowedServices = "cloudflow-auth")
    @RepeatSubmit.Disabled
    @SysLog(value = "读取人事私有下载附件", logParams = false)
    public ResponseEntity<byte[]> content(@RequestBody FilePreviewRequest request) {
        authorize(request);
        return switch (request.bizType()) {
            case "HR_ATTENDANCE_PHOTO" -> photos.download(request.fileId());
            case "HR_GRIEVANCE_MINE" -> grievances.download(request.businessId(), request.fileId(), true);
            case "HR_GRIEVANCE_MANAGE" -> grievances.download(request.businessId(), request.fileId(), false);
            case "HR_GRIEVANCE_DISPUTE" -> grievances.downloadDisputeFile(request.businessId(), request.fileId());
            case "HR_LEAVE_PROOF_MINE", "HR_LEAVE_PROOF_MANAGE" -> leaves.downloadAttachment(request.businessId(), request.fileId());
            case "HR_ADVANCE_PROOF" -> advances.downloadProof(request.businessId(), request.fileId());
            case "HR_SETTLEMENT_PROOF" -> settlements.downloadProof(request.businessId(), request.fileId());
            case "HR_EXIT_INTERVIEW" -> interviews.download(request.businessId(), request.fileId());
            case "HR_TRAINING_AGREEMENT" -> training.download(request.businessId(), request.fileId());
            case "HR_SEVERANCE_POLICY" -> severance.download(request.businessId(), request.fileId());
            case "HR_REFERRAL_RESUME_MINE", "HR_REFERRAL_RESUME_MANAGE" -> referrals.download(request.businessId(), "HR_REFERRAL_RESUME_MINE".equals(request.bizType()), request.fileId());
            case "HR_TAX_PROOF_MINE", "HR_TAX_PROOF_MANAGE" -> documents.taxContent(request.businessId(), request.fileId(), "HR_TAX_PROOF_MINE".equals(request.bizType()));
            case "HR_TRAINING_CERTIFICATE" -> documents.trainingContent(request.businessId(), request.fileId());
            case "HR_EMPLOYEE_CERTIFICATE" -> ResponseEntity.ok().contentType(org.springframework.http.MediaType.APPLICATION_PDF)
                    .body(certificates.downloadPdf(request.businessId(), request.fileId()).getBytes());
            default -> throw FilePreviewReferences.denied();
        };
    }

    private String require(FilePreviewRequest request) {
        FilePreviewAccess.requireSession();
        request.validated();
        if (!HrFileDownloadTypes.ALL.contains(request.bizType()) || request.fileId() == null) throw FilePreviewReferences.denied();
        String purpose = request.bizType();
        switch (request.bizType()) {
            case "HR_ATTENDANCE_PHOTO" -> {
                StpUtil.checkPermission("hr:attendance:mine");
                employees.currentEmployeeId();
                if (request.businessId() != request.fileId().longValue()) throw FilePreviewReferences.denied();
                photos.assertOwned(request.fileId());
            }
            case "HR_GRIEVANCE_MINE" -> {
                StpUtil.checkPermission("hr:grievance:mine:list");
                purpose = grievances.authorizeDownload(request.businessId(), request.fileId(), true);
            }
            case "HR_GRIEVANCE_MANAGE" -> {
                StpUtil.checkPermission("hr:grievance:manage:list");
                purpose = grievances.authorizeDownload(request.businessId(), request.fileId(), false);
            }
            case "HR_GRIEVANCE_DISPUTE" -> {
                StpUtil.checkPermission("hr:dispute:list");
                purpose = grievances.authorizeDisputeDownload(request.businessId(), request.fileId());
            }
            case "HR_LEAVE_PROOF_MINE", "HR_LEAVE_PROOF_MANAGE" -> {
                boolean mine = "HR_LEAVE_PROOF_MINE".equals(request.bizType());
                StpUtil.checkPermission(mine ? "hr:leave:mine" : "hr:attendance:list");
                if (mine) {
                    Object employeeId = records.get(HrTimeRequest.class, request.businessId()).get("employeeId");
                    if (!(employeeId instanceof Number number)) throw FilePreviewReferences.denied();
                    employees.assertOwner(number.longValue());
                }
                if (leaves.attachments(request.businessId()).stream().noneMatch(
                        file -> Objects.equals(file.get("fileId"), request.fileId()))) throw FilePreviewReferences.denied();
                purpose = "HR_LEAVE_PROOF";
            }
            case "HR_ADVANCE_PROOF" -> advances.authorizeProofDownload(request.businessId(), request.fileId());
            case "HR_SETTLEMENT_PROOF" -> settlements.authorizeProofDownload(request.businessId(), request.fileId());
            case "HR_EXIT_INTERVIEW" -> interviews.authorizeDownload(request.businessId(), request.fileId());
            case "HR_TRAINING_AGREEMENT" -> training.authorizeDownload(request.businessId(), request.fileId());
            case "HR_SEVERANCE_POLICY" -> severance.authorizeDownload(request.businessId(), request.fileId());
            case "HR_REFERRAL_RESUME_MINE", "HR_REFERRAL_RESUME_MANAGE" -> {
                referrals.authorizeDownload(request.businessId(), request.fileId(), "HR_REFERRAL_RESUME_MINE".equals(request.bizType()));
                purpose = "HR_REFERRAL_RESUME";
            }
            case "HR_TAX_PROOF_MINE", "HR_TAX_PROOF_MANAGE" -> {
                documents.authorizeTax(request.businessId(), request.fileId(), "HR_TAX_PROOF_MINE".equals(request.bizType()));
                purpose = "HR_TAX_PROOF";
            }
            case "HR_TRAINING_CERTIFICATE" -> {
                documents.authorizeTraining(request.businessId(), request.fileId());
                purpose = "application/pdf";
            }
            case "HR_EMPLOYEE_CERTIFICATE" -> {
                StpUtil.checkPermission("hr:ess:cert:view");
                purpose = certificates.authorizePdfDownload(request.businessId(), request.fileId());
            }
            default -> throw FilePreviewReferences.denied();
        }
        storage.fileName(request.fileId(), purpose);
        return purpose;
    }
}
