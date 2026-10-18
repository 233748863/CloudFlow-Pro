package com.cloudflow.auth.controller.system;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.im.ImBindingAction;
import com.cloudflow.auth.im.ImBindingHttp;
import com.cloudflow.auth.im.ImBindingIdentity;
import com.cloudflow.auth.im.ImBindingManagement;
import com.cloudflow.auth.im.ImFailure;
import com.cloudflow.auth.im.ImLoginRequests;
import com.cloudflow.common.core.domain.PageResult;
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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/system/im/binding")
@RequiredArgsConstructor
public class ImBindingManagementController {
    private final ImBindingManagement service;
    private final ImBindingIdentity identities;
    private final ImBindingHttp http;
    private final ImLoginRequests requests;

    @ModelAttribute
    public void headers(HttpServletResponse response) { ImBindingHttp.headers(response); }

    @GetMapping("/list")
    @SaCheckPermission("system:im:binding:list")
    @RateLimiter(key = "im:binding:management:list", time = 60, count = 30, limitType = LimitType.USER)
    @SysLog(value = "查询通信绑定管理", logParams = false)
    public R<PageResult<ImBindingManagement.Entry>> list(@RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "20") int pageSize, HttpServletRequest request) {
        ImBindingHttp.parameters(request, Set.of("pageNum", "pageSize"));
        return R.ok(service.list(pageNum, pageSize));
    }

    @GetMapping("/manage/{action}/identity")
    @SaCheckPermission("system:im:binding:manage")
    @RateLimiter(key = "im:binding:management:identity:status", time = 60, count = 20, limitType = LimitType.IP)
    @SysLog(value = "读取管理绑定验证状态", logParams = false)
    public R<ImBindingIdentity.State> status(@PathVariable String action, HttpServletRequest request) {
        ImBindingHttp.parameters(request, Set.of());
        requests.begin(request, false);
        return R.ok(identities.status(action(action)));
    }

    @PostMapping(value = "/manage/{action}/identity", consumes = "application/json")
    @SaCheckPermission("system:im:binding:manage")
    @RepeatSubmit.Disabled
    @RateLimiter(key = "im:binding:management:identity", time = 60, count = 20, limitType = LimitType.IP)
    @SysLog(value = "验证管理绑定操作身份", logParams = false)
    public R<ImBindingIdentity.State> authenticate(@PathVariable String action, HttpServletRequest request) {
        return R.ok(identities.authenticate(action(action), http.credentials(request), request));
    }

    @PostMapping(value = "/manage/{action}", consumes = "application/json")
    @SaCheckPermission("system:im:binding:manage")
    @RepeatSubmit.Disabled
    @RateLimiter(key = "im:binding:management:write", time = 60, count = 20, limitType = LimitType.IP)
    @SysLog(value = "管理通信绑定", logParams = false)
    public R<Void> manage(@PathVariable String action, HttpServletRequest request) {
        service.manage(action(action), http.selection(request), request);
        return R.ok();
    }

    @ExceptionHandler(ImFailure.class)
    public ResponseEntity<Map<String, Object>> error(ImFailure failure) {
        return ResponseEntity.status(failure.getCode()).header("Cache-Control", "no-store").header("Referrer-Policy", "no-referrer")
                .body(Map.of("code", failure.getCode(), "msg", failure.getMessage(), "reasonCode", failure.getReasonCode()));
    }

    private ImBindingAction action(String action) {
        if ("unbind".equals(action)) return ImBindingAction.ADMIN_UNBIND;
        if ("resume".equals(action)) return ImBindingAction.ADMIN_RESUME;
        throw ImFailure.bindingRequest();
    }
}
