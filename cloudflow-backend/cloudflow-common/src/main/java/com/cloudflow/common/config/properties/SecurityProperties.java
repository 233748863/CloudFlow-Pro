package com.cloudflow.common.config.properties;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Component;

/**
 * 安全配置属性
 * 对应 Nacos 配置: cloudflow-common.yaml
 */
@Component
@RefreshScope
@ConfigurationProperties(prefix = "cloudflow.security")
public class SecurityProperties {

    /**
     * JWT 密钥
     */
    private Jwt jwt = new Jwt();

    /**
     * Token 配置
     */
    private Token token = new Token();

    public Jwt getJwt() {
        return jwt;
    }

    public void setJwt(Jwt jwt) {
        this.jwt = jwt;
    }

    public Token getToken() {
        return token;
    }

    public void setToken(Token token) {
        this.token = token;
    }

    public static class Jwt {
        private String secret;

        public String getSecret() {
            return secret;
        }

        public void setSecret(String secret) {
            this.secret = secret;
        }
    }

    public static class Token {
        /**
         * 令牌有效期（分钟）
         */
        private Integer expiration = 30;

        /**
         * 令牌刷新时间（分钟）
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
