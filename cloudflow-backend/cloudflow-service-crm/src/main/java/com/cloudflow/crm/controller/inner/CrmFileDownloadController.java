package com.cloudflow.crm.controller.inner;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.file.CrmFileDownloadTypes;
import com.cloudflow.common.core.file.FilePreviewBinding;
import com.cloudflow.common.core.file.FilePreviewReferences;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.file.FilePreviewAccess;
import com.cloudflow.crm.domain.CrmEmailRecord;
import com.cloudflow.crm.service.email.archive.CrmEmailArchiveAccess;
import com.cloudflow.crm.service.email.archive.CrmEmailArchiveFiles;
import com.cloudflow.crm.service.email.archive.CrmEmailArchiveService;
import com.cloudflow.crm.service.impl.CrmPortalTicketManagement;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/crm/file-download")
@RequiredArgsConstructor
public class CrmFileDownloadController {
    private final CrmEmailArchiveAccess access;
    private final CrmEmailArchiveFiles files;
    private final CrmEmailArchiveService emails;
    private final CrmPortalTicketManagement tickets;

    @PostMapping("/authorize")
    @Inner(allowedServices = "cloudflow-auth")
    @RepeatSubmit.Disabled
    @SysLog(value = "核验客户邮件附件下载范围", logParams = false)
    public R<FilePreviewBinding> authorize(@RequestBody FilePreviewRequest request) {
        FilePreviewAccess.requireSession();
        request.validated();
        if (!CrmFileDownloadTypes.ALL.contains(request.bizType()) || request.fileId() == null) throw FilePreviewReferences.denied();
        if ("CRM_PORTAL_TICKET".equals(request.bizType())) {
            StpUtil.checkPermission("crm:ticket:list");
            tickets.authorizeDownload(request.businessId(), request.fileId());
            String reference = "/api/auth/system/file/" + request.fileId() + "/content";
            FilePreviewReferences.choose(request, List.of(reference));
            return R.ok(new FilePreviewBinding(reference, request.bizType() + ":" + request.bizId()));
        }
        CrmEmailRecord record = access.record(access.current("crm:email:list"), request.businessId());
        if (record.getAttachmentFileIds() == null || !record.getAttachmentFileIds().contains(request.fileId())) throw FilePreviewReferences.denied();
        files.info(record.getBizType(), record.getBizId(), List.of(request.fileId()));
        String reference = "/api/auth/system/file/" + request.fileId() + "/content";
        FilePreviewReferences.choose(request, List.of(reference));
        return R.ok(new FilePreviewBinding(reference, request.bizType() + ":" + record.getEmailId()
                + ":" + record.getBizType() + ":" + record.getBizId() + ":" + record.getUpdateTime()));
    }

    @PostMapping("/content")
    @Inner(allowedServices = "cloudflow-auth")
    @RepeatSubmit.Disabled
    @SysLog(value = "读取客户邮件私有下载附件", logParams = false)
    public ResponseEntity<byte[]> content(@RequestBody FilePreviewRequest request) {
        authorize(request);
        if (!"CRM_EMAIL_ATTACHMENT".equals(request.bizType())) throw FilePreviewReferences.denied();
        return emails.download(request.businessId(), request.fileId());
    }
}
