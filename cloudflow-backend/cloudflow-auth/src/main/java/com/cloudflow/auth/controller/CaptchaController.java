package com.cloudflow.auth.controller;

import com.cloudflow.auth.domain.dto.CaptchaCheckDTO;
import com.cloudflow.auth.domain.vo.DynamicMapVO;
import com.cloudflow.auth.service.CaptchaService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
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
    public R<DynamicMapVO> getSliderCaptcha(HttpServletRequest request) {
        try {
            String ip = IpUtils.getIpAddr(request);
            return R.ok(DynamicMapVO.from(captchaService.generateCaptcha(ip)));
        } catch (Exception e) {
            return R.fail(e.getMessage());
        }
    }

    @PostMapping("/check")
    @RepeatSubmit.Disabled
    public R<DynamicMapVO> checkCaptcha(@RequestBody CaptchaCheckDTO dto, HttpServletRequest request) {
        try {
            String ip = IpUtils.getIpAddr(request);
            
            String passToken = captchaService.verifyCaptcha(dto.getUuid(), dto.getX(), ip);
            Map<String, String> result = new HashMap<>();
            result.put("passToken", passToken);
            return R.ok(DynamicMapVO.from(result));
        } catch (Exception e) {
            return R.fail(e.getMessage());
        }
    }
}
