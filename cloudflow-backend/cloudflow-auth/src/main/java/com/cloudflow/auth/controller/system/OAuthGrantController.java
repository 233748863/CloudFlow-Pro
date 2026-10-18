package com.cloudflow.auth.controller.system;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.oauth2.OAuthAuthorizationService;
import com.cloudflow.auth.oauth2.OAuthViews;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/system/oauth2/grant")
@RequiredArgsConstructor
public class OAuthGrantController {
    private final OAuthAuthorizationService service;

    @ModelAttribute
    public void headers(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
    }

    @GetMapping("/mine")
    @SaCheckPermission("system:oauth2:grant:list")
    @RateLimiter(key = "oauth2:grant:list", time = 60, count = 30, limitType = LimitType.USER)
    public R<PageResult<OAuthViews.Grant>> mine(@RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) { return R.ok(service.mine(pageNum, pageSize)); }

    @PostMapping("/{approveId}/revoke")
    @SaCheckPermission("system:oauth2:grant:revoke")
    @RepeatSubmit
    @RateLimiter(key = "oauth2:grant:revoke", time = 60, count = 10, limitType = LimitType.USER)
    @SysLog(value = "撤销本人第三方授权", logParams = false)
    public R<Void> revoke(@PathVariable Long approveId, @RequestBody OAuthViews.Version request) {
        service.revoke(approveId, request == null ? null : request.version());
        return R.ok();
    }
}
