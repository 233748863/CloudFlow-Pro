package com.cloudflow.auth.service;

import com.cloudflow.auth.utils.SliderPuzzleUtil;
import com.cloudflow.common.core.utils.IdUtils;
import com.cloudflow.common.redis.config.SysConfigKeys;
import com.cloudflow.common.redis.core.SysConfigHelper;
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
    private SysConfigHelper sysConfigHelper;

    private static final int DEFAULT_TOLERANCE = 8;
    private static final int DEFAULT_TTL = 300;
    private static final int DEFAULT_DAILY_LIMIT = 100;
    private static final int DEFAULT_PASS_TOKEN_TTL = 120;

    /**
     * 获取验证码容错值（全局配置，所有租户统一）
     */
    private int getTolerance() {
        return sysConfigHelper.getGlobalInt(SysConfigKeys.CAPTCHA_TOLERANCE, DEFAULT_TOLERANCE);
    }

    /**
     * 获取验证码有效期（秒，全局配置）
     */
    private int getTtl() {
        return sysConfigHelper.getGlobalInt(SysConfigKeys.CAPTCHA_TTL, DEFAULT_TTL);
    }

    /**
     * 获取每日单IP验证次数限制（全局配置）
     */
    private int getDailyLimit() {
        return sysConfigHelper.getGlobalInt(SysConfigKeys.CAPTCHA_DAILY_LIMIT, DEFAULT_DAILY_LIMIT);
    }

    /**
     * 获取验证通过Token有效期（秒，全局配置）
     */
    private int getPassTokenTtl() {
        return sysConfigHelper.getGlobalInt(SysConfigKeys.CAPTCHA_PASS_TOKEN_TTL, DEFAULT_PASS_TOKEN_TTL);
    }

    private static final String CAPTCHA_KEY = "CAPTCHA:CODE:";
    private static final String PASS_TOKEN_KEY = "CAPTCHA:PASS:";
    private static final String LIMIT_KEY = "CAPTCHA:LIMIT:";
    private static final String PASS_TOKEN_VALUE_SEPARATOR = "|";

    public Map<String, Object> generateCaptcha(String ip) {
        String limitKey = LIMIT_KEY + ip;
        String countStr = redisTemplate.opsForValue().get(limitKey);
        int count = countStr == null ? 0 : Integer.parseInt(countStr);
        if (count >= getDailyLimit()) {
            throw new RuntimeException("今日验证次数已达上限");
        }

        SliderPuzzleUtil.CaptchaData data = SliderPuzzleUtil.createCaptcha();
        String uuid = IdUtils.simpleUUID();

        redisTemplate.opsForValue().set(CAPTCHA_KEY + uuid, String.valueOf(data.getX()), getTtl(), TimeUnit.SECONDS);

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

        redisTemplate.delete(key);

        int targetX = Integer.parseInt(storedX);
        if (Math.abs(x - targetX) <= getTolerance()) {
            String passToken = IdUtils.simpleUUID();
            redisTemplate.opsForValue().set(
                PASS_TOKEN_KEY + passToken,
                buildPassTokenValue(ip),
                getPassTokenTtl(),
                TimeUnit.SECONDS
            );

            String limitKey = LIMIT_KEY + ip;
            redisTemplate.opsForValue().increment(limitKey);
            redisTemplate.expire(limitKey, 24, TimeUnit.HOURS);

            return passToken;
        }
        throw new RuntimeException("验证失败");
    }

    public boolean validatePassToken(String passToken, String ip) {
        if (passToken == null || passToken.isEmpty() || ip == null || ip.isEmpty()) {
            return false;
        }
        String key = PASS_TOKEN_KEY + passToken;
        String value = redisTemplate.opsForValue().get(key);
        if (value == null) {
            return false;
        }
        String expected = buildPassTokenValue(ip);
        if (!expected.equals(value)) {
            return false;
        }
        redisTemplate.delete(key);
        return true;
    }

    private String buildPassTokenValue(String ip) {
        return "VALID" + PASS_TOKEN_VALUE_SEPARATOR + ip;
    }
}
