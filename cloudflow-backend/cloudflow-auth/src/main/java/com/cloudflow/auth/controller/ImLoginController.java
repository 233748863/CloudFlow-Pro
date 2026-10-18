package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaIgnore;
import com.cloudflow.auth.im.ImFailure;
import com.cloudflow.auth.im.ImLoginAuthorization;
import com.cloudflow.auth.im.ImLoginChallenges;
import com.cloudflow.auth.im.ImLoginFlow;
import com.cloudflow.auth.im.ImLoginMfaCookie;
import com.cloudflow.auth.im.ImLoginRedirects;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import java.util.Set;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/im/WECOM")
public class ImLoginController {
    private final ImLoginFlow flow;
    private final ImLoginRedirects redirects;
    private final ObjectMapper json;

    public ImLoginController(ImLoginFlow flow, ImLoginRedirects redirects, ObjectMapper json) {
        this.flow = flow; this.redirects = redirects;
        this.json = json.copy().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION).enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    }

    @ModelAttribute
    public void headers(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Pragma", "no-cache");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("X-Content-Type-Options", "nosniff");
    }

    @SaIgnore
    @GetMapping("/availability")
    @RateLimiter(key = "im:login:availability", time = 60, count = 20, limitType = LimitType.IP)
    @SysLog(value = "检查企业微信登录状态", logParams = false)
    public R<ImLoginFlow.Availability> availability(HttpServletRequest request) {
        parameters(request, Set.of("tenantCode"));
        return R.ok(flow.availability(parameter(request, "tenantCode", 128, true), request));
    }

    @SaIgnore
    @GetMapping("/auth-url")
    @RateLimiter(key = "im:login:authorization", time = 60, count = 20, limitType = LimitType.IP)
    @SysLog(value = "发起企业微信登录", logParams = false)
    public R<ImLoginAuthorization.Grant> authorize(HttpServletRequest request, HttpServletResponse response) {
        parameters(request, Set.of("tenantCode", "purpose", "legalReleaseCode"));
        String purpose = parameter(request, "purpose", 32, true);
        if (!Set.of("SCAN_LOGIN", "EMBEDDED_LOGIN").contains(purpose)) throw ImFailure.loginChallenge();
        return R.ok(flow.begin(parameter(request, "tenantCode", 128, true), ImLoginChallenges.Purpose.valueOf(purpose), redirects.defaultPath(),
                parameter(request, "legalReleaseCode", 128, false), request, response));
    }

    @SaIgnore
    @GetMapping("/callback")
    @RateLimiter(key = "im:login:callback", time = 60, count = 20, limitType = LimitType.IP)
    @SysLog(value = "接收企业微信登录身份", logParams = false)
    public void callback(HttpServletRequest request, HttpServletResponse response) {
        ImLoginFlow.Result result = null;
        try {
            parameters(request, Set.of("code", "state"));
            result = flow.callback(parameter(request, "state", 43, true), parameter(request, "code", 1024, true), request, response);
            if (result.requiresTotp()) {
                ImLoginMfaCookie.set(response, result.challenge());
                redirect(response, redirects.loginPage(true));
            } else {
                ImLoginMfaCookie.clear(response);
                redirect(response, redirects.destination(result.redirectPath()));
            }
        } catch (RuntimeException failure) {
            flow.cancel(result, request, response);
            ImLoginMfaCookie.clear(response);
            redirect(response, redirects.loginPage(false));
        }
    }

    @SaIgnore
    @PostMapping(value = "/totp", consumes = "application/json")
    @RepeatSubmit.Disabled
    @RateLimiter(key = "im:login:totp", time = 60, count = 20, limitType = LimitType.IP)
    @SysLog(value = "验证企业微信登录动态码", logParams = false)
    public R<Completion> verify(HttpServletRequest request, HttpServletResponse response) {
        ImLoginFlow.Result result = null;
        ImLoginMfaCookie.clear(response);
        try {
            parameters(request, Set.of());
            byte[] bytes = request.getInputStream().readNBytes(1025);
            if (bytes.length > 1024) throw ImFailure.loginChallenge();
            JsonNode body = json.readTree(bytes);
            if (body == null || !body.isObject() || body.size() != 1 || !body.path("code").isTextual() || body.path("code").asText().length() > 64) throw ImFailure.loginChallenge();
            result = flow.verify(ImLoginMfaCookie.require(request), body.path("code").asText(), request, response);
            return R.ok(new Completion(redirects.destination(result.redirectPath())));
        } catch (IOException failure) { throw ImFailure.loginChallenge(); }
        catch (RuntimeException failure) { flow.cancel(result, request, response); throw failure; }
    }

    @ExceptionHandler(ImFailure.class)
    public ResponseEntity<Map<String, Object>> error(ImFailure failure) {
        return ResponseEntity.status(failure.getCode()).header("Cache-Control", "no-store").header("Referrer-Policy", "no-referrer")
                .body(Map.of("code", failure.getCode(), "msg", failure.getMessage(), "reasonCode", failure.getReasonCode()));
    }

    private void parameters(HttpServletRequest request, Set<String> allowed) {
        if (!allowed.containsAll(request.getParameterMap().keySet())) throw ImFailure.loginChallenge();
        for (String[] values : request.getParameterMap().values()) if (values == null || values.length != 1) throw ImFailure.loginChallenge();
    }

    private String parameter(HttpServletRequest request, String name, int maximum, boolean required) {
        String value = request.getParameter(name);
        if (value == null && !required) return null;
        if (value == null || value.isBlank() || value.length() > maximum || value.codePoints().anyMatch(Character::isISOControl)) throw ImFailure.loginChallenge();
        return value;
    }

    private void redirect(HttpServletResponse response, String target) { response.setStatus(303); response.setHeader("Location", target); }
    public record Completion(String redirectUrl) { }
}
