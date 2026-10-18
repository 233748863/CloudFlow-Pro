package com.cloudflow.workflow.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.file.FilePreviewBinding;
import com.cloudflow.common.core.file.FilePreviewReferences;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.file.FilePreviewAccess;
import com.cloudflow.workflow.service.WorkflowFormFileService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/workflow/file-preview")
@RequiredArgsConstructor
public class WorkflowFilePreviewController {
    private final WorkflowFormFileService files;

    @PostMapping("/authorize")
    @Inner(allowedServices = "cloudflow-auth")
    @SaCheckPermission("system:file:preview")
    @RepeatSubmit.Disabled
    @SysLog(value = "核验流程附件预览范围", logParams = false)
    public R<FilePreviewBinding> authorize(@RequestBody FilePreviewRequest request) {
        FilePreviewAccess.requireContext();
        return authorizeBinding(request);
    }

    @PostMapping("/download-authorize")
    @Inner(allowedServices = "cloudflow-auth")
    @RepeatSubmit.Disabled
    @SysLog(value = "核验流程附件下载范围", logParams = false)
    public R<FilePreviewBinding> authorizeDownload(@RequestBody FilePreviewRequest request) {
        FilePreviewAccess.requireSession();
        return authorizeBinding(request);
    }

    private R<FilePreviewBinding> authorizeBinding(FilePreviewRequest request) {
        StpUtil.checkPermissionOr("workflow:form:view", "workflow:process:start", "workflow:process:view");
        request.validated();
        if (!"WORKFLOW_FORM".equals(request.bizType())) throw FilePreviewReferences.denied();
        files.metadata(request.fileId(), request.definitionId(), request.instanceId(), request.taskId(), request.fieldPath());
        String reference = FilePreviewReferences.choose(request, List.of("/api/auth/system/file/" + request.fileId() + "/content"));
        return R.ok(new FilePreviewBinding(reference, request.bizId() + ":" + request.fieldPath()));
    }
}
