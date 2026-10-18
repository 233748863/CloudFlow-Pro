package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.auth.platform.PlatformAccessService;
import com.cloudflow.auth.platform.PlatformReauthenticationRequest;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/system/platform/access")
@RequiredArgsConstructor
public class PlatformAccessController {
    private final PlatformAccessService access;

    @ModelAttribute
    public void responseHeaders(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
    }

    @GetMapping
    @SaCheckPermission(value = {"system:tenant-package:list", "system:data-source:list", "system:oauth2:client:list", "system:tenant:list"}, mode = SaMode.OR)
    @RateLimiter(key = "auth:platform:access", time = 60, count = 30, limitType = LimitType.USER)
    public R<PlatformAccessService.AccessState> status() {
        return R.ok(access.status());
    }

    @PostMapping("/reauthenticate")
    @SaCheckPermission(value = {"system:tenant-package:list", "system:data-source:list", "system:oauth2:client:list", "system:tenant:list"}, mode = SaMode.OR)
    @RateLimiter(key = "auth:platform:reauthenticate", time = 60, count = 5, limitType = LimitType.USER)
    @RepeatSubmit.Disabled
    @SysLog(value = "平台操作再次身份验证", logParams = false)
    public R<PlatformAccessService.AccessState> authenticate(@RequestBody @Valid PlatformReauthenticationRequest request) {
        return R.ok(access.authenticate(request));
    }
}
