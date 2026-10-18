package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.im.ImBindingAccounts;
import com.cloudflow.auth.im.ImBindingAction;
import com.cloudflow.auth.im.ImBindingFlow;
import com.cloudflow.auth.im.ImBindingHttp;
import com.cloudflow.auth.im.ImBindingIdentity;
import com.cloudflow.auth.im.ImBindingMemberCookie;
import com.cloudflow.auth.im.ImFailure;
import com.cloudflow.auth.im.ImLoginAuthorization;
import com.cloudflow.auth.im.ImLoginRequests;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/system/im/binding/mine")
@RequiredArgsConstructor
public class ImBindingController {
    private final ImBindingAccounts accounts;
    private final ImBindingIdentity identities;
    private final ImBindingFlow flow;
    private final ImLoginRequests requests;
    private final ImBindingHttp http;

    @ModelAttribute
    public void headers(HttpServletResponse response) { ImBindingHttp.headers(response); }

    @GetMapping
    @SaCheckPermission("system:im:binding:mine")
    @RateLimiter(key = "im:binding:mine", time = 60, count = 20, limitType = LimitType.IP)
    @SysLog(value = "读取本人通信绑定", logParams = false)
    public R<ImBindingAccounts.Overview> mine(HttpServletRequest request) {
        ImBindingHttp.parameters(request, Set.of());
        return R.ok(accounts.overview());
    }

    @GetMapping("/identity")
    @SaCheckPermission("system:im:binding:bind")
    @RateLimiter(key = "im:binding:identity:status", time = 60, count = 20, limitType = LimitType.IP)
    @SysLog(value = "读取本人绑定验证状态", logParams = false)
    public R<ImBindingIdentity.State> status(HttpServletRequest request) {
        ImBindingHttp.parameters(request, Set.of()); requests.begin(request, false);
        return R.ok(identities.status(ImBindingAction.BIND));
    }

    @PostMapping(value = "/identity", consumes = "application/json")
    @SaCheckPermission("system:im:binding:bind")
    @RepeatSubmit.Disabled
    @RateLimiter(key = "im:binding:identity", time = 60, count = 20, limitType = LimitType.IP)
    @SysLog(value = "验证本人通信绑定身份", logParams = false)
    public R<ImBindingIdentity.State> authenticate(HttpServletRequest request) {
        return R.ok(identities.authenticate(ImBindingAction.BIND, http.credentials(request), request));
    }

    @PostMapping(value = "/authorization", consumes = "application/json")
    @SaCheckPermission("system:im:binding:bind")
    @RepeatSubmit.Disabled
    @RateLimiter(key = "im:binding:authorization", time = 60, count = 20, limitType = LimitType.IP)
    @SysLog(value = "发起本人企业微信绑定授权", logParams = false)
    public R<ImLoginAuthorization.Grant> authorize(HttpServletRequest request, HttpServletResponse response) {
        http.submission(request, Set.of());
        ImLoginAuthorization.Grant grant = flow.begin(request, response);
        ImBindingMemberCookie.clear(response);
        return R.ok(grant);
    }

    @GetMapping("/pending")
    @SaCheckPermission("system:im:binding:bind")
    @RateLimiter(key = "im:binding:pending", time = 60, count = 20, limitType = LimitType.IP)
    @SysLog(value = "读取待确认的本人企业微信身份", logParams = false)
    public R<ImBindingFlow.Pending> pending(HttpServletRequest request, HttpServletResponse response) {
        ImBindingHttp.parameters(request, Set.of());
        try {
            String token = ImBindingMemberCookie.read(request);
            return R.ok(token == null ? null : flow.pending(token, request));
        } catch (ImFailure failure) { ImBindingMemberCookie.clear(response); throw failure; }
    }

    @PostMapping(value = "/confirm", consumes = "application/json")
    @SaCheckPermission("system:im:binding:bind")
    @RepeatSubmit.Disabled
    @RateLimiter(key = "im:binding:confirm", time = 60, count = 20, limitType = LimitType.IP)
    @SysLog(value = "确认本人企业微信绑定", logParams = false)
    public R<ImBindingAccounts.Summary> confirm(HttpServletRequest request, HttpServletResponse response) {
        http.submission(request, Set.of());
        try { return R.ok(flow.bind(ImBindingMemberCookie.require(request), request)); }
        finally { ImBindingMemberCookie.clear(response); }
    }

    @GetMapping("/unbind/identity")
    @SaCheckPermission("system:im:binding:unbind")
    @RateLimiter(key = "im:binding:unbind:status", time = 60, count = 20, limitType = LimitType.IP)
    @SysLog(value = "读取本人解绑验证状态", logParams = false)
    public R<ImBindingIdentity.State> unbindStatus(HttpServletRequest request) {
        ImBindingHttp.parameters(request, Set.of()); requests.begin(request, false);
        return R.ok(identities.status(ImBindingAction.UNBIND));
    }

    @PostMapping(value = "/unbind/identity", consumes = "application/json")
    @SaCheckPermission("system:im:binding:unbind")
    @RepeatSubmit.Disabled
    @RateLimiter(key = "im:binding:unbind:identity", time = 60, count = 20, limitType = LimitType.IP)
    @SysLog(value = "验证本人通信解绑身份", logParams = false)
    public R<ImBindingIdentity.State> authenticateUnbind(HttpServletRequest request) {
        return R.ok(identities.authenticate(ImBindingAction.UNBIND, http.credentials(request), request));
    }

    @PostMapping(value = "/unbind", consumes = "application/json")
    @SaCheckPermission("system:im:binding:unbind")
    @RepeatSubmit.Disabled
    @RateLimiter(key = "im:binding:unbind", time = 60, count = 20, limitType = LimitType.IP)
    @SysLog(value = "解除本人通信绑定", logParams = false)
    public R<Void> unbind(HttpServletRequest request, HttpServletResponse response) {
        flow.unbind(http.selection(request), request);
        ImBindingMemberCookie.clear(response);
        return R.ok();
    }

    @ExceptionHandler(ImFailure.class)
    public ResponseEntity<Map<String, Object>> error(ImFailure failure) {
        return ResponseEntity.status(failure.getCode()).header("Cache-Control", "no-store").header("Referrer-Policy", "no-referrer")
                .body(Map.of("code", failure.getCode(), "msg", failure.getMessage(), "reasonCode", failure.getReasonCode()));
    }
}
