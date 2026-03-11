package com.cloudflow.common.config.properties;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Component;

/**
 * 安全配置属性。
 * 目前仅保留 Token 生命周期相关配置，认证状态由 Sa-Token 托管。
 */
@Component
@RefreshScope
@ConfigurationProperties(prefix = "cloudflow.security")
public class SecurityProperties {

    /**
     * Token 配置。
     */
    private Token token = new Token();

    public Token getToken() {
        return token;
    }

    public void setToken(Token token) {
        this.token = token;
    }

    public static class Token {
        /**
         * 令牌有效期，单位：分钟。
         */
        private Integer expiration = 30;

        /**
         * 令牌续期阈值，单位：分钟。
         */
        private Integer refreshTime = 20;

        public Integer getExpiration() {
            return expiration;
        }

        public void setExpiration(Integer expiration) {
            this.expiration = expiration;
        }

        public Integer getRefreshTime() {
            return refreshTime;
        }

        public void setRefreshTime(Integer refreshTime) {
            this.refreshTime = refreshTime;
        }
    }
}
