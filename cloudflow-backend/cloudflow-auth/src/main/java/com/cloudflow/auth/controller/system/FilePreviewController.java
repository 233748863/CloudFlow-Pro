package com.cloudflow.auth.controller.system;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.preview.FilePreviewService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/system/file")
@RequiredArgsConstructor
public class FilePreviewController {
    private final FilePreviewService service;

    @PostMapping("/preview-ticket")
    @SaCheckPermission("system:file:preview")
    @RepeatSubmit.Disabled
    @RateLimiter(time = 60, count = 30, limitType = LimitType.USER)
    @SysLog(value = "申请附件预览", logParams = false)
    public R<FilePreviewService.Preview> issue(@RequestBody FilePreviewRequest request, HttpServletResponse response) {
        FilePreviewService.headers(response);
        return R.ok(service.issue(request));
    }

    @GetMapping("/preview-content")
    @SaCheckPermission("system:file:preview")
    @RateLimiter(time = 60, count = 120, limitType = LimitType.USER)
    @SysLog(value = "读取附件预览", logParams = false)
    public void content(@RequestParam String previewToken, @RequestParam String signature,
            HttpServletRequest request, HttpServletResponse response) {
        service.content(previewToken, signature, request, response);
    }
}
