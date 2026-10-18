package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.file.FilePreviewBinding;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.oa.service.impl.OaFilePreviewService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/oa/file-preview")
@RequiredArgsConstructor
public class OaFilePreviewController {
    private final OaFilePreviewService service;

    @PostMapping("/authorize")
    @Inner(allowedServices = "cloudflow-auth")
    @SaCheckPermission("system:file:preview")
    @RepeatSubmit.Disabled
    @SysLog(value = "核验OA附件预览范围", logParams = false)
    public R<FilePreviewBinding> authorize(@RequestBody FilePreviewRequest request) { return R.ok(service.authorize(request)); }

    @PostMapping("/content")
    @Inner(allowedServices = "cloudflow-auth")
    @SaCheckPermission("system:file:preview")
    @RepeatSubmit.Disabled
    @SysLog(value = "读取OA私有预览附件", logParams = false)
    public ResponseEntity<byte[]> content(@RequestBody FilePreviewRequest request) { return service.content(request); }

    @PostMapping("/download-authorize")
    @Inner(allowedServices = "cloudflow-auth")
    @RepeatSubmit.Disabled
    @SysLog(value = "核验OA附件下载范围", logParams = false)
    public R<FilePreviewBinding> authorizeDownload(@RequestBody FilePreviewRequest request) { return R.ok(service.authorizeDownload(request)); }

    @PostMapping("/download-content")
    @Inner(allowedServices = "cloudflow-auth")
    @RepeatSubmit.Disabled
    @SysLog(value = "读取OA私有下载附件", logParams = false)
    public ResponseEntity<byte[]> downloadContent(@RequestBody FilePreviewRequest request) { return service.downloadContent(request); }
}
