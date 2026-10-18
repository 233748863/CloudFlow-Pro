package com.cloudflow.auth.oauth2;

import java.util.Set;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Getter
@Setter
@ToString(onlyExplicitlyIncluded = true)
@Component
@ConfigurationProperties(prefix = "cloudflow.oauth2")
public class OAuthProperties {
    private boolean enabled;
    private String publicUrl;
    private boolean allowLoopbackHttp;
    private String secretKey;
    private Set<Long> serviceUserIds = Set.of();
}

