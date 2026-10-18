package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.portal.PortalFileTickets;
import com.cloudflow.auth.portal.PortalKnowledgeFileService;
import com.cloudflow.auth.portal.PortalTicketFileService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import com.cloudflow.common.security.portal.PortalTokens;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/portal/file")
@RequiredArgsConstructor
public class PortalFileController {
    private final PortalKnowledgeFileService files;
    private final PortalTicketFileService ticketFiles;

    @PostMapping("/access")
    @SaCheckPermission(value = "system:portal:file:access", type = "portal")
    @RateLimiter(key = "portal-file", count = 120, limitType = LimitType.IP)
    @RepeatSubmit.Disabled
    public R<PortalFileTickets.Access> access(@Valid @RequestBody KnowledgeAccess body, HttpServletRequest request) {
        noQuery(request);
        if ("KNOWLEDGE".equals(body.getResourceType())) {
            if (body.getDocumentId() == null || body.getVersionId() == null || body.getTicketId() != null) throw invalidScope();
            return R.ok(files.access(request.getHeader(PortalTokens.HEADER), body.getDocumentId(), body.getVersionId(), body.getFileId()));
        }
        if (body.getDocumentId() != null || body.getVersionId() != null) throw invalidScope();
        return R.ok(ticketFiles.access(request.getHeader(PortalTokens.HEADER), body.getResourceType(), body.getTicketId(), body.getFileId()));
    }

    @PostMapping("/download")
    @SaCheckPermission(value = "system:portal:file:access", type = "portal")
    @RateLimiter(key = "portal-file", count = 120, limitType = LimitType.IP)
    @RepeatSubmit.Disabled
    public void download(@Valid @RequestBody Download body, HttpServletRequest request, HttpServletResponse response) {
        noQuery(request);
        if (body.getDownloadTicket().startsWith("kf_")) files.download(request.getHeader(PortalTokens.HEADER), body.getDownloadTicket(), response);
        else ticketFiles.download(request.getHeader(PortalTokens.HEADER), body.getDownloadTicket(), response);
    }

    private static void noQuery(HttpServletRequest request) {
        if (!request.getParameterMap().isEmpty()) throw new ServiceException("文件访问不接受查询参数", 400);
    }

    private static ServiceException invalidScope() { return new ServiceException("附件访问范围无效", 400); }

    public static class StrictRequest {
        @JsonAnySetter
        public void unknown(String field, Object value) { throw new ServiceException("文件请求包含不允许的字段", 400); }
    }

    @Getter
    @Setter
    public static final class KnowledgeAccess extends StrictRequest {
        @NotBlank @Pattern(regexp = "KNOWLEDGE|TICKET|UPLOAD") private String resourceType = "KNOWLEDGE";
        @Min(1) private Long documentId;
        @Min(1) private Long versionId;
        @Min(1) private Long ticketId;
        @NotNull @Min(1) private Long fileId;
    }

    @Getter
    @Setter
    public static final class Download extends StrictRequest {
        @NotNull @Pattern(regexp = "(kf|tf)_[A-Za-z0-9_-]{43}") private String downloadTicket;
    }
}
