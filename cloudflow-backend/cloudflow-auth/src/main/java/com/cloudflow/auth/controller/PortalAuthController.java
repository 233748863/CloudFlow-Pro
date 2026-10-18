package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaIgnore;
import com.cloudflow.auth.domain.vo.DynamicMapVO;
import com.cloudflow.auth.portal.PortalAuthenticationService;
import com.cloudflow.auth.portal.PortalRequests;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import com.cloudflow.common.security.portal.PortalContext;
import com.cloudflow.common.security.portal.PortalTokens;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/portal")
@RequiredArgsConstructor
public class PortalAuthController {
    private final PortalAuthenticationService authentication;
    private final PortalTokens tokens;

    @SaIgnore
    @GetMapping("/{tenantCode}/status")
    @RateLimiter(key = "portal-status", count = 60, limitType = LimitType.IP)
    public R<String> status(@PathVariable String tenantCode) { return R.ok("客户门户仅支持受邀账号登录"); }

    @SaIgnore
    @PostMapping("/{tenantCode}/login")
    @RepeatSubmit.Disabled
    @RateLimiter(key = "portal-login", count = 10, limitType = LimitType.IP)
    public R<DynamicMapVO> login(@PathVariable String tenantCode,
            @Valid @RequestBody PortalRequests.Login request, HttpServletRequest http) {
        PortalAuthenticationService.LoginResponse response = authentication.login(tenantCode, request, http);
        return R.ok(DynamicMapVO.from(Map.of(
                "portalToken", response.getPortalToken(), "tokenHeader", response.getTokenHeader(),
                "expiresIn", response.getExpiresIn(), "idleSeconds", response.getIdleSeconds(),
                "session", response.getSession())));
    }

    @SaIgnore
    @PostMapping({"/{tenantCode}/activate", "/{tenantCode}/register"})
    @RepeatSubmit.Disabled
    @RateLimiter(key = "portal-activate", count = 10, limitType = LimitType.IP)
    public R<Void> activate(@PathVariable String tenantCode, @Valid @RequestBody PortalRequests.Activation request) {
        authentication.activate(tenantCode, request);
        return R.ok();
    }

    @GetMapping("/session")
    @SaCheckPermission(value = "crm:portal:session", type = "portal")
    @RateLimiter(key = "portal-session", count = 120, limitType = LimitType.IP)
    public R<PortalAuthenticationService.SessionView> session() { return R.ok(authentication.session(PortalContext.require())); }

    @PostMapping("/logout")
    @RepeatSubmit.Disabled
    @SaCheckPermission(value = "crm:portal:session", type = "portal")
    @RateLimiter(key = "portal-logout", count = 60, limitType = LimitType.IP)
    public R<Void> logout(HttpServletRequest request) {
        PortalContext.require();
        tokens.end(request.getHeader(PortalTokens.HEADER));
        return R.ok();
    }
}
