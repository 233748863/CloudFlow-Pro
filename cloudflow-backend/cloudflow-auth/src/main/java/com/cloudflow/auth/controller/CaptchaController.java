package com.cloudflow.auth.controller;

import com.cloudflow.auth.service.CaptchaService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.IpUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/captcha")
public class CaptchaController {

    @Autowired
    private CaptchaService captchaService;

    @GetMapping("/slider")
    public R<?> getSliderCaptcha(HttpServletRequest request) {
        try {
            String ip = IpUtils.getIpAddr(request);
            return R.ok(captchaService.generateCaptcha(ip));
        } catch (Exception e) {
            return R.fail(e.getMessage());
        }
    }

    @PostMapping("/check")
    public R<?> checkCaptcha(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        try {
            String uuid = (String) body.get("uuid");
            Integer x = (Integer) body.get("x");
            String ip = IpUtils.getIpAddr(request);
            
            String passToken = captchaService.verifyCaptcha(uuid, x, ip);
            Map<String, String> result = new HashMap<>();
            result.put("passToken", passToken);
            return R.ok(result);
        } catch (Exception e) {
            return R.fail(e.getMessage());
        }
    }
}
