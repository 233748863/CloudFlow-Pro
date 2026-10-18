package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.file.FilePreviewBinding;
import com.cloudflow.common.core.file.FilePreviewReferences;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.file.FilePreviewAccess;
import com.cloudflow.hr.domain.entity.HrCandidate;
import com.cloudflow.hr.domain.entity.HrEmployeeContract;
import com.cloudflow.hr.domain.entity.HrEmployeeDocument;
import com.cloudflow.hr.domain.entity.HrDisputeMediation;
import com.cloudflow.hr.domain.entity.HrDisputeArbitration;
import com.cloudflow.hr.domain.entity.HrLaborDispute;
import com.cloudflow.hr.service.HrGrievanceAccessService;
import com.cloudflow.hr.domain.vo.attendance.HrAttendanceAppealVO;
import com.cloudflow.hr.service.IHrAttendanceAppealService;
import com.cloudflow.hr.service.HrTypedCrudService;
import java.util.ArrayList;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/hr/file-preview")
@RequiredArgsConstructor
public class HrFilePreviewController {
    private final HrTypedCrudService records;
    private final IHrAttendanceAppealService appeals;
    private final HrGrievanceAccessService grievanceAccess;

    @PostMapping("/authorize")
    @Inner(allowedServices = "cloudflow-auth")
    @SaCheckPermission("system:file:preview")
    @RepeatSubmit.Disabled
    @SysLog(value = "核验简历预览范围", logParams = false)
    public R<FilePreviewBinding> authorize(@RequestBody FilePreviewRequest request) {
        FilePreviewAccess.requireContext();
        return authorizeBinding(request);
    }

    @PostMapping("/download-authorize")
    @Inner(allowedServices = "cloudflow-auth")
    @RepeatSubmit.Disabled
    @SysLog(value = "核验简历下载范围", logParams = false)
    public R<FilePreviewBinding> authorizeDownload(@RequestBody FilePreviewRequest request) {
        FilePreviewAccess.requireSession();
        request.validated();
        if ("HR_DISPUTE_MEDIATION".equals(request.bizType()) || "HR_DISPUTE_ARBITRATION".equals(request.bizType())) {
            boolean mediation = "HR_DISPUTE_MEDIATION".equals(request.bizType());
            StpUtil.checkPermission(mediation ? "hr:dispute:mediation" : "hr:dispute:arbitration");
            Class<?> resource = mediation ? HrDisputeMediation.class : HrDisputeArbitration.class;
            Map<String, Object> record = records.get(resource, request.childId());
            if (!currentTenant(record) || !request.bizId().equals(String.valueOf(record.get("disputeId")))) throw FilePreviewReferences.denied();
            Map<String, Object> parent = records.get(HrLaborDispute.class, request.businessId());
            if (!currentTenant(parent)) throw FilePreviewReferences.denied();
            grievanceAccess.assertDisputeAccess(request.businessId());
            String references = record.get(mediation ? "agreementUrl" : "awardDocUrl") instanceof String value ? value : null;
            return R.ok(new FilePreviewBinding(FilePreviewReferences.choose(request, FilePreviewReferences.split(references)),
                    record.get("version") + ":" + record.get("updateTime")));
        }
        if ("HR_EMPLOYEE_CONTRACT".equals(request.bizType()) || "HR_EMPLOYEE_DOCUMENT".equals(request.bizType())) {
            StpUtil.checkPermission("hr:employees:view");
            Class<?> resource = "HR_EMPLOYEE_CONTRACT".equals(request.bizType()) ? HrEmployeeContract.class : HrEmployeeDocument.class;
            HrEmployeeResourceAccess.assertChildEmployeeVisible(records, resource, request.businessId());
            Map<String, Object> record = records.get(resource, request.businessId());
            if (record == null || !UserContext.getTenantId().toString().equals(String.valueOf(record.get("tenantId")))) throw FilePreviewReferences.denied();
            Object value = record.get("attachmentUrls");
            List<String> references = value instanceof List<?> items ? items.stream().filter(String.class::isInstance).map(String.class::cast).toList() : List.of();
            return R.ok(new FilePreviewBinding(FilePreviewReferences.choose(request, references), record.get("version") + ":" + record.get("updateTime")));
        }
        if ("HR_ATTENDANCE_APPEAL".equals(request.bizType())) {
            StpUtil.checkPermission("hr:attendance:list");
            HrAttendanceAppealVO record = appeals.getDetail(request.businessId());
            if (record == null) throw FilePreviewReferences.denied();
            List<String> references = new ArrayList<>();
            JsonNode evidence = record.getEvidenceUrls();
            if (evidence != null && evidence.isArray()) {
                evidence.forEach(value -> { if (value.isTextual()) references.add(value.asText()); });
            }
            return R.ok(new FilePreviewBinding(FilePreviewReferences.choose(request, references), String.valueOf(record.getUpdateTime())));
        }
        return authorizeBinding(request);
    }

    private static boolean currentTenant(Map<String, Object> record) {
        return record != null && !record.isEmpty()
                && UserContext.getTenantId().toString().equals(String.valueOf(record.get("tenantId")))
                && (record.get("deleted") == null || "0".equals(String.valueOf(record.get("deleted"))));
    }

    private R<FilePreviewBinding> authorizeBinding(FilePreviewRequest request) {
        StpUtil.checkPermission("hr:recruitment:list");
        request.validated();
        if (!"HR_RESUME".equals(request.bizType())) throw FilePreviewReferences.denied();
        Map<String, Object> record = records.get(HrCandidate.class, request.businessId());
        if (!UserContext.getTenantId().toString().equals(String.valueOf(record.get("tenantId")))) throw FilePreviewReferences.denied();
        Object value = record.get("resumeAttachmentUrls");
        List<String> references = value instanceof List<?> items ? items.stream().filter(String.class::isInstance).map(String.class::cast).toList() : List.of();
        String reference = FilePreviewReferences.choose(request, references);
        return R.ok(new FilePreviewBinding(reference, record.get("version") + ":" + record.get("updateTime")));
    }
}
