package com.cloudflow.common.config.properties;

import com.cloudflow.common.core.utils.IpUtils;
import jakarta.annotation.PostConstruct;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@RefreshScope
@ConfigurationProperties(prefix = "cloudflow.ratelimit")
public class RateLimitProperties {

    private List<String> trustedProxies = new ArrayList<>();

    @PostConstruct
    public void init() {
        IpUtils.setTrustedProxies(trustedProxies);
    }

    public List<String> getTrustedProxies() {
        return trustedProxies;
    }

    public void setTrustedProxies(List<String> trustedProxies) {
        this.trustedProxies = trustedProxies == null ? new ArrayList<>() : trustedProxies;
        IpUtils.setTrustedProxies(this.trustedProxies);
    }
}
