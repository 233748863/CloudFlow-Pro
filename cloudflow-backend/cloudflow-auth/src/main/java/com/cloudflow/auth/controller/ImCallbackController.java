package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaIgnore;
import com.cloudflow.auth.im.ImCallbackEndpoint;
import com.cloudflow.auth.im.ImFailure;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/im/callback")
@RequiredArgsConstructor
public class ImCallbackController {
    private final ImCallbackEndpoint endpoint;

    @ModelAttribute
    public void headers(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("X-Content-Type-Options", "nosniff");
    }

    @SaIgnore
    @GetMapping("/{configId:[1-9][0-9]{0,18}}")
    @RateLimiter(key = "im:callback", time = 60, count = 120, limitType = LimitType.IP)
    @SysLog(value = "验证企业微信回调地址", logParams = false)
    public ResponseEntity<String> echo(@PathVariable long configId, HttpServletRequest request) {
        return response(configId, request);
    }

    @SaIgnore
    @PostMapping("/{configId:[1-9][0-9]{0,18}}")
    @RepeatSubmit.Disabled
    @RateLimiter(key = "im:callback", time = 60, count = 120, limitType = LimitType.IP)
    @SysLog(value = "接收企业微信卡片操作", logParams = false)
    public ResponseEntity<String> receive(@PathVariable long configId, HttpServletRequest request) {
        return response(configId, request);
    }

    private ResponseEntity<String> response(long configId, HttpServletRequest request) {
        int status = 200;
        String body;
        try { body = endpoint.handle(configId, request); }
        catch (ImFailure failure) { status = failure.getCode(); body = "failed"; }
        catch (RuntimeException failure) { status = 503; body = "failed"; }
        return ResponseEntity.status(status).contentType(MediaType.TEXT_PLAIN).header("Cache-Control", "no-store")
                .header("Referrer-Policy", "no-referrer").header("X-Content-Type-Options", "nosniff").body(body);
    }
}
