package com.cloudflow.auth.controller.inner;

import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.service.ISysFileService;
import com.cloudflow.common.core.domain.PortalFinanceAttachment;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.security.annotation.Inner;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/inner/auth/finance-files")
@RequiredArgsConstructor
public class InnerFinanceFileController {
    private final ISysFileService files;

    @Inner(allowedServices = {"cloudflow-service-crm", "cloudflow-service-oa"})
    @PostMapping(value = "/{kind}/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RepeatSubmit.Disabled
    public R<PortalFinanceAttachment> upload(@PathVariable String kind, @PathVariable Long id, @RequestPart("file") MultipartFile file) {
        SysFile stored = files.uploadFinanceFile(file, kind, id);
        PortalFinanceAttachment result = new PortalFinanceAttachment();
        result.setFileId(stored.getFileId()); result.setFileName(stored.getFileName());
        result.setFileSize(stored.getFileSize()); result.setExtension(stored.getFileType());
        return R.ok(result);
    }
}
