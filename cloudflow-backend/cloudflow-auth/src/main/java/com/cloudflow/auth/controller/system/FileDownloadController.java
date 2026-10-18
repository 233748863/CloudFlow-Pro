package com.cloudflow.auth.controller.system;

import cn.dev33.satoken.annotation.SaCheckLogin;
import com.cloudflow.auth.download.FileDownloadService;
import com.cloudflow.auth.download.FileDownloadTickets;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/system/file")
@RequiredArgsConstructor
public class FileDownloadController {
    private final FileDownloadService service;

    @GetMapping("/{fileId}/url")
    @SaCheckLogin
    @RateLimiter(time = 60, count = 60, limitType = LimitType.USER)
    @SysLog(value = "申请文件下载", logParams = false)
    public R<FileDownloadTickets.Access> url(@PathVariable Long fileId, @ModelAttribute FilePreviewRequest context, HttpServletResponse response) {
        FileDownloadService.headers(response);
        return R.ok(service.issue(fileId, context));
    }

    @GetMapping("/download")
    @SaCheckLogin
    @RateLimiter(time = 60, count = 120, limitType = LimitType.USER)
    @SysLog(value = "下载文件", logParams = false)
    public void download(@RequestParam String token, HttpServletResponse response) { service.download(token, response); }

    @GetMapping("/url")
    @SaCheckLogin
    @RateLimiter(time = 60, count = 60, limitType = LimitType.USER)
    @SysLog(value = "申请业务引用文件下载", logParams = false)
    public R<FileDownloadTickets.Access> urlByReference(@ModelAttribute FilePreviewRequest context, HttpServletResponse response) {
        FileDownloadService.headers(response);
        return R.ok(service.issueByReference(context));
    }
}
