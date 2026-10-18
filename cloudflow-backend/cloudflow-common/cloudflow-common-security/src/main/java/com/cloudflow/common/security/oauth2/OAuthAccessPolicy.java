package com.cloudflow.common.security.oauth2;

import com.cloudflow.common.core.utils.IpUtils;
import java.net.URI;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class OAuthAccessPolicy {
    private final boolean enabled;
    private final boolean loopbackHttp;
    private final String origin;

    public OAuthAccessPolicy(@Value("${cloudflow.oauth2.enabled:false}") boolean enabled,
            @Value("${cloudflow.oauth2.public-url:}") String publicUrl,
            @Value("${cloudflow.oauth2.allow-loopback-http:false}") boolean loopbackHttp) {
        this.enabled = enabled;
        this.loopbackHttp = loopbackHttp;
        this.origin = parseOrigin(publicUrl, loopbackHttp);
    }

    public boolean configured() { return enabled && origin != null; }

    public String reason() { return configured() ? "第三方授权已启用，应用仍须单独启用并经本人同意" : "第三方授权未完成部署配置，授权入口已停用"; }

    public void requireAvailable() {
        if (!configured()) throw new OAuthFailure("temporarily_unavailable", reason(), 503);
    }

    public void transport(boolean secure, String remote, String forwardedProto) {
        requireAvailable();
        boolean local = loopbackHttp && Set.of("127.0.0.1", "::1", "0:0:0:0:0:0:0:1").contains(remote);
        if (!secure && !(IpUtils.isTrustedProxy(remote) && "https".equalsIgnoreCase(forwardedProto)) && !local) {
            throw new OAuthFailure("invalid_request", "第三方授权只允许HTTPS连接", 403);
        }
    }

    public void consentOrigin(String supplied) {
        requireAvailable();
        if (supplied != null && !origin.equals(parseOrigin(supplied, loopbackHttp))) {
            throw new OAuthFailure("invalid_request", "授权确认来源不受信任", 403);
        }
    }

    private static String parseOrigin(String value, boolean loopbackHttp) {
        if (value == null || value.isBlank() || value.contains("\\") || value.codePoints().anyMatch(character -> character <= 32 || character >= 127)) return null;
        try {
            URI uri = URI.create(value);
            String host = uri.getHost();
            boolean local = host != null && Set.of("localhost", "127.0.0.1", "[::1]").contains(host);
            if (host == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                    || uri.getPort() == 0 || uri.getPort() > 65535 || uri.getPort() < -1
                    || !(uri.getPath().isEmpty() || uri.getPath().equals("/"))
                    || !("https".equals(uri.getScheme()) || loopbackHttp && local && "http".equals(uri.getScheme()))) return null;
            int port = uri.getPort();
            return uri.getScheme() + "://" + host.toLowerCase(java.util.Locale.ROOT)
                    + (port == -1 || port == 443 && "https".equals(uri.getScheme()) || port == 80 && "http".equals(uri.getScheme()) ? "" : ":" + port);
        } catch (IllegalArgumentException invalid) { return null; }
    }
}
