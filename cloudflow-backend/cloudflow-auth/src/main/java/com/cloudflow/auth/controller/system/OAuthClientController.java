package com.cloudflow.auth.controller.system;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.oauth2.OAuthClientRequest;
import com.cloudflow.auth.oauth2.OAuthClientService;
import com.cloudflow.auth.oauth2.OAuthViews;
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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/system/oauth2/client")
@RequiredArgsConstructor
public class OAuthClientController {
    private final OAuthClientService service;

    @ModelAttribute
    public void headers(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("X-Content-Type-Options", "nosniff");
    }

    @GetMapping("/list")
    @SaCheckPermission("system:oauth2:client:list")
    @RateLimiter(key = "oauth2:client:list", time = 60, count = 30, limitType = LimitType.USER)
    public R<OAuthViews.Overview> list(@RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) { return R.ok(service.list(pageNum, pageSize)); }

    @PostMapping
    @SaCheckPermission("system:oauth2:client:manage")
    @RepeatSubmit
    @RateLimiter(key = "oauth2:client:manage", time = 60, count = 20, limitType = LimitType.USER)
    @SysLog(value = "新增第三方客户端", logParams = false)
    public R<OAuthViews.Created> create(@RequestBody @Valid OAuthClientRequest request) { return R.ok(service.create(request)); }

    @PutMapping
    @SaCheckPermission("system:oauth2:client:manage")
    @RepeatSubmit
    @RateLimiter(key = "oauth2:client:manage", time = 60, count = 20, limitType = LimitType.USER)
    @SysLog(value = "修改第三方客户端", logParams = false)
    public R<OAuthViews.Client> update(@RequestBody @Valid OAuthClientRequest request) { return R.ok(service.update(request)); }

    @PostMapping("/{clientId}/disable")
    @SaCheckPermission("system:oauth2:client:manage")
    @RepeatSubmit
    @RateLimiter(key = "oauth2:client:manage", time = 60, count = 20, limitType = LimitType.USER)
    @SysLog(value = "停用第三方客户端", logParams = false)
    public R<OAuthViews.Client> disable(@PathVariable Long clientId, @RequestBody OAuthViews.Version request) {
        return R.ok(service.disable(clientId, request == null ? null : request.version()));
    }
}
