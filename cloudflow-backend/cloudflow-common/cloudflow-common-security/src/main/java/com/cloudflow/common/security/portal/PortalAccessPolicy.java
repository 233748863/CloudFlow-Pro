package com.cloudflow.common.security.portal;

import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.IpUtils;
import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class PortalAccessPolicy {
    private final boolean enabled;
    private final String publicUrl;

    public PortalAccessPolicy(@Value("${cloudflow.portal.enabled:false}") boolean enabled,
            @Value("${cloudflow.portal.public-url:}") String publicUrl) {
        this.enabled = enabled;
        this.publicUrl = normalizeOrigin(publicUrl);
    }

    public String unavailableReason() {
        if (!enabled) return "客户门户入口未启用，请联系邀请人员";
        if (publicUrl == null) return "尚未配置有效的客户门户HTTPS地址，请联系邀请人员";
        return null;
    }

    public String publicUrl() { return publicUrl; }

    public void requireAvailable() {
        String reason = unavailableReason();
        if (reason != null) throw new ServiceException(reason, 503);
    }

    public void checkTransport(boolean nativeSecure, String remoteAddress, String forwardedProto, String origin) {
        requireAvailable();
        boolean secure = nativeSecure || IpUtils.isTrustedProxy(remoteAddress) && "https".equalsIgnoreCase(forwardedProto);
        if (!secure) throw new ServiceException("客户门户仅允许HTTPS访问", 403);
        if (origin != null && !publicUrl.equals(normalizeOrigin(origin))) {
            throw new ServiceException("客户门户请求来源不受信任", 403);
        }
    }

    private static String normalizeOrigin(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            URI uri = URI.create(value.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getQuery() != null || uri.getFragment() != null || uri.getPort() == 0 || uri.getPort() > 65535
                    || uri.getPath() != null && !uri.getPath().isEmpty() && !uri.getPath().equals("/")) return null;
            return "https://" + uri.getHost().toLowerCase(java.util.Locale.ROOT)
                    + (uri.getPort() == -1 || uri.getPort() == 443 ? "" : ":" + uri.getPort());
        } catch (IllegalArgumentException invalid) {
            return null;
        }
    }
}
