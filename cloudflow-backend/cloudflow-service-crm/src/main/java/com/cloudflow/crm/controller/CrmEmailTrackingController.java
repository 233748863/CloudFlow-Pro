package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaIgnore;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.service.email.CrmEmailSecurity;
import com.cloudflow.crm.service.email.CrmEmailTrackingLimiter;
import com.cloudflow.crm.service.email.CrmEmailTrackingService;
import com.cloudflow.crm.service.email.archive.CrmEmailArchiveTracking;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/track")
@RequiredArgsConstructor
public class CrmEmailTrackingController {
    private static final byte[] PIXEL = Base64.getDecoder().decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
    private final CrmEmailTrackingService service;
    private final CrmEmailTrackingLimiter limiter;
    private final CrmEmailArchiveTracking archive;

    @GetMapping("/open")
    @SaIgnore
    @SysLog(value = "营销邮件打开观察", logParams = false)
    public ResponseEntity<byte[]> open(@RequestParam(required = false) String token, HttpServletRequest request) {
        ResponseEntity<byte[]> limited = limited(request, token);
        if (limited != null) return limited;
        try {
            if ("ARCHIVE".equals(request.getParameter("kind"))) archive.open(token);
            else if (request.getParameter("kind") == null) service.open(token, request.getHeader("User-Agent"), ip(request));
        }
        catch (CrmBusinessException invalid) { }
        catch (RuntimeException unavailable) { return page(503, "邮件链接暂不可用，请稍后重试", ""); }
        return ResponseEntity.ok().headers(headers()).contentType(MediaType.IMAGE_GIF).body(PIXEL.clone());
    }

    @GetMapping("/click")
    @SaIgnore
    @SysLog(value = "营销邮件点击观察", logParams = false)
    public ResponseEntity<byte[]> click(@RequestParam(required = false) String token, HttpServletRequest request) {
        ResponseEntity<byte[]> limited = limited(request, token);
        if (limited != null) return limited;
        if (!request.getParameterMap().keySet().equals(java.util.Set.of("token"))) return page(400, "邮件链接当前不可用", "");
        try {
            String target = service.click(token, request.getHeader("User-Agent"), ip(request));
            return ResponseEntity.status(302).headers(headers()).header(HttpHeaders.LOCATION, target).body(new byte[0]);
        } catch (CrmBusinessException invalid) { return page(404, "邮件链接当前不可用", ""); }
        catch (RuntimeException unavailable) { return page(503, "邮件链接暂不可用，请稍后重试", ""); }
    }

    @GetMapping("/unsubscribe")
    @SaIgnore
    @SysLog(value = "查看邮件退订确认页", logParams = false)
    public ResponseEntity<byte[]> confirmation(@RequestParam(required = false) String token, HttpServletRequest request) {
        ResponseEntity<byte[]> limited = limited(request, token);
        if (limited != null) return limited;
        try {
            if (!service.validUnsubscribe(token)) return page(404, "邮件链接当前不可用", "");
            String form = "<form method=\"post\" action=\"/crm/track/unsubscribe\"><input type=\"hidden\" name=\"token\" value=\""
                    + CrmEmailSecurity.escape(token) + "\"><label for=\"reason\">退订原因（选填）</label>"
                    + "<textarea id=\"reason\" name=\"reason\" maxlength=\"500\" rows=\"3\"></textarea><button type=\"submit\">确认退订营销邮件</button></form>";
            return page(200, "退订营销邮件", "<p>确认后将停止向此邮箱发送本企业的营销邮件。</p>" + form);
        } catch (CrmBusinessException invalid) { return page(404, "邮件链接当前不可用", ""); }
        catch (RuntimeException unavailable) { return page(503, "邮件链接暂不可用，请稍后重试", ""); }
    }

    @PostMapping("/unsubscribe")
    @SaIgnore
    @RepeatSubmit.Disabled
    @SysLog(value = "确认退订营销邮件", logParams = false)
    public ResponseEntity<byte[]> unsubscribe(@RequestParam(required = false) String token,
            @RequestParam(required = false) String reason, HttpServletRequest request) {
        ResponseEntity<byte[]> limited = limited(request, token);
        if (limited != null) return limited;
        try {
            service.unsubscribe(token, reason, request.getHeader("User-Agent"), ip(request));
            return page(200, "已退订营销邮件", "<p>退订已生效，无需重复操作。</p>");
        } catch (CrmBusinessException invalid) { return page(404, "邮件链接当前不可用", ""); }
        catch (RuntimeException unavailable) { return page(503, "暂未完成退订，请稍后重试", ""); }
    }

    private ResponseEntity<byte[]> limited(HttpServletRequest request, String token) {
        CrmEmailTrackingLimiter.Verdict verdict = limiter.check(ip(request), token);
        if (verdict == CrmEmailTrackingLimiter.Verdict.ALLOWED) return null;
        ResponseEntity<byte[]> response = page(verdict == CrmEmailTrackingLimiter.Verdict.LIMITED ? 429 : 503, "请求暂不可用，请稍后重试", "");
        return ResponseEntity.status(response.getStatusCode()).headers(response.getHeaders()).header(HttpHeaders.RETRY_AFTER, "60").body(response.getBody());
    }

    private String ip(HttpServletRequest request) {
        String value = IpUtils.getIpAddr(request);
        return value != null && value.matches("[0-9a-fA-F:.]{1,45}") ? value : "unknown";
    }

    private HttpHeaders headers() {
        HttpHeaders headers = new HttpHeaders();
        headers.setCacheControl("no-store, max-age=0"); headers.set("Referrer-Policy", "no-referrer");
        headers.set("X-Content-Type-Options", "nosniff"); headers.set("X-Robots-Tag", "noindex, nofollow");
        headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
        return headers;
    }

    private ResponseEntity<byte[]> page(int status, String title, String content) {
        String html = "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<title>" + title + "</title><style>body{font-family:system-ui,sans-serif;margin:0;padding:24px;color:#202124;background:#f7f7f8}"
                + "main{max-width:520px;margin:40px auto;padding:24px;background:white;border-radius:12px}h1{font-size:24px}"
                + "label,textarea,button{display:block;width:100%;box-sizing:border-box;margin-top:16px}textarea{padding:12px;font:inherit}"
                + "button{min-height:44px;padding:12px;border:0;border-radius:8px;color:white;background:#245a43;cursor:pointer;font:inherit}"
                + "button:focus-visible,textarea:focus-visible{outline:3px solid #785c14;outline-offset:3px}</style></head><body><main><h1>"
                + title + "</h1>" + content + "</main></body></html>";
        return ResponseEntity.status(status).headers(headers()).contentType(new MediaType("text", "html", StandardCharsets.UTF_8)).body(html.getBytes(StandardCharsets.UTF_8));
    }
}
