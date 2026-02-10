package com.cloudflow.auth.config.properties;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Component;

/**
 * 验证码配置属性
 * 对应 Nacos 配置: cloudflow-auth-dev.yaml
 */
@Component
@RefreshScope
@ConfigurationProperties(prefix = "cloudflow.captcha")
public class CaptchaProperties {

    /**
     * 滑块容错值 (像素)
     */
    private Integer tolerance = 8;

    /**
     * 验证码有效期 (秒)
     */
    private Long ttl = 300L;

    /**
     * 每日单IP验证次数限制
     */
    private Integer dailyLimit = 100;

    /**
     * 验证通过Token有效期 (秒)
     */
    private Long passTokenTtl = 120L;

    public Integer getTolerance() {
        return tolerance;
    }

    public void setTolerance(Integer tolerance) {
        this.tolerance = tolerance;
    }

    public Long getTtl() {
        return ttl;
    }

    public void setTtl(Long ttl) {
        this.ttl = ttl;
    }

    public Integer getDailyLimit() {
        return dailyLimit;
    }

    public void setDailyLimit(Integer dailyLimit) {
        this.dailyLimit = dailyLimit;
    }

    public Long getPassTokenTtl() {
        return passTokenTtl;
    }

    public void setPassTokenTtl(Long passTokenTtl) {
        this.passTokenTtl = passTokenTtl;
    }
}
