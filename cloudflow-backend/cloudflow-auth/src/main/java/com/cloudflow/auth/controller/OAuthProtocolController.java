package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaIgnore;
import com.cloudflow.auth.oauth2.OAuthAccessService;
import com.cloudflow.auth.oauth2.OAuthAuthorizationService;
import com.cloudflow.auth.oauth2.OAuthProtocolRequests;
import com.cloudflow.auth.oauth2.OAuthProtocolService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.aspectj.RateLimiterAspect.RateLimitException;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import com.cloudflow.common.security.oauth2.OAuthAccessPolicy;
import com.cloudflow.common.security.oauth2.OAuthFailure;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/oauth2")
@RequiredArgsConstructor
public class OAuthProtocolController {
    private final OAuthAuthorizationService authorization;
    private final OAuthProtocolService protocol;
    private final OAuthAccessService access;
    private final OAuthAccessPolicy policy;
    private final com.cloudflow.auth.oauth2.OAuthAudit audit;
    private final com.cloudflow.auth.oauth2.OAuthBusinessResources resources;

    @ModelAttribute
    public void headers(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Pragma", "no-cache");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("X-Content-Type-Options", "nosniff");
    }

    @GetMapping("/authorize")
    @SaCheckPermission("system:oauth2:authorize")
    @RateLimiter(key = "oauth2:authorize", time = 60, count = 10, limitType = LimitType.USER)
    @SysLog(value = "读取第三方授权确认", logParams = false)
    public R<OAuthAuthorizationService.AuthorizationView> authorize(HttpServletRequest request) {
        return R.ok(authorization.begin(parse(request, "AUTHORIZATION_REQUEST_FAILED", () -> OAuthProtocolRequests.authorize(request))));
    }

    @PostMapping("/authorize")
    @SaCheckPermission("system:oauth2:authorize")
    @RepeatSubmit(key = "#p0 == null ? 'invalid' : #p0.submissionKey()")
    @RateLimiter(key = "oauth2:authorize", time = 60, count = 10, limitType = LimitType.USER)
    @SysLog(value = "确认本人第三方授权", logParams = false)
    public R<OAuthAuthorizationService.AuthorizationView> confirm(@RequestBody OAuthProtocolRequests.Consent body, HttpServletRequest request) {
        parse(request, "CONSENT_REQUEST_FAILED", () -> {
            policy.consentOrigin(request.getHeader("Origin"));
            return body;
        });
        return R.ok(authorization.confirm(body));
    }

    @SaIgnore
    @PostMapping(value = "/token", consumes = "application/x-www-form-urlencoded")
    @RepeatSubmit.Disabled
    @RateLimiter(key = "oauth2:token:ip", time = 60, count = 60, limitType = LimitType.IP)
    @SysLog(value = "兑换第三方访问令牌", logParams = false)
    public OAuthProtocolService.TokenResponse token(HttpServletRequest request) {
        return protocol.token(parse(request, "TOKEN_REQUEST_FAILED", () -> OAuthProtocolRequests.token(request)), IpUtils.getIpAddr(request));
    }

    @SaIgnore
    @PostMapping(value = "/revoke", consumes = "application/x-www-form-urlencoded")
    @RepeatSubmit.Disabled
    @RateLimiter(key = "oauth2:revoke:ip", time = 60, count = 60, limitType = LimitType.IP)
    @SysLog(value = "撤销第三方访问令牌", logParams = false)
    public Map<String, String> revoke(HttpServletRequest request) {
        protocol.revoke(parse(request, "REVOCATION_REQUEST_FAILED", () -> OAuthProtocolRequests.revoke(request)), IpUtils.getIpAddr(request));
        return Map.of();
    }

    @GetMapping("/userinfo")
    @SaCheckPermission(value = "system:oauth2:profile", type = "oauth2")
    @RateLimiter(key = "oauth2:resource:ip", time = 60, count = 300, limitType = LimitType.IP)
    public OAuthAccessService.Profile userinfo() { return access.profile(); }

    @GetMapping("/api/system/tenant")
    @SaCheckPermission(value = "system:oauth2:tenant", type = "oauth2")
    @RateLimiter(key = "oauth2:resource:ip", time = 60, count = 300, limitType = LimitType.IP)
    public OAuthAccessService.Tenant tenant() { return access.tenant(); }

    @ExceptionHandler(OAuthFailure.class)
    public ResponseEntity<Map<String, String>> error(OAuthFailure failure) {
        ResponseEntity.BodyBuilder response = ResponseEntity.status(failure.getCode()).header("Cache-Control", "no-store");
        if ("invalid_client".equals(failure.getError())) response.header("WWW-Authenticate", "Basic realm=\"oauth2\"");
        if (failure.getCode() == 429) response.header("Retry-After", "60");
        return response.body(Map.of("error", failure.getError(), "error_description", failure.getMessage()));
    }

    @ExceptionHandler(RateLimitException.class)
    public ResponseEntity<Map<String, String>> limited() {
        policy.requireAvailable();
        OAuthFailure failure = new OAuthFailure("slow_down", "请求过于频繁，请一分钟后重试", 429);
        audit.failure(null, null, "RATE_LIMITED", failure);
        return error(failure);
    }

    private <Request> Request parse(HttpServletRequest request, String event, Supplier<Request> operation) {
        policy.requireAvailable();
        try {
            policy.transport(request.isSecure(), request.getRemoteAddr(), request.getHeader("X-Forwarded-Proto"));
            return operation.get();
        } catch (OAuthFailure failure) {
            audit.failure(null, null, event, failure);
            throw failure;
        }
    }

    @GetMapping("/api/crm/customer")
    @SaCheckPermission(value = "crm:customer:list", type = "oauth2")
    @RateLimiter(key = "oauth2:resource:ip", time = 60, count = 300, limitType = LimitType.IP)
    public com.cloudflow.common.core.domain.PageResult<com.cloudflow.common.security.oauth2.OAuthResources.Customer> customers(
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "1") int pageNum,
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "10") int pageSize,
            @org.springframework.web.bind.annotation.RequestParam(required = false) String name) {
        return resources.customers(pageNum, pageSize, name);
    }

    @GetMapping("/api/crm/customer/{customerId}")
    @SaCheckPermission(value = "crm:customer:list", type = "oauth2")
    @RateLimiter(key = "oauth2:resource:ip", time = 60, count = 300, limitType = LimitType.IP)
    public com.cloudflow.common.security.oauth2.OAuthResources.Customer customer(
            @org.springframework.web.bind.annotation.PathVariable Long customerId) { return resources.customer(customerId); }

    @GetMapping("/api/workflow/instance/{instanceId}")
    @SaCheckPermission(value = "workflow:process:view", type = "oauth2")
    @RateLimiter(key = "oauth2:resource:ip", time = 60, count = 300, limitType = LimitType.IP)
    public com.cloudflow.common.security.oauth2.OAuthResources.Instance instance(
            @org.springframework.web.bind.annotation.PathVariable String instanceId) { return resources.instance(instanceId); }
}
