package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.portal.PortalFileTickets;
import com.cloudflow.auth.portal.PortalFinanceFileService;
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
import jakarta.validation.constraints.*;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/portal/crm/finance/file")
@RequiredArgsConstructor
public class PortalFinanceFileController {
    private final PortalFinanceFileService files;

    @PostMapping("/access")
    @SaCheckPermission(value = "crm:portal:finance:list", type = "portal")
    @RateLimiter(key = "portal-finance-file", count = 120, limitType = LimitType.IP)
    @RepeatSubmit.Disabled
    public R<PortalFileTickets.Access> access(@Valid @RequestBody Access body, HttpServletRequest request) {
        noQuery(request);
        return R.ok(files.access(request.getHeader(PortalTokens.HEADER), body.getKind(), body.getRecordId(), body.getFileId()));
    }

    @PostMapping("/content")
    @SaCheckPermission(value = "crm:portal:finance:list", type = "portal")
    @RateLimiter(key = "portal-finance-file", count = 120, limitType = LimitType.IP)
    @RepeatSubmit.Disabled
    public void content(@Valid @RequestBody Content body, HttpServletRequest request, HttpServletResponse response) {
        noQuery(request);
        files.content(request.getHeader(PortalTokens.HEADER), body.getDownloadTicket(), body.isPreview(), response);
    }

    private static void noQuery(HttpServletRequest request) {
        if (!request.getParameterMap().isEmpty()) throw new ServiceException("票据访问不接受查询参数", 400);
    }
    public static class Strict {
        @JsonAnySetter
        public void unknown(String field, Object value) { throw new ServiceException("票据请求包含不允许的字段", 400); }
    }
    @Data
    public static final class Access extends Strict {
        @NotBlank @Pattern(regexp = "RECEIVABLE|INVOICE") private String kind;
        @NotNull @Min(1) private Long recordId;
        @NotNull @Min(1) private Long fileId;
    }
    @Data
    public static final class Content extends Strict {
        @NotBlank @Pattern(regexp = "ff_[A-Za-z0-9_-]{43}") private String downloadTicket;
        private boolean preview;
    }
}
