package com.cloudflow.auth.service;

import com.cloudflow.auth.config.properties.CaptchaProperties;
import com.cloudflow.auth.utils.SliderPuzzleUtil;
import com.cloudflow.common.core.utils.IdUtils;
import com.cloudflow.common.core.utils.SysConfigHelper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Service
public class CaptchaService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired
    private CaptchaProperties captchaProperties;

    @Autowired
    private SysConfigHelper sysConfigHelper;

    /**
     * 获取验证码容错值（全局配置，所有租户统一）
     */
    private int getTolerance() {
        return sysConfigHelper.getGlobalInt("sys.captcha.tolerance", captchaProperties.getTolerance());
    }

    /**
     * 获取验证码有效期（秒，全局配置）
     */
    private int getTtl() {
        return sysConfigHelper.getGlobalInt("sys.captcha.ttl", captchaProperties.getTtl().intValue());
    }

    /**
     * 获取每日单IP验证次数限制（全局配置）
     */
    private int getDailyLimit() {
        return sysConfigHelper.getGlobalInt("sys.captcha.dailyLimit", captchaProperties.getDailyLimit());
    }

    /**
     * 获取验证通过Token有效期（秒，全局配置）
     */
    private int getPassTokenTtl() {
        return sysConfigHelper.getGlobalInt("sys.captcha.passTokenTtl", captchaProperties.getPassTokenTtl().intValue());
    }

    private static final String CAPTCHA_KEY = "CAPTCHA:CODE:";
    private static final String PASS_TOKEN_KEY = "CAPTCHA:PASS:";
    private static final String LIMIT_KEY = "CAPTCHA:LIMIT:";

    public Map<String, Object> generateCaptcha(String ip) {
        // Check Rate Limit
        String limitKey = LIMIT_KEY + ip;
        String countStr = redisTemplate.opsForValue().get(limitKey);
        int count = countStr == null ? 0 : Integer.parseInt(countStr);
        if (count >= getDailyLimit()) {
            throw new RuntimeException("今日验证次数已达上限");
        }
        
        // Generate
        SliderPuzzleUtil.CaptchaData data = SliderPuzzleUtil.createCaptcha();
        String uuid = IdUtils.simpleUUID();
        
        // Store X in Redis
        redisTemplate.opsForValue().set(CAPTCHA_KEY + uuid, String.valueOf(data.getX()), getTtl(), TimeUnit.SECONDS);
        
        // Return to frontend
        Map<String, Object> result = new HashMap<>();
        result.put("uuid", uuid);
        result.put("bgImage", data.getBgImage());
        result.put("sliderImage", data.getSliderImage());
        result.put("y", data.getY());
        result.put("sliderWidth", data.getSliderWidth());
        result.put("sliderHeight", data.getSliderHeight());
        return result;
    }

    public String verifyCaptcha(String uuid, int x, String ip) {
        String key = CAPTCHA_KEY + uuid;
        String storedX = redisTemplate.opsForValue().get(key);
        
        if (storedX == null) {
            throw new RuntimeException("验证码已过期");
        }
        
        redisTemplate.delete(key); // Verify once only
        
        int targetX = Integer.parseInt(storedX);
        if (Math.abs(x - targetX) <= getTolerance()) {
            // 验证成功，生成通过Token
            String passToken = IdUtils.simpleUUID();
            redisTemplate.opsForValue().set(PASS_TOKEN_KEY + passToken, "VALID", getPassTokenTtl(), TimeUnit.SECONDS);
            
            // Increment Limit
            String limitKey = LIMIT_KEY + ip;
            redisTemplate.opsForValue().increment(limitKey);
            redisTemplate.expire(limitKey, 24, TimeUnit.HOURS);
            
            return passToken;
        } else {
            throw new RuntimeException("验证失败");
        }
    }
    
    public boolean validatePassToken(String passToken) {
        if (passToken == null || passToken.isEmpty()) return false;
        String key = PASS_TOKEN_KEY + passToken;
        Boolean exists = redisTemplate.hasKey(key);
        if (Boolean.TRUE.equals(exists)) {
            redisTemplate.delete(key); // One-time use
            return true;
        }
        return false;
    }
}
