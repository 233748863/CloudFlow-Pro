package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.service.ISysFileService;
import com.cloudflow.common.core.domain.PortalFileVO;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.Part;
import java.io.IOException;
import java.util.Collection;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/portal/file")
@RequiredArgsConstructor
public class PortalUploadController {
    private final ISysFileService files;

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @SaCheckPermission(value = "system:portal:file:access", type = "portal")
    @RateLimiter(key = "portal-file", count = 120, limitType = LimitType.IP)
    @RepeatSubmit.Disabled
    @SysLog(value = "客户门户上传附件", logParams = false)
    public R<PortalFileVO> upload(@RequestPart("file") MultipartFile file, @RequestParam String requestKey, HttpServletRequest request) {
        if (request.getQueryString() != null || request.getParameterMap().entrySet().stream().anyMatch(parameter ->
                !"requestKey".equals(parameter.getKey()) || parameter.getValue().length != 1)) throw invalid();
        try {
            Collection<Part> parts = request.getParts();
            if (parts.size() != 2 || parts.stream().anyMatch(part -> !Set.of("file", "requestKey").contains(part.getName()))
                    || parts.stream().filter(part -> "file".equals(part.getName())).count() != 1
                    || parts.stream().filter(part -> "requestKey".equals(part.getName())).count() != 1) throw invalid();
        } catch (IOException | ServletException failure) { throw invalid(); }
        return R.ok(view(files.uploadPortalFile(file, requestKey)));
    }

    @GetMapping("/upload/{requestKey}")
    @SaCheckPermission(value = "system:portal:file:access", type = "portal")
    @RateLimiter(key = "portal-file", count = 120, limitType = LimitType.IP)
    public R<PortalFileVO> uploaded(@PathVariable String requestKey, HttpServletRequest request) {
        noQuery(request);
        return R.ok(view(files.portalUpload(requestKey)));
    }

    @DeleteMapping("/{fileId}")
    @SaCheckPermission(value = "system:portal:file:access", type = "portal")
    @RateLimiter(key = "portal-file", count = 120, limitType = LimitType.IP)
    @SysLog(value = "移除客户门户临时附件", logParams = false)
    public R<Void> remove(@PathVariable Long fileId, HttpServletRequest request) {
        noQuery(request);
        files.removePortalUpload(fileId);
        return R.ok();
    }

    private static PortalFileVO view(SysFile file) {
        PortalFileVO result = new PortalFileVO();
        result.setFileId(file.getFileId());
        result.setFileName(file.getFileName());
        result.setFileSize(file.getFileSize());
        result.setExtension(file.getFileType());
        return result;
    }

    private static void noQuery(HttpServletRequest request) {
        if (!request.getParameterMap().isEmpty()) throw invalid();
    }

    private static ServiceException invalid() { return new ServiceException("附件请求只能包含指定的文件与上传标识", 400); }
}
