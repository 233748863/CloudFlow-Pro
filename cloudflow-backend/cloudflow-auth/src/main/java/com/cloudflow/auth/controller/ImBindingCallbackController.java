package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaIgnore;
import com.cloudflow.auth.im.ImBindingFlow;
import com.cloudflow.auth.im.ImBindingHttp;
import com.cloudflow.auth.im.ImBindingMemberCookie;
import com.cloudflow.auth.im.ImLoginRedirects;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class ImBindingCallbackController {
    private final ImBindingFlow flow;
    private final ImLoginRedirects redirects;

    @SaIgnore
    @GetMapping("/im/WECOM/binding-callback")
    @RateLimiter(key = "im:binding:callback", time = 60, count = 20, limitType = LimitType.IP)
    @SysLog(value = "接收本人企业微信绑定身份证明", logParams = false)
    public void callback(HttpServletRequest request, HttpServletResponse response) {
        ImBindingHttp.headers(response);
        boolean ready = false;
        try {
            ImBindingHttp.parameters(request, Set.of("state", "code"));
            String token = flow.callback(ImBindingHttp.parameter(request, "state", 43), ImBindingHttp.parameter(request, "code", 1024), request);
            ImBindingMemberCookie.set(response, token);
            ready = true;
        } catch (RuntimeException failure) { ImBindingMemberCookie.clear(response); }
        response.setStatus(303);
        response.setHeader("Location", redirects.bindingPage(ready));
    }
}
