package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.portal.PortalRequests;
import com.cloudflow.auth.portal.PortalUserService;
import com.cloudflow.auth.portal.PortalUserView;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/system/portal-user")
@RequiredArgsConstructor
public class PortalUserController {
    private final PortalUserService service;

    @GetMapping("/list")
    @SaCheckPermission("system:portal:user:list")
    public R<PageResult<PortalUserView>> list(@RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status, @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) {
        return R.ok(service.list(keyword, status, Math.max(1, pageNum), Math.max(1, Math.min(100, pageSize))));
    }

    @GetMapping("/contacts")
    @SaCheckPermission("system:portal:user:manage")
    public R<PageResult<PortalUserService.ContactChoice>> contacts(@RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int pageNum, @RequestParam(defaultValue = "10") int pageSize) {
        return R.ok(service.candidates(keyword, Math.max(1, pageNum), Math.max(1, Math.min(100, pageSize))));
    }

    @GetMapping("/readiness")
    @SaCheckPermission("system:portal:user:list")
    public R<PortalUserService.Readiness> readiness() { return R.ok(service.readiness()); }

    @PostMapping("/invite")
    @SaCheckPermission("system:portal:user:manage")
    @SysLog(value = "邀请客户门户账号", logParams = false)
    @RepeatSubmit.Disabled
    @RateLimiter(count = 10, limitType = LimitType.USER)
    public R<PortalUserView> invite(@Valid @RequestBody PortalRequests.Invite request) { return R.ok(service.invite(request)); }

    @PostMapping("/{id}/resend")
    @SaCheckPermission("system:portal:user:manage")
    @SysLog(value = "重发客户门户邀请", logParams = false)
    @RepeatSubmit.Disabled
    @RateLimiter(count = 10, limitType = LimitType.USER)
    public R<PortalUserView> resend(@PathVariable Long id, @Valid @RequestBody PortalRequests.Version request) {
        return R.ok(service.resend(id, request.getVersion()));
    }

    @PostMapping("/{id}/disable")
    @SaCheckPermission("system:portal:user:manage")
    @SysLog(value = "停用客户门户账号", logParams = false)
    @RepeatSubmit.Disabled
    @RateLimiter(count = 10, limitType = LimitType.USER)
    public R<PortalUserView> disable(@PathVariable Long id, @Valid @RequestBody PortalRequests.Version request) {
        return R.ok(service.disable(id, request.getVersion()));
    }

    @PostMapping("/{id}/reset-password")
    @SaCheckPermission("system:portal:user:manage")
    @SysLog(value = "重设客户门户密码并重新邀请", logParams = false)
    @RepeatSubmit.Disabled
    @RateLimiter(count = 10, limitType = LimitType.USER)
    public R<PortalUserView> resetPassword(@PathVariable Long id, @Valid @RequestBody PortalRequests.Version request) {
        return R.ok(service.resetPassword(id, request.getVersion()));
    }
}
